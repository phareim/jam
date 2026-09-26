/**
 * The recorder, and the one door the instruments play through.
 *
 * Playing
 *   `play(instrument, { midi } | { hit }, vel)` sounds a note on the
 *   instrument's target (`target(i)`: the armed track when it is of the
 *   instrument's kind, else the instrument's sound for a new track, which
 *   the header's picker sets) and returns a handle whose release() ends it.
 *
 * Recording (REC in the transport sets `useJam().recording`)
 *   Once the count-in is over, every note an instrument starts is captured
 *   at `positionAt(heardTime(latency offset))`, the place in the music the
 *   player heard when they played it, and its release sets the length.
 *   A pass ends when the heard playhead leaves the range (the loop's wrap,
 *   the punch range's end, a seek) and when REC goes off; each pass is
 *   written into the track right away (utils/takes.ts: cut at the range
 *   end, quantized, OVERDUB merge or REPLACE of what the pass went through;
 *   a pass with no notes changes nothing), so overdub passes stack and the
 *   grid shows them. The whole take is one
 *   undo step: the first pass commits, later ones amend it (unless another
 *   edit came between). Notes for no armed track make a new track of the
 *   instrument (source 'played', entering at the current intensity), which
 *   is then armed.
 *
 * Settings (localStorage 'jam.rec'): mode OVERDUB / REPLACE, quantize OFF /
 * 1/16 / 1/8 / 1/8T at a strength (drums always 1/16), range LOOP or the
 * bar selection (punch in and out), and a latency offset in ms added to
 * what the device reports.
 */
import { reactive, watch } from 'vue'
import type { BarPlan, DrumHit, KitId, Layer, LiveNote, VoiceId } from '~/radio/engine/types.ts'
import type { Instrument, Piece } from '~/radio/engine/piece/types.ts'
import * as E from '~/utils/edits.ts'
import { takeBars } from '~/utils/takes.ts'
import type { Capture, Pos, Range, TakeNote } from '~/utils/takes.ts'
import { load, save } from './storage'

export type Quantize = 'off' | '16' | '8' | '8t'
export interface RecSettings {
  mode: 'overdub' | 'replace'
  quantize: Quantize
  /** 0..1 */
  strength: number
  range: 'loop' | 'selection'
  /** Added to the device's reported output latency, ms. */
  offsetMs: number
}

export interface Target { layer: Layer; voice?: VoiceId; kit?: KitId; trackId?: string }

const LS_REC = 'jam.rec'
const LS_SOUNDS = 'jam.sounds'
const GRID: Record<Quantize, number> = { off: 0, 16: 1, 8: 2, '8t': 4 / 3 }
export const QUANTIZE_LABEL: Record<Quantize, string> = { off: 'OFF', 16: '1/16', 8: '1/8', '8t': '1/8T' }
export const OFFSET_MIN = -100
export const OFFSET_MAX = 250

const DEFAULTS: RecSettings = { mode: 'overdub', quantize: '16', strength: 1, range: 'loop', offsetMs: 0 }
const settings = reactive<RecSettings>({ ...DEFAULTS })
/** The sound each instrument plays when no track of its kind is armed. */
const sounds = reactive<Partial<Record<Instrument, string>>>({})

interface Entry {
  cap: Capture
  instrument: Instrument
  /** The track id, or 'new:<instrument>' for the track the take makes. */
  target: string
  kit: boolean
  layer: Layer
  voice?: VoiceId
  kitId?: KitId
  /** Written by a pass already: a later release changes nothing. */
  done: boolean
}

// ---- one take's state ------------------------------------------------------------------------

let active = false
let takeN = 0
let range: Range = { from: 0, to: 0 }
/** Loop steps where the current pass began hearing the range; null between passes. */
let passStart: number | null = null
let lastBar = -1
let pending: Entry[] = []
const carry = new Map<string, TakeNote[]>()
const created = new Map<Instrument, string>()
let mark: { depth: number } | null = null

let jam: ReturnType<typeof useJam> | null = null
let installed = false

function offsetSec(): number { return settings.offsetMs / 1000 }
function inRange(lb: number): boolean { return lb >= range.from && lb <= range.to }

/** The heard position now, if it is inside the range (a note a moment before the range's first bar counts from it). */
function capturePos(): Pos | null {
  const j = jam!
  if (!j.playing.value) return null
  const t = j.heardTime(offsetSec())
  const p = j.positionAt(t)
  if (!p) return null
  if (p.loopBar >= 0 && inRange(p.loopBar)) return p
  if (p.step >= 15) {
    const q = j.positionAt(t + 0.12)
    if (q && q.abs === p.abs + 1 && q.loopBar >= 0 && inRange(q.loopBar)) return { abs: q.abs, loopBar: q.loopBar, step: p.step - 16 }
  }
  return null
}

function heardPos(): Pos | null {
  const j = jam!
  if (!j.context()) return null
  return j.positionAt(j.heardTime(offsetSec()))
}

function startTake(): void {
  const j = jam!
  active = true
  takeN++
  const n = j.loopBars()
  const sel = j.selection.value
  range = settings.range === 'selection' && sel ? { from: sel.from, to: sel.to } : { from: 0, to: n - 1 }
  passStart = null
  lastBar = -1
  pending = []
  carry.clear()
  created.clear()
  mark = null
  // REC while the loop plays: the pass starts where the player is now.
  const p = j.playing.value && !j.position.count ? heardPos() : null
  if (p && p.loopBar >= 0 && inRange(p.loopBar)) {
    passStart = p.loopBar * 16 + p.step
    lastBar = p.loopBar
  }
}

function endTake(): void {
  if (!active) return
  const p = heardPos()
  // Bars that have started sounding but whose heard-time callback is still waiting: hear them now.
  for (const q of queue.splice(0)) {
    clearTimeout(q.timer)
    if (p && p.abs >= q.plan.index) heardBar(q.plan, takeN)
  }
  let spanEnd = lastBar >= 0 ? (lastBar + 1) * 16 : 0
  let until: Pos | null = null
  if (p && p.loopBar >= 0 && inRange(p.loopBar)) {
    until = p
    if (p.loopBar === lastBar || lastBar < 0) spanEnd = p.loopBar * 16 + p.step
  }
  commitPass(Infinity, spanEnd, until)
  active = false
  passStart = null
  pending = []
  carry.clear()
}

/** A bar as the player hears it (called latency + offset after it starts). */
function heardBar(plan: BarPlan, n: number): void {
  if (!active || n !== takeN) return
  const lb = plan.meta.loopBar
  const inside = lb !== undefined && lb >= 0 && inRange(lb)
  if (passStart !== null && (!inside || lb !== lastBar + 1)) {
    commitPass(plan.index, (lastBar + 1) * 16, null)
    passStart = null
  }
  if (inside) {
    if (passStart === null) passStart = lb! * 16
    lastBar = lb!
  }
}

const queue: Array<{ plan: BarPlan; timer: ReturnType<typeof setTimeout> }> = []

function onPlayerBar(plan: BarPlan): void {
  if (!active) return
  const j = jam!
  const delay = Math.max(0, (j.player.value?.latency ?? 0) + offsetSec()) * 1000 + 40
  const n = takeN
  const q = {
    plan,
    timer: setTimeout(() => {
      const i = queue.indexOf(q)
      if (i >= 0) queue.splice(i, 1)
      heardBar(plan, n)
    }, delay),
  }
  queue.push(q)
}

/**
 * Write the captures that started before absolute bar `boundary` (and what
 * the last pass carried over the loop end) into their tracks. Held notes
 * end at `until`, or at the range end.
 */
function commitPass(boundary: number, spanEnd: number, until: Pos | null): void {
  const j = jam!
  const mine = pending.filter(e => e.cap.at.abs < boundary)
  pending = pending.filter(e => e.cap.at.abs >= boundary)
  for (const e of mine) e.done = true
  const targets = new Set<string>([...mine.map(e => e.target), ...carry.keys()])
  if (!targets.size) return
  const firstStart = mine.length ? Math.min(...mine.map(e => e.cap.at.loopBar * 16 + e.cap.at.step)) : spanEnd
  const span = { from: Math.max(range.from * 16, Math.min(passStart ?? firstStart, firstStart)), to: spanEnd }
  let next: Piece = j.piece.value
  let changed = false
  for (const target of targets) {
    const group = mine.filter(e => e.target === target)
    const kit = group[0]?.kit ?? target.startsWith('new:drums')
    let id = target
    if (target.startsWith('new:')) {
      const inst = target.slice(4) as Instrument
      id = created.get(inst) ?? ''
      if (!next.tracks.some(t => t.id === id)) {
        if (!group.length) continue
        if (next.tracks.length >= 24) { j.say('24 TRACKS IS THE MOST', 'warn'); continue }
        const g = group[0]!
        const t = E.newTrack(next, { instrument: inst, layer: g.layer, voice: g.voice, kit: g.kitId, source: 'played', enter: next.intensity })
        next = { ...next, tracks: [...next.tracks, t] }
        id = t.id
        created.set(inst, id)
      }
    }
    const track = next.tracks.find(t => t.id === id)
    if (!track) continue
    const r = takeBars(track.bars, !!track.kit, group.map(e => e.cap), {
      loopBars: E.loopBars(next),
      range,
      mode: settings.mode,
      grid: track.kit ? 1 : GRID[settings.quantize],
      strength: settings.strength,
      span,
    }, { carry: carry.get(target), until })
    carry.set(target, r.carry)
    if (!r.count) continue
    next = E.setBars(next, id, 0, r.bars)
    changed = true
  }
  if (!changed) return
  const newId = [...created.values()].find(id => next.tracks.some(t => t.id === id) && !j.piece.value.tracks.some(t => t.id === id))
  if (mark && mark.depth === j.history.undo && j.history.redo === 0) j.amend(next)
  else j.commit(next, 'record')
  mark = { depth: j.history.undo }
  if (newId && j.armed.value !== newId) j.arm(newId)
}

function install(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  jam = useJam()
  Object.assign(settings, sanitize(load<Partial<RecSettings>>(LS_REC, {})))
  Object.assign(sounds, load<Partial<Record<Instrument, string>>>(LS_SOUNDS, {}))
  watch(settings, s => save(LS_REC, { ...s }), { deep: true })
  jam.onBar(onPlayerBar)
  watch(jam.recording, (on) => { if (on) startTake(); else endTake() }, { flush: 'sync' })
  if (jam.recording.value) startTake()
  if (import.meta.dev) (window as unknown as Record<string, unknown>).__rec = { settings, sounds, target, play }
}

function sanitize(s: Partial<RecSettings>): RecSettings {
  const out = { ...DEFAULTS }
  if (s.mode === 'overdub' || s.mode === 'replace') out.mode = s.mode
  if (s.quantize && s.quantize in GRID) out.quantize = s.quantize
  if (typeof s.strength === 'number' && s.strength >= 0 && s.strength <= 1) out.strength = s.strength
  if (s.range === 'loop' || s.range === 'selection') out.range = s.range
  if (typeof s.offsetMs === 'number' && Number.isFinite(s.offsetMs)) out.offsetMs = Math.max(OFFSET_MIN, Math.min(OFFSET_MAX, Math.round(s.offsetMs)))
  return out
}

// ---- playing -----------------------------------------------------------------------------------

/** What an instrument plays now: the armed track of its kind, else its chosen sound (else the default). */
function target(i: Instrument): Target {
  const t = useJam().targetFor(i)
  if (t.trackId) return t
  const s = sounds[i]
  if (s) return i === 'drums' ? { layer: t.layer, kit: s as KitId } : { layer: t.layer, voice: s as VoiceId }
  return t
}

/** Pick the instrument's sound: the armed track's voice/kit, or the sound for a new track. */
function setSound(i: Instrument, id: string): void {
  const j = useJam()
  const t = j.targetFor(i)
  if (t.trackId) j.updateTrack(t.trackId, i === 'drums' ? { kit: id as KitId } : { voice: id as VoiceId })
  else {
    sounds[i] = id
    save(LS_SOUNDS, { ...sounds })
  }
}

const NOOP: LiveNote = { release() {} }

/** Sound a note on the instrument's target (and capture it while recording). */
function play(i: Instrument, what: { midi: number } | { hit: DrumHit }, vel: number, pan?: number): LiveNote {
  install()
  const j = jam!
  const t = target(i)
  const v = Math.max(0.05, Math.min(1, vel))
  let note: LiveNote = NOOP
  if (t.kit && 'hit' in what) note = j.live(t.layer, { kit: t.kit, hit: what.hit }, v, pan)
  else if (t.voice && 'midi' in what) note = j.live(t.layer, { voice: t.voice, midi: what.midi }, v, pan)
  else return NOOP
  let entry: Entry | null = null
  if (active && j.recording.value) {
    const at = capturePos()
    if (at) {
      entry = {
        cap: { at, end: null, vel: v, ...('hit' in what ? { hit: what.hit } : { midi: what.midi }) },
        instrument: i,
        target: t.trackId ?? `new:${i}`,
        kit: !!t.kit,
        layer: t.layer,
        voice: t.voice,
        kitId: t.kit,
        done: false,
      }
      pending.push(entry)
    }
  }
  return {
    release() {
      note.release()
      if (entry && !entry.done && !entry.cap.end) {
        const p = heardPos()
        entry.cap.end = p ?? { ...entry.cap.at, step: entry.cap.at.step + 0.5 }
      }
    },
  }
}

export function useRecorder() {
  install()
  return { settings, sounds, target, setSound, play, install }
}
