/**
 * Pure edits on a piece: every function takes a Piece and returns a new one
 * (or a value) and never touches its input. useJam() wraps each in one undo
 * step; the node tests run them directly (tests/edits.test.ts).
 *
 * Relative `.ts` imports so Node runs this file with type stripping; Vite
 * bundles it unchanged.
 */
import type { Instrument, Piece, PieceNote, Track } from '../radio/engine/piece/types.ts'
import { PIECE_PHRASE_BARS } from '../radio/engine/piece/types.ts'
import { formatDrumBar, formatNoteBar, parseDrumBar, parseNoteBar } from '../radio/engine/piece/notation.ts'
import { INSTRUMENT_DEFAULTS, phraseChords } from '../radio/engine/piece/library.ts'
import { MAX_TRACKS } from '../radio/engine/piece/validate.ts'
import type { Groove } from '../radio/engine/types.ts'

/** Bars of several tracks: `from`..`to` are loop bars, both inclusive; trackIds in the piece's order. */
export interface BarSelection {
  trackIds: string[]
  from: number
  to: number
}

/** Copied bars, one row per track in selection order. `kit` rows paste only into kit tracks, note rows only into voice tracks. */
export interface Clip {
  rows: Array<{ kit: boolean; bars: string[] }>
}

export const MAX_PHRASES = 4

/** A deep copy that is safe on Vue proxies (the piece is plain JSON). */
export function clonePiece(p: Piece): Piece {
  return JSON.parse(JSON.stringify(p)) as Piece
}

export function loopBars(p: Piece): number {
  return p.phrases * PIECE_PHRASE_BARS
}

/** The phrase (0-based) a loop bar belongs to. */
export function phraseOf(bar: number): number {
  return Math.floor(bar / PIECE_PHRASE_BARS)
}

/** A fresh piece id: 'p-' and six hex digits. */
export function newPieceId(): string {
  return 'p-' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
}

/** A selection clamped to the loop, bars ordered, unknown tracks dropped and the rest in piece order; null when empty. */
export function normSelection(p: Piece, sel: BarSelection | null | undefined): BarSelection | null {
  if (!sel) return null
  const n = loopBars(p)
  const a = Math.max(0, Math.min(n - 1, Math.min(sel.from, sel.to)))
  const b = Math.max(0, Math.min(n - 1, Math.max(sel.from, sel.to)))
  const want = new Set(sel.trackIds)
  const trackIds = p.tracks.filter(t => want.has(t.id)).map(t => t.id)
  if (!trackIds.length) return null
  return { trackIds, from: a, to: b }
}

/** Copy the selected bars. */
export function copyBars(p: Piece, sel: BarSelection): Clip | null {
  const s = normSelection(p, sel)
  if (!s) return null
  const rows = s.trackIds.map((id) => {
    const t = p.tracks.find(x => x.id === id)!
    return { kit: !!t.kit, bars: t.bars.slice(s.from, s.to + 1) }
  })
  return { rows }
}

/**
 * Paste a clip from loop bar `from`: row i goes into trackIds[i], and when
 * the clip has more rows than targets, into the tracks after the last target
 * in piece order. Rows skip tracks of the other kind (drum bars never land in
 * a note track). Bars past the loop end are dropped.
 */
export function pasteBars(p: Piece, clip: Clip, trackIds: string[], from: number): Piece {
  const out = clonePiece(p)
  const n = loopBars(out)
  const order = out.tracks.map(t => t.id)
  const targets = [...trackIds]
  const lastIdx = Math.max(-1, ...targets.map(id => order.indexOf(id)))
  for (let i = lastIdx + 1; i < order.length && targets.length < clip.rows.length; i++) targets.push(order[i]!)
  clip.rows.forEach((row, i) => {
    const t = out.tracks.find(x => x.id === targets[i])
    if (!t || !!t.kit !== row.kit) return
    row.bars.forEach((b, j) => {
      const at = from + j
      if (at >= 0 && at < n) t.bars[at] = b
    })
  })
  return out
}

/** Empty the selected bars. */
export function clearBars(p: Piece, sel: BarSelection): Piece {
  const s = normSelection(p, sel)
  if (!s) return p
  const out = clonePiece(p)
  for (const id of s.trackIds) {
    const t = out.tracks.find(x => x.id === id)!
    for (let b = s.from; b <= s.to; b++) t.bars[b] = ''
  }
  return out
}

/** Write bars into a track from loop bar `from` (bars past the loop end are dropped). */
export function setBars(p: Piece, trackId: string, from: number, bars: string[]): Piece {
  const out = clonePiece(p)
  const t = out.tracks.find(x => x.id === trackId)
  if (!t) return p
  const n = loopBars(out)
  bars.forEach((b, j) => {
    const at = from + j
    if (at >= 0 && at < n) t.bars[at] = b
  })
  return out
}

/**
 * Change the loop length. A new phrase copies the last phrase's chords and
 * gives every track empty bars; removing phrases drops their bars.
 */
export function setPhrases(p: Piece, phrases: number): Piece {
  const n = Math.max(1, Math.min(MAX_PHRASES, Math.round(phrases))) as Piece['phrases']
  if (n === p.phrases) return p
  const out = clonePiece(p)
  const chords = out.chords.slice(0, n)
  while (chords.length < n) chords.push(chords[chords.length - 1] ?? '1')
  out.chords = chords
  const bars = n * PIECE_PHRASE_BARS
  for (const t of out.tracks) {
    t.bars = t.bars.slice(0, bars)
    while (t.bars.length < bars) t.bars.push('')
  }
  out.phrases = n
  return out
}

/** Insert a copy of a phrase (chords and every track's bars) right after it; null when the loop is full. */
export function dupPhrase(p: Piece, phrase: number): Piece | null {
  if (p.phrases >= MAX_PHRASES || phrase < 0 || phrase >= p.phrases) return null
  const out = clonePiece(p)
  out.chords.splice(phrase + 1, 0, out.chords[phrase]!)
  const at = (phrase + 1) * PIECE_PHRASE_BARS
  for (const t of out.tracks) {
    const copy = t.bars.slice(phrase * PIECE_PHRASE_BARS, at)
    t.bars.splice(at, 0, ...copy)
  }
  out.phrases = (p.phrases + 1) as Piece['phrases']
  return out
}

/**
 * Change the default bars per chord and relay each progression over exactly
 * eight bars at the new length, so '1 6 4 5' at two bars a chord becomes
 * '1 6 4 5 1 6 4 5' at one (tokens with ':n' keep their length).
 */
export function setChordBars(p: Piece, chordBars: 1 | 2): Piece {
  if ((p.chordBars ?? 2) === chordBars) return p
  const out = clonePiece(p)
  const key = { tonic: p.tonic, mode: p.mode }
  out.chords = out.chords.map(c => phraseChords(c, chordBars, key, chordBars))
  out.chordBars = chordBars
  return out
}

/** A track id from a name, unique in the piece: 'keys', 'keys-2', ... */
export function uniqueTrackId(p: Piece, base: string): string {
  const slug = (base.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'track').slice(0, 26)
  const used = new Set(p.tracks.map(t => t.id))
  if (!used.has(slug)) return slug
  for (let i = 2; ; i++) {
    const id = `${slug}-${i}`
    if (!used.has(id)) return id
  }
}

const INSTRUMENT_NAMES: Record<Instrument, string> = { piano: 'Piano', guitar: 'Guitar', bass: 'Bass', drums: 'Drums', touch: 'Touch' }

/**
 * A new empty track for an instrument (voice, kit and layer from
 * INSTRUMENT_DEFAULTS unless given), entering at level 0, with a unique id.
 */
export function newTrack(p: Piece, init: Partial<Track> & { instrument?: Instrument } = {}): Track {
  const instrument = init.instrument ?? (init.kit ? 'drums' : 'piano')
  const def = INSTRUMENT_DEFAULTS[instrument]
  const name = init.name ?? INSTRUMENT_NAMES[instrument]
  const t: Track = {
    id: init.id && !p.tracks.some(x => x.id === init.id) ? init.id : uniqueTrackId(p, init.id ?? name),
    name,
    layer: init.layer ?? def.layer,
    instrument,
    enter: init.enter ?? 0,
    source: init.source ?? 'played',
    bars: fitBars(init.bars ?? [], loopBars(p)),
  }
  if (init.kit || (!init.voice && def.kit)) t.kit = init.kit ?? def.kit
  else t.voice = init.voice ?? def.voice
  if (init.gain !== undefined) t.gain = init.gain
  if (init.mute) t.mute = true
  if (init.solo) t.solo = true
  return t
}

/** Bars padded with '' or cut to the loop length. */
export function fitBars(bars: string[], n: number): string[] {
  const out = bars.slice(0, n)
  while (out.length < n) out.push('')
  return out
}

/**
 * Add tracks (from growing, the library, Opus): ids made unique, bars fitted
 * to the loop, at most MAX_TRACKS in all. Returns the piece and the ids added.
 */
export function addTracks(p: Piece, tracks: Track[]): { piece: Piece; ids: string[] } {
  const out = clonePiece(p)
  const ids: string[] = []
  for (const t of tracks) {
    if (out.tracks.length >= MAX_TRACKS) break
    const id = t.id && /^[A-Za-z0-9_-]{1,32}$/.test(t.id) && !out.tracks.some(x => x.id === t.id) ? t.id : uniqueTrackId(out, t.id || t.name)
    out.tracks.push({ ...JSON.parse(JSON.stringify(t)) as Track, id, bars: fitBars(t.bars ?? [], loopBars(out)) })
    ids.push(id)
  }
  return { piece: out, ids }
}

/** Overdub: the notes (or hits) of `b` added to those of `a`. Bars that do not parse are taken as empty. */
export function mergeBar(kit: boolean, a: string, b: string): string {
  if (!a.trim()) return b
  if (!b.trim()) return a
  if (kit) {
    const ga = parseDrumBar(a)
    const gb = parseDrumBar(b)
    const A: Groove = 'error' in ga ? {} : ga.groove
    const B: Groove = 'error' in gb ? {} : gb.groove
    const out: Groove = { ...A }
    for (const [hit, row] of Object.entries(B) as Array<[keyof Groove, string]>) {
      const prev = out[hit]
      if (!prev) { out[hit] = row; continue }
      let merged = ''
      for (let s = 0; s < 16; s++) {
        const x = prev[s]!
        const y = row[s]!
        // The stronger hit wins: X over x over g; a riser hold only where nothing hits.
        const rank = (c: string) => ({ X: 4, x: 3, g: 2, '-': 1 } as Record<string, number>)[c] ?? 0
        merged += rank(y) > rank(x) ? y : x
      }
      out[hit] = merged
    }
    return formatDrumBar(out)
  }
  const na = parseNoteBar(a)
  const nb = parseNoteBar(b)
  const notes: PieceNote[] = [...('error' in na ? [] : na.notes), ...('error' in nb ? [] : nb.notes)]
  return formatNoteBar(notes)
}
