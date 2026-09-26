/**
 * Recorded takes, pure: what the recorder captured (positions in the music)
 * turned into bar strings of a track. composables/useRecorder.ts does the
 * listening and timing; this file does the arithmetic, and
 * tests/recorder.test.ts runs it in Node.
 *
 * Positions
 *   A capture's start and end are player positions { abs, loopBar, step }:
 *   abs is the absolute bar index (BarPlan.index), loopBar the loop bar it
 *   played, step 0..16. Lengths come from abs positions, so a note held over
 *   bar lines (or a seek) keeps its real length; where it starts comes from
 *   loopBar. A start may be a little below 0 (a note played just before the
 *   range's first bar); quantizing pulls it in, else it is clamped.
 *   Inside a take everything is in loop steps: bar * 16 + step.
 *
 * Rules
 *   - Only the range counts (the loop, or the punch range); a note up to a
 *     sixteenth before it counts from its first step. A note held past
 *     the range's end is cut there, and so is a note still held when a pass
 *     is committed.
 *   - Quantize: pitched notes to the setting (off, 1/16, 1/8, 1/8T) at a
 *     strength; drum hits always to sixteenths. A start that lands on the
 *     loop's end goes to bar 0 of the next pass (returned as `carry`); on a
 *     punch range's end it is dropped.
 *   - A note keeps its length across bar lines (len may pass the bar end).
 *   - OVERDUB adds to what is there (the same pitch on the same step is
 *     replaced; drum hits: the stronger wins). REPLACE first clears what
 *     starts inside the span the take passed, then adds.
 */
import type { DrumHit, Groove } from '../radio/engine/types.ts'
import type { PieceNote } from '../radio/engine/piece/types.ts'
import { formatDrumBar, formatNoteBar, parseDrumBar, parseNoteBar, quantize } from '../radio/engine/piece/notation.ts'
import { mergeBar } from './edits.ts'

export interface Pos {
  abs: number
  loopBar: number
  step: number
}

export interface Capture {
  at: Pos
  /** Where it was let go; null while held. */
  end: Pos | null
  midi?: number
  hit?: DrumHit
  /** 0..1 */
  vel: number
}

/** A note or hit in loop steps. */
export interface TakeNote {
  start: number
  len: number
  midi?: number
  hit?: DrumHit
  vel: number
}

/** Loop bars, both inclusive. */
export interface Range {
  from: number
  to: number
}

/** Grid in steps: 0 = off, 1 = 1/16, 2 = 1/8, 4/3 = 1/8 triplets. */
export type Grid = number

export interface TakeOpts {
  loopBars: number
  range: Range
  mode: 'overdub' | 'replace'
  grid: Grid
  /** 0..1, pitched notes only. */
  strength: number
  /** REPLACE clears events starting in [from, to) (loop steps): the part of the range this pass went through. */
  span?: { from: number; to: number }
}

const STEPS = 16
const MAX_LEN = 256
const r2 = (x: number) => Math.round(x * 100) / 100

/** Absolute position in steps. */
export function absSteps(p: Pos): number {
  return p.abs * STEPS + p.step
}

/**
 * A capture as a take note: start in loop steps, length from its end (or
 * `until` when still held; without either it runs to the range end), cut at
 * the range end. Null when it starts past the range.
 */
export function captureToNote(c: Capture, range: Range, until?: Pos | null): TakeNote | null {
  const start = c.at.loopBar * STEPS + c.at.step
  const limit = (range.to + 1) * STEPS
  if (start >= limit) return null
  const end = c.end ?? until ?? null
  let len = end ? absSteps(end) - absSteps(c.at) : limit - start
  if (!(len > 0)) len = 0.25
  len = Math.min(len, limit - start)
  return { start, len, midi: c.midi, hit: c.hit, vel: c.vel }
}

/**
 * Quantize and place a take's notes in the range. Returns what lands in the
 * range and what wrapped past the loop's end (for the next pass, from 0).
 */
export function placeNotes(notes: TakeNote[], opts: Pick<TakeOpts, 'loopBars' | 'range' | 'grid' | 'strength'>, kit: boolean): { notes: TakeNote[]; carry: TakeNote[] } {
  const from = opts.range.from * STEPS
  const limit = (opts.range.to + 1) * STEPS
  const loopEnd = opts.loopBars * STEPS
  const out: TakeNote[] = []
  const carry: TakeNote[] = []
  for (const n of notes) {
    // Before the range: only a note played a moment early (under a sixteenth) comes in.
    if (n.start < from - 1) continue
    let start: number
    let len: number
    if (kit) {
      start = Math.round(n.start)
      len = Math.max(1, Math.round(n.len))
    } else if (opts.grid > 0) {
      const q = quantize([{ step: n.start, len: n.len, midi: 0, vel: 0 }], opts.grid, opts.strength)[0]!
      start = q.step
      len = q.len
      // quantize() clamps at 0; a start below the range comes in to its first step.
    } else {
      start = r2(n.start)
      len = Math.max(0.01, r2(n.len))
    }
    if (start < from) start = from
    if (start >= limit) {
      if (limit === loopEnd && opts.range.from === 0) carry.push({ ...n, start: start - loopEnd, len: Math.min(len, loopEnd) })
      continue
    }
    len = Math.min(len, limit - start, MAX_LEN)
    out.push({ ...n, start, len: Math.max(0.01, r2(len)) })
  }
  return { notes: out, carry }
}

/** The drum char for a velocity: accent, hit or ghost. */
export function hitChar(vel: number): 'X' | 'x' | 'g' {
  return vel >= 0.9 ? 'X' : vel < 0.45 ? 'g' : 'x'
}

/** Remove events that start inside [from, to) (loop steps) from bar `b`. */
function clearSpan(kit: boolean, bar: string, b: number, from: number, to: number): string {
  const inside = (s: number) => b * STEPS + s >= from && b * STEPS + s < to
  if (!bar.trim()) return bar
  if (kit) {
    const g = parseDrumBar(bar)
    if ('error' in g) return bar
    const out: Groove = {}
    for (const [hit, row] of Object.entries(g.groove) as Array<[DrumHit, string]>) {
      let r = ''
      for (let s = 0; s < STEPS; s++) r += inside(s) ? '.' : row[s]!
      // A riser's hold without its hit is a rest.
      r = r.replace(/(^|\.)(-+)/g, (_m, a: string, run: string) => a + '.'.repeat(run.length))
      out[hit] = r
    }
    return formatDrumBar(out)
  }
  const p = parseNoteBar(bar)
  if ('error' in p) return bar
  return formatNoteBar(p.notes.filter(n => !inside(n.step)))
}

/** New bar strings for bars touched by the notes: note bars or drum bars. */
function barsOf(kit: boolean, notes: TakeNote[]): Map<number, string> {
  const per = new Map<number, TakeNote[]>()
  for (const n of notes) {
    let b = Math.floor(n.start / STEPS)
    let step = r2(n.start - b * STEPS)
    if (step >= STEPS) { b++; step = 0 }
    const list = per.get(b) ?? []
    list.push({ ...n, start: step })
    per.set(b, list)
  }
  const out = new Map<number, string>()
  for (const [b, list] of per) {
    if (kit) {
      const g: Groove = {}
      for (const n of list) {
        if (!n.hit) continue
        const s = Math.min(STEPS - 1, Math.round(n.start))
        const row = (g[n.hit] ?? '.'.repeat(STEPS)).split('')
        const c = hitChar(n.vel)
        const rank = (x: string) => ({ X: 3, x: 2, g: 1 } as Record<string, number>)[x] ?? 0
        if (rank(c) > rank(row[s]!)) row[s] = c
        if (n.hit === 'z') for (let k = s + 1; k < Math.min(STEPS, s + Math.round(n.len)); k++) if (row[k] === '.') row[k] = '-'
        g[n.hit] = row.join('')
      }
      out.set(b, formatDrumBar(g))
    } else {
      const notes: PieceNote[] = list.filter(n => n.midi !== undefined).map(n => ({ step: n.start, midi: n.midi!, len: n.len, vel: n.vel }))
      out.set(b, formatNoteBar(notes))
    }
  }
  return out
}

/** Overdub one bar: new notes replace old ones of the same pitch on the same step. */
function overdub(kit: boolean, old: string, add: string): string {
  if (kit) return mergeBar(true, old, add)
  const a = parseNoteBar(old)
  const b = parseNoteBar(add)
  const olds = 'error' in a ? [] : a.notes
  const news = 'error' in b ? [] : b.notes
  const keep = olds.filter(o => !news.some(n => n.midi === o.midi && Math.abs(n.step - o.step) < 0.01))
  return formatNoteBar([...keep, ...news])
}

/**
 * Write placed notes into a track's bars (a new array; the input is not
 * touched): REPLACE clears the span first, then the notes go in.
 */
export function writeNotes(bars: string[], kit: boolean, notes: TakeNote[], opts: Pick<TakeOpts, 'mode' | 'span'>): string[] {
  const out = [...bars]
  if (opts.mode === 'replace' && opts.span && opts.span.to > opts.span.from) {
    const { from, to } = opts.span
    for (let b = Math.floor(from / STEPS); b < Math.ceil(to / STEPS) && b < out.length; b++) {
      if (b >= 0) out[b] = clearSpan(kit, out[b] ?? '', b, from, to)
    }
  }
  for (const [b, bar] of barsOf(kit, notes)) {
    if (b < 0 || b >= out.length) continue
    out[b] = overdub(kit, out[b] ?? '', bar)
  }
  return out
}

/**
 * One pass of a take into a track: captures → notes (cut at the range end,
 * held ones at `until`) plus what the last pass carried over the loop's end,
 * quantized, placed and written. Returns the bars and the new carry.
 */
export function takeBars(
  bars: string[],
  kit: boolean,
  captures: Capture[],
  opts: TakeOpts,
  extra: { carry?: TakeNote[]; until?: Pos | null } = {},
): { bars: string[]; carry: TakeNote[]; count: number } {
  const raw = captures.map(c => captureToNote(c, opts.range, extra.until)).filter((n): n is TakeNote => !!n)
  const placed = placeNotes(raw, opts, kit)
  const notes = [...(extra.carry ?? []), ...placed.notes]
  if (!notes.length && opts.mode === 'overdub') return { bars, carry: placed.carry, count: 0 }
  return { bars: writeNotes(bars, kit, notes, opts), carry: placed.carry, count: notes.length }
}
