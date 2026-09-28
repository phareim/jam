/**
 * jam's session state, client-only (JamApp is a .client component): the
 * piece, its undo history, the transport and the player. One instance per
 * page (module state); every component calls useJam() and gets the same.
 *
 * The piece
 *   `piece` is a shallowRef holding a plain Piece that is NEVER mutated in
 *   place: every edit builds a new piece (utils/edits.ts) and goes through
 *   commit(), which pushes one undo snapshot (JSON, max 100), hands the piece
 *   to the conductor (it plays from the next bar) and schedules the local
 *   autosave (localStorage 'jam.piece', plus the 'jam.pieces' list).
 *   Continuous gestures (dragging BPM, gain) pass a `merge` key so a drag is
 *   one undo step. Intensity is not an undo step. For an edit no named
 *   function covers, use `transact(label, draft => { ...mutate draft... })`.
 *
 * The transport
 *   The player is created on the first PLAY (or the first live note) with
 *   latencyHint 'interactive' and plays a thin wrapper around the piece
 *   conductor (JamConductor below). STOP cuts what is scheduled and idles
 *   the player (no bars planned, live notes still sound); PLAY and SEEK
 *   seek the piece conductor and start a fresh bar at once. The audio
 *   suspends after a minute with nothing played.
 *
 * Hooks for the recorder and the instruments
 *   - `live(layer, sound, vel, pan?)`: play a note now; starts the audio from
 *     the gesture if needed. Returns a handle whose release() ends the note.
 *   - `player` (shallowRef) and `context()`: the RadioPlayer and its AudioContext.
 *   - `heardTime(offset = 0)`: ac.currentTime - player.latency - offset, the
 *     audio-clock time of what the listener hears now.
 *   - `positionAt(time)`: { abs, loopBar, step } of an audio time; loopBar is
 *     -1 during count-in. Notes wrapping the loop end: the
 *     recorder maps them itself (loopBar is already modulo the loop).
 *   - `onBar(cb)`: every bar as it starts sounding (plan.meta.loopBar set for loop bars).
 *   - `position`: reactive { bar, step, abs, count } updated per animation
 *     frame; bar -1 when stopped. Read `.bar` alone to re-render once a bar.
 *   - `targetFor(instrument)`: the layer and voice/kit to play (the armed track's, else the default).
 *   - `currentChord()`, `chordAt(loopBar, step)`, `scale()`, `key()`.
 *   - `armed` (track id or null), `recording` (the REC button; the recorder
 *     watches it and commits with setBars / transact), `countIn`, `click`,
 *     `instrument` (the dock's active tab).
 *   - `selection` { trackIds, from, to } (loop bars, inclusive) and `clipboard`.
 *   - `amend(next)`: change the piece inside the last undo step (the
 *     recorder's later passes of one take).
 */
import { computed, reactive, ref, shallowRef } from 'vue'
import type { BarPlan, Chord, ConductorLike, DrumEvent, Key, KitId, Landscape, Layer, LiveNote, LiveSound, Mode, RadioPlayer, VoiceId } from '~/radio/engine/types.ts'
import { BUILTIN, LANDSCAPES } from '~/radio/engine/landscapes/index.ts'
import { parseProgression, scalePcs } from '~/radio/engine/theory.ts'
import { createPlayer } from '~/radio/engine/audio/player.ts'
import { createPieceConductor } from '~/radio/engine/piece/conductor.ts'
import type { PieceConductor } from '~/radio/engine/piece/conductor.ts'
import { chordAt as pieceChordAt } from '~/radio/engine/piece/chords.ts'
import { validatePiece } from '~/radio/engine/piece/validate.ts'
import { emptyPiece, INSTRUMENT_DEFAULTS } from '~/radio/engine/piece/library.ts'
import { growLadder } from '~/radio/engine/piece/grow.ts'
import { PIECE_PHRASE_BARS } from '~/radio/engine/piece/types.ts'
import type { Instrument, Level, Piece, Track } from '~/radio/engine/piece/types.ts'
import * as E from '~/utils/edits.ts'
import type { BarSelection, Clip } from '~/utils/edits.ts'
import { load, save } from './storage'


const LS_PIECE = 'jam.piece'
const LS_PIECES = 'jam.pieces'
const LS_PREFS = 'jam.prefs'
const MAX_UNDO = 100
const MAX_LOCAL = 40
const MERGE_MS = 1500
const SUSPEND_MS = 60_000
const VOLUME = 0.85
export const INSTRUMENTS: readonly Instrument[] = ['piano', 'guitar', 'bass', 'drums', 'touch']

interface Prefs { space: number; grit: number; click: boolean; countIn: boolean; instrument: Instrument }
interface LocalEntry { id: string; name: string; updatedAt: number; piece: Piece }
type Tone = 'info' | 'warn' | 'gold'

// ---- state -----------------------------------------------------------------------

const piece = shallowRef<Piece>(emptyPiece({ id: 'untitled' }))
const undoStack: Array<{ json: string; label: string }> = []
const redoStack: Array<{ json: string; label: string }> = []
const history = reactive({ undo: 0, redo: 0, last: '' })
let lastMerge: { key: string; at: number } | null = null

/** The loop is sounding (or counting in). */
const playing = ref(false)
/** The audio engine runs: playing, or awake for live notes. */
const audible = ref(false)
const recording = ref(false)
const click = ref(false)
const countIn = ref(true)
const controls = reactive({ space: 0.5, grit: 0.3 })
const position = reactive({ bar: -1, step: 0, abs: -1, count: false })
/** Where PLAY starts (loop bar). */
const cursor = ref(0)
const selection = shallowRef<BarSelection | null>(null)
const clipboard = shallowRef<Clip | null>(null)
const armed = ref<string | null>(null)
const instrument = ref<Instrument>('piano')
const composed = shallowRef<Landscape[]>([])
const saveState = reactive({ localAt: 0, localRev: 0, remote: 'idle' as 'idle' | 'saving' | 'saved' | 'error', remoteAt: '', remoteRev: -1, rev: 0, error: '' })
const toast = shallowRef<{ text: string; tone: Tone; n: number } | null>(null)

const landscapes = computed<Landscape[]>(() => [...BUILTIN, ...composed.value])

function lookup(id: string): Landscape | undefined {
  return composed.value.find(l => l.id === id) ?? LANDSCAPES[id]
}

// ---- toast -------------------------------------------------------------------------

let toastN = 0
let toastTimer: ReturnType<typeof setTimeout> | null = null
function say(text: string, tone: Tone = 'info'): void {
  toast.value = { text, tone, n: ++toastN }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 2400)
}

// ---- the conductor wrapper ---------------------------------------------------------------

interface JamConductor extends ConductorLike {
  /** 'idle': stopped (the player plans nothing then); 'play': the piece (after `countBars` click bars). */
  mode: 'idle' | 'play'
  countBars: number
  /** The loop bar an absolute bar index played (-1 for count-in), if it was a loop bar. */
  loopBarOf(index: number): number | undefined
  /** The index the next planned bar gets. */
  readonly nextIndex: number
}

function createJamConductor(inner: PieceConductor): JamConductor {
  let abs = 0
  const loopOf = new Map<number, number>()
  // The plan the piece conductor would give next, without moving it on.
  const peek = (): BarPlan => {
    const p = inner.nextBar()
    inner.seek(p.meta.loopBar ?? 0)
    return p
  }
  const remember = (i: number, lb: number) => {
    loopOf.set(i, lb)
    if (loopOf.size > 512) loopOf.delete(loopOf.keys().next().value as number)
  }
  const jc: JamConductor = {
    mode: 'idle',
    countBars: 0,
    nextBar(): BarPlan {
      const index = abs++
      if (jc.mode === 'play' && jc.countBars > 0) {
        jc.countBars--
        const p = peek()
        const drums: DrumEvent[] = [0, 4, 8, 12].map(s => ({ layer: 'perc', kit: 'kit.chip', hit: 'h', step: s, vel: s === 0 ? 1 : 0.6 }))
        remember(index, -1)
        return { ...p, index, notes: [], drums, meta: { ...p.meta, section: 'COUNT', loopBar: undefined, active: [] } }
      }
      if (jc.mode === 'play') {
        const p = inner.nextBar()
        p.index = index
        remember(index, p.meta.loopBar ?? -1)
        return p
      }
      // Stopped, the player is idle and asks for nothing; should a bar be asked for anyway, it is silent.
      const p = peek()
      return { ...p, index, notes: [], drums: [], meta: { ...p.meta, section: 'IDLE', loopBar: undefined, active: [], nextChord: undefined } }
    },
    setControls: c => inner.setControls(c),
    get controls() { return inner.controls },
    loopBarOf: i => loopOf.get(i),
    get nextIndex() { return abs },
  }
  return jc
}

// ---- the player ----------------------------------------------------------------------

let inner: PieceConductor | null = null
let jc: JamConductor | null = null
const player = shallowRef<RadioPlayer | null>(null)
const barListeners = new Set<(plan: BarPlan) => void>()
let suspendTimer: ReturnType<typeof setTimeout> | null = null
let raf = 0

function ensurePlayer(): RadioPlayer {
  if (player.value) return player.value
  inner = createPieceConductor({
    piece: heard(piece.value),
    lookup,
    controls: { intensity: piece.value.intensity, space: controls.space, era: eraOf(controls.grit) },
    click: click.value,
  })
  jc = createJamConductor(inner)
  const pl = createPlayer(jc, { latencyHint: 'interactive' })
  pl.setVolume(VOLUME)
  pl.onBar(onPlayerBar)
  player.value = pl
  if (!raf) raf = requestAnimationFrame(frame)
  return pl
}

function onPlayerBar(plan: BarPlan): void {
  for (const cb of barListeners) {
    try { cb(plan) } catch (err) { console.error('jam: onBar listener failed', err) }
  }
}

function armSuspend(): void {
  if (suspendTimer) clearTimeout(suspendTimer)
  suspendTimer = setTimeout(() => {
    suspendTimer = null
    if (playing.value || !player.value) return
    player.value.stop()
    audible.value = false
  }, SUSPEND_MS)
}

/** Wake the audio from a gesture: playing the loop, or idle for live notes. */
function startAudio(idle: boolean): Promise<void> {
  const pl = ensurePlayer()
  try {
    // Safari 17+: play as media (through the silent switch), not as a UI sound.
    const nav = navigator as Navigator & { audioSession?: { type: string } }
    if (nav.audioSession) nav.audioSession.type = 'playback'
  } catch { /* not supported */ }
  pl.setVolume(VOLUME)
  audible.value = true
  armSuspend()
  return pl.start({ idle }).catch((e) => {
    audible.value = false
    playing.value = false
    say('AUDIO WOULD NOT START', 'warn')
    throw e
  })
}

/** Start the loop from `from` (default: the cursor), optionally after a count-in bar. Call from a user gesture. */
function play(opts: { from?: number; countIn?: boolean } = {}): Promise<void> {
  const pl = ensurePlayer()
  const n = E.loopBars(piece.value)
  const from = ((Math.round(opts.from ?? cursor.value) % n) + n) % n
  inner!.seek(from)
  jc!.countBars = opts.countIn ? 1 : 0
  jc!.mode = 'play'
  playing.value = true
  if (!pl.playing || pl.context?.state !== 'running') return startAudio(false).catch(() => {})
  // Already sounding (PLAY again from another bar): drop what is scheduled; idle: start a fresh bar.
  if (pl.idle) pl.setIdle(false)
  else pl.cut()
  armSuspend()
  return Promise.resolve()
}

function stop(): void {
  recording.value = false
  if (!playing.value) return
  playing.value = false
  position.bar = -1
  position.count = false
  if (!jc || !player.value) return
  jc.mode = 'idle'
  jc.countBars = 0
  player.value.cut()
  player.value.setIdle(true)
  armSuspend()
}

function toggle(): void {
  if (playing.value) stop()
  else void play()
}

/** REC: arm recording and start the loop (after a count-in when COUNT-IN is on). The recorder does the capturing. */
function toggleRecord(): void {
  if (recording.value) { recording.value = false; return }
  recording.value = true
  if (!playing.value) void play({ countIn: countIn.value })
}

/** Move the cursor; while playing, the next bar is this loop bar. */
function seek(loopBar: number): void {
  const n = E.loopBars(piece.value)
  const b = ((Math.round(loopBar) % n) + n) % n
  cursor.value = b
  if (playing.value && inner && player.value) {
    inner.seek(b)
    player.value.cut()
  }
}

const NOOP: LiveNote = { release() {} }

/** Play a note now (an instrument under the fingers); wakes the audio from the gesture when needed. */
function live(layer: Layer, sound: LiveSound, vel: number, pan?: number): LiveNote {
  const pl = ensurePlayer()
  armSuspend()
  if (pl.playing && pl.context?.state === 'running') return pl.live(layer, sound, vel, pan) ?? NOOP
  let released = false
  let note: LiveNote | null = null
  startAudio(true).then(() => { if (!released) note = pl.live(layer, sound, vel, pan) }).catch(() => {})
  return { release() { released = true; note?.release() } }
}

function frame(): void {
  raf = requestAnimationFrame(frame)
  const pl = player.value
  if (!pl || !playing.value) {
    if (position.bar !== -1) position.bar = -1
    if (position.count) position.count = false
    return
  }
  const v = pl.visual()
  const b = v.bar
  const lb = b && b.meta.loopBar !== undefined ? b.meta.loopBar : -1
  const count = !!b && b.meta.section === 'COUNT'
  if (position.bar !== lb) position.bar = lb
  if (position.count !== count) position.count = count
  position.abs = b?.index ?? -1
  position.step = lb >= 0 || count ? v.step : 0
}

/** Audio-clock time of what is heard now (minus an extra offset in seconds). */
function heardTime(offset = 0): number {
  const pl = player.value
  const ac = pl?.context
  return ac ? ac.currentTime - pl!.latency - offset : 0
}

function positionAt(time: number): { abs: number; loopBar: number; step: number } | null {
  const p = player.value?.positionAt(time)
  if (!p || !jc) return null
  return { abs: p.bar, loopBar: jc.loopBarOf(p.bar) ?? -1, step: p.step }
}

function onBar(cb: (plan: BarPlan) => void): () => void {
  barListeners.add(cb)
  return () => { barListeners.delete(cb) }
}

// ---- preview: tracks heard but not in the piece (the dialogs' KEEP / DROP) -------------------

/** Opus's proposed tracks while they are auditioned: the conductor plays the piece plus these; `solo` plays them alone. */
const preview = shallowRef<{ tracks: Track[]; solo: boolean } | null>(null)

/** The piece as the conductor gets it: with the preview tracks, which sound at any intensity. */
function heard(p: Piece): Piece {
  const pv = preview.value
  if (!pv) return p
  const n = E.loopBars(p)
  const extra: Track[] = pv.tracks.map((t, i) => ({ ...t, id: `preview-${i}`, enter: Math.min(t.enter, p.intensity) as Level, mute: false, solo: pv.solo, bars: E.fitBars(t.bars, n) }))
  const tracks = pv.solo ? p.tracks.map(t => ({ ...t, solo: false })) : p.tracks
  return { ...p, tracks: [...tracks, ...extra] }
}

/** Hear `tracks` with the piece (or alone, `solo`) without adding them; null ends the preview. Not an undo step. */
function setPreview(tracks: Track[] | null, solo = false): void {
  preview.value = tracks && tracks.length ? { tracks, solo } : null
  inner?.setPiece(heard(piece.value))
}

// ---- edits and history ---------------------------------------------------------------------

function setPiece(next: Piece): void {
  piece.value = next
  inner?.setPiece(heard(next))
  saveState.rev++
  const n = E.loopBars(next)
  if (cursor.value >= n) cursor.value = 0
  if (selection.value) selection.value = E.normSelection(next, selection.value)
  if (armed.value && !next.tracks.some(t => t.id === armed.value)) armed.value = null
  scheduleAutosave()
}

/** Make `next` the piece as one undo step (merged with the previous step of the same `merge` key within 1.5 s). */
function commit(next: Piece, label: string, merge?: string): void {
  if (next === piece.value) return
  const t = Date.now()
  const same = !!merge && lastMerge?.key === merge && t - lastMerge.at < MERGE_MS
  if (!same) {
    undoStack.push({ json: JSON.stringify(piece.value), label })
    if (undoStack.length > MAX_UNDO) undoStack.shift()
  }
  lastMerge = merge ? { key: merge, at: t } : null
  redoStack.length = 0
  setPiece(next)
  history.undo = undoStack.length
  history.redo = 0
  history.last = label
}

/**
 * Change the piece inside the last undo step, without a new snapshot: a
 * recording's later passes (each take is one step). Clears redo.
 */
function amend(next: Piece): void {
  if (next === piece.value) return
  lastMerge = null
  redoStack.length = 0
  history.redo = 0
  setPiece(next)
}

/** Any edit: mutate a copy of the piece; one undo step. */
function transact(label: string, fn: (draft: Piece) => void, merge?: string): void {
  const d = E.clonePiece(piece.value)
  fn(d)
  commit(d, label, merge)
}

function restore(json: string): void {
  const p = JSON.parse(json) as Piece
  // Intensity is where the player left it, not part of the history.
  p.intensity = piece.value.intensity
  setPiece(p)
}

function undo(): string | null {
  const e = undoStack.pop()
  if (!e) return null
  redoStack.push({ json: JSON.stringify(piece.value), label: e.label })
  lastMerge = null
  restore(e.json)
  history.undo = undoStack.length
  history.redo = redoStack.length
  return e.label
}

function redo(): string | null {
  const e = redoStack.pop()
  if (!e) return null
  undoStack.push({ json: JSON.stringify(piece.value), label: e.label })
  lastMerge = null
  restore(e.json)
  history.undo = undoStack.length
  history.redo = redoStack.length
  return e.label
}

const upd = (patch: Partial<Piece>, label: string, merge?: string) => commit({ ...piece.value, ...patch }, label, merge)

function setName(name: string): void { upd({ name: name.slice(0, 60) }, 'name', 'name') }
function setKey(tonic: number): void { upd({ tonic: ((Math.round(tonic) % 12) + 12) % 12 }, 'key') }
function setMode(mode: Mode): void { upd({ mode }, 'scale') }
function setBpm(bpm: number): void { upd({ bpm: Math.max(50, Math.min(200, Math.round(bpm))) }, 'tempo', 'bpm') }
function setSwing(swing: number): void { upd({ swing: Math.max(0, Math.min(0.5, Math.round(swing * 100) / 100)) }, 'swing', 'swing') }
function setBase(base: string | undefined): void { upd({ base }, 'sound') }
function setPhrases(n: number): void { commit(E.setPhrases(piece.value, n), 'phrases') }
function setChordBars(n: 1 | 2): void { commit(E.setChordBars(piece.value, n), 'chord bars') }

/** Why a progression would not do for one phrase (null when it lasts exactly eight bars). */
function chordError(text: string): string | null {
  const t = text.trim()
  if (!t) return 'NO CHORDS'
  const r = parseProgression(t, key(), piece.value.chordBars ?? 2)
  if ('error' in r) return r.error.toUpperCase()
  if (r.bars !== PIECE_PHRASE_BARS) return `${r.bars} OF 8 BARS`
  return null
}

/** Set one phrase's progression; returns the reason when it does not fit (nothing changes then). */
function setChords(phrase: number, text: string): string | null {
  const err = chordError(text)
  if (err) return err
  const chords = [...piece.value.chords]
  const clean = text.trim().replace(/\s+/g, ' ')
  if (chords[phrase] === clean) return null
  chords[phrase] = clean
  upd({ chords }, 'chords', `chords:${phrase}`)
  return null
}

/** Add an empty track (or a filled one: pass bars); returns its id. */
function addTrack(init: Partial<Track> & { instrument?: Instrument } = {}): string | null {
  if (piece.value.tracks.length >= 24) { say('24 TRACKS IS THE MOST', 'warn'); return null }
  const t = E.newTrack(piece.value, init)
  commit({ ...piece.value, tracks: [...piece.value.tracks, t] }, 'add track')
  return t.id
}

/** Change a track's fields (voice and kit exclude each other; a kit plays on drums or perc). */
function updateTrack(id: string, patch: Partial<Track>, merge?: string): void {
  transact('track', (d) => {
    const t = d.tracks.find(x => x.id === id)
    if (!t) return
    Object.assign(t, JSON.parse(JSON.stringify(patch)) as Partial<Track>)
    if (patch.voice) delete t.kit
    if (patch.kit) {
      delete t.voice
      if (t.layer !== 'drums' && t.layer !== 'perc') t.layer = 'drums'
    }
    if (patch.gain !== undefined) t.gain = Math.max(0, Math.min(1.5, Math.round(patch.gain * 100) / 100))
    if (patch.mute === false) delete t.mute
    if (patch.solo === false) delete t.solo
  }, merge)
}

/** Delete tracks, one undo step; says how many went. */
function removeTracks(ids: string[]): number {
  const gone = new Set(ids)
  const tracks = piece.value.tracks.filter(t => !gone.has(t.id))
  const n = piece.value.tracks.length - tracks.length
  if (!n) return 0
  commit({ ...piece.value, tracks }, n === 1 ? 'delete track' : 'delete tracks')
  say(`${n} TRACK${n === 1 ? '' : 'S'} DELETED · UNDO BRINGS ${n === 1 ? 'IT' : 'THEM'} BACK`)
  return n
}

function removeTrack(id: string): void { removeTracks([id]) }

/** The tracks with no notes or hits in any bar. */
const emptyTracks = computed(() => piece.value.tracks.filter(t => t.bars.every(b => !b.trim())).map(t => t.id))

function setBars(trackId: string, from: number, bars: string[], label = 'write'): void {
  commit(E.setBars(piece.value, trackId, from, bars), label)
}

function clearBars(sel: BarSelection | null = selection.value): boolean {
  if (!sel) return false
  commit(E.clearBars(piece.value, sel), 'clear')
  return true
}

function copy(sel: BarSelection | null = selection.value): boolean {
  if (!sel) return false
  const c = E.copyBars(piece.value, sel)
  if (!c) return false
  clipboard.value = c
  return true
}

/** Paste the clipboard at a selection's start (default: the current selection). */
function paste(at: { trackIds: string[]; from: number } | null = selection.value): boolean {
  if (!clipboard.value || !at || !at.trackIds.length) return false
  commit(E.pasteBars(piece.value, clipboard.value, at.trackIds, at.from), 'paste')
  return true
}

/** Duplicate a phrase (default: the one the selection or cursor is in) after itself. */
function dupPhrase(phrase: number = E.phraseOf(selection.value?.from ?? cursor.value)): boolean {
  const next = E.dupPhrase(piece.value, phrase)
  if (!next) { say('FOUR PHRASES IS THE MOST', 'warn'); return false }
  commit(next, 'duplicate phrase')
  return true
}

/** Grow the layers the base's ladder brings in that no track covers (the radio's composer). Returns how many tracks came. */
function grow(): number {
  let tracks: Track[] = []
  try {
    tracks = growLadder(piece.value, { lookup, seed: Math.floor(Math.random() * 1e9) })
  } catch (err) {
    console.error('jam: grow failed', err)
    say('GROWING FAILED', 'warn')
    return 0
  }
  if (!tracks.length) { say('EVERY LAYER HAS A TRACK', 'info'); return 0 }
  const { piece: next, ids } = E.addTracks(piece.value, tracks)
  commit(next, 'grow')
  say(`GREW ${ids.length} TRACK${ids.length === 1 ? '' : 'S'}`, 'info')
  return ids.length
}

/** Replace the piece (NEW, PIECES, a channel): validated, one undo step. Returns the validator's errors, or null. */
function loadPiece(p: unknown, label = 'open'): string[] | null {
  const v = validatePiece(p)
  if (!v.ok || !v.piece) return v.errors
  selection.value = null
  armed.value = null
  cursor.value = 0
  commit(v.piece, label)
  inner?.setControls({ intensity: v.piece.intensity })
  return null
}

/** Start an empty piece. */
function newPiece(opts: { tonic?: number; mode?: Mode; bpm?: number } = {}): void {
  loadPiece({ ...emptyPiece({ ...opts, id: E.newPieceId() }) }, 'new piece')
}

// ---- controls that are not part of the piece's history -----------------------------------

function setIntensity(level: number): void {
  const intensity = Math.max(0, Math.min(4, Math.round(level))) as Level
  if (intensity === piece.value.intensity) return
  piece.value = { ...piece.value, intensity }
  inner?.setPiece(heard(piece.value))
  inner?.setControls({ intensity })
  saveState.rev++
  scheduleAutosave()
}

function savePrefs(): void {
  save(LS_PREFS, { space: controls.space, grit: controls.grit, click: click.value, countIn: countIn.value, instrument: instrument.value } satisfies Prefs)
}
function setSpace(v: number): void { controls.space = v; inner?.setControls({ space: v }); savePrefs() }
/**
 * jam's GRIT knob (clean → tape) on the radio's Era axis: its analog half,
 * where the tape deepens. A piece's own instruments never change here; the
 * radio's 8-bit half (chip voices, bit crush) is not offered in jam.
 */
function eraOf(grit: number): number { return 0.5 + 0.5 * grit }
function setGrit(v: number): void { controls.grit = v; inner?.setControls({ era: eraOf(v) }); savePrefs() }
function setClick(on: boolean): void { click.value = on; inner?.setClick(on); savePrefs() }
function setCountIn(on: boolean): void { countIn.value = on; savePrefs() }
function setInstrument(i: Instrument): void { instrument.value = i; savePrefs() }
function setSelection(sel: BarSelection | null): void { selection.value = E.normSelection(piece.value, sel) }
function arm(id: string | null): void { armed.value = armed.value === id ? null : id }

// ---- music at a position ---------------------------------------------------------------------

function key(): Key { return { tonic: piece.value.tonic, mode: piece.value.mode } }
/** Pitch classes of the piece's scale, degree 1 first. */
function scale(): number[] { return scalePcs(key()) }
function chordAt(loopBar: number, step = 0): Chord { return pieceChordAt(piece.value, loopBar, step) }
/** The chord sounding now; stopped, the chord at the cursor. */
function currentChord(): Chord {
  return position.bar >= 0 ? chordAt(position.bar, position.step) : chordAt(cursor.value, 0)
}
function trackById(id: string | null | undefined): Track | undefined {
  return id ? piece.value.tracks.find(t => t.id === id) : undefined
}

/**
 * What an instrument sounds like now: the armed track's layer and voice (or
 * kit) when it is of the instrument's kind (drums → a kit track, the others
 * → a voice track), else the instrument's default. `trackId` is the armed
 * track it matched, if any.
 */
function targetFor(i: Instrument): { layer: Layer; voice?: VoiceId; kit?: KitId; trackId?: string } {
  const t = trackById(armed.value)
  const drums = i === 'drums'
  if (t && !!t.kit === drums) return { layer: t.layer, voice: t.voice, kit: t.kit, trackId: t.id }
  return { ...INSTRUMENT_DEFAULTS[i] }
}

// ---- saving ------------------------------------------------------------------------------

let autosaveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleAutosave(): void {
  if (typeof window === 'undefined') return
  if (autosaveTimer) clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(saveLocal, 600)
}

function saveLocal(): void {
  autosaveTimer = null
  const p = piece.value
  save(LS_PIECE, p)
  const list = load<Record<string, LocalEntry>>(LS_PIECES, {})
  list[p.id] = { id: p.id, name: p.name, updatedAt: Date.now(), piece: p }
  const keep = Object.values(list).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_LOCAL)
  save(LS_PIECES, Object.fromEntries(keep.map(e => [e.id, e])))
  saveState.localAt = Date.now()
  saveState.localRev = saveState.rev
}

/** The pieces kept in this browser, newest first. */
function localPieces(): Array<{ id: string; name: string; updatedAt: number }> {
  return Object.values(load<Record<string, LocalEntry>>(LS_PIECES, {}))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
}
function openLocal(id: string): string[] | null {
  const e = load<Record<string, LocalEntry>>(LS_PIECES, {})[id]
  return e ? loadPiece(e.piece) : ['no such piece here']
}
function deleteLocal(id: string): void {
  const list = load<Record<string, LocalEntry>>(LS_PIECES, {})
  delete list[id]
  save(LS_PIECES, list)
}

const remoteDirty = computed(() => saveState.remoteRev !== saveState.rev)

/** SAVE: store the piece on radio-api (members). */
async function saveRemote(): Promise<boolean> {
  const rev = saveState.rev
  saveState.remote = 'saving'
  try {
    const r = await useJamApi().putPiece(piece.value)
    saveState.remote = 'saved'
    saveState.remoteAt = r.updatedAt
    saveState.remoteRev = rev
    saveState.error = ''
    return true
  } catch (err) {
    saveState.remote = 'error'
    const e = err as { statusCode?: number; data?: { data?: string }; message?: string }
    saveState.error = String(e.data?.data ?? e.message ?? 'save failed').slice(0, 300)
    say(e.statusCode === 401 || e.statusCode === 403 ? 'SIGN IN TO SAVE' : 'SAVE FAILED', 'warn')
    return false
  }
}

/** Mark the piece as matching what radio-api has (after opening a saved piece). */
function markRemoteSaved(updatedAt = ''): void {
  saveState.remote = 'saved'
  saveState.remoteAt = updatedAt
  saveState.remoteRev = saveState.rev
}

/** The member's composed landscapes, for bases and growing. */
async function refreshLandscapes(): Promise<void> {
  try {
    const data = await $fetch<{ landscapes: Landscape[] }>('/api/landscapes')
    composed.value = (data.landscapes ?? []).map(l => ({ ...l, origin: 'opus' as const }))
    inner?.setPiece(heard(piece.value))
  } catch { /* signed out or offline: built-ins only */ }
}

// ---- start -------------------------------------------------------------------------------

let inited = false
function init(): void {
  if (inited || typeof window === 'undefined') return
  inited = true
  const prefs = load<Partial<Prefs>>(LS_PREFS, {})
  const n = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : d)
  controls.space = n(prefs.space, controls.space)
  controls.grit = n(prefs.grit, controls.grit)
  click.value = prefs.click === true
  countIn.value = prefs.countIn !== false
  if (prefs.instrument && INSTRUMENTS.includes(prefs.instrument)) instrument.value = prefs.instrument
  const saved = load<unknown>(LS_PIECE, null)
  let p: Piece | null = null
  if (saved) {
    const v = validatePiece(saved)
    if (v.ok && v.piece) p = v.piece
    else {
      save('jam.piece.bad', saved)
      console.warn('jam: the saved piece did not validate', v.errors)
      setTimeout(() => say('THE SAVED PIECE DID NOT LOAD', 'warn'), 500)
    }
  }
  if (!p) p = emptyPiece({ id: E.newPieceId() })
  if (p.id === 'untitled') p = { ...p, id: E.newPieceId() }
  piece.value = p
}

const api = {
  // state
  piece,
  history,
  canUndo: computed(() => history.undo > 0),
  canRedo: computed(() => history.redo > 0),
  playing,
  audible,
  recording,
  click,
  countIn,
  controls,
  position,
  cursor,
  selection,
  clipboard,
  armed,
  instrument,
  landscapes,
  saveState,
  remoteDirty,
  toast,
  player,
  preview,
  // edits (one undo step each)
  commit,
  amend,
  transact,
  undo,
  redo,
  setName,
  setKey,
  setMode,
  setBpm,
  setSwing,
  setBase,
  setPhrases,
  setChordBars,
  setChords,
  chordError,
  addTrack,
  updateTrack,
  removeTrack,
  removeTracks,
  emptyTracks,
  setBars,
  clearBars,
  copy,
  paste,
  dupPhrase,
  grow,
  setPreview,
  loadPiece,
  newPiece,
  // transport and controls
  play,
  stop,
  toggle,
  toggleRecord,
  seek,
  setIntensity,
  setSpace,
  setGrit,
  setClick,
  setCountIn,
  setInstrument,
  setSelection,
  arm,
  // audio hooks
  live,
  context: () => player.value?.context ?? null,
  heardTime,
  positionAt,
  onBar,
  // music
  key,
  scale,
  chordAt,
  currentChord,
  trackById,
  targetFor,
  lookup,
  loopBars: () => E.loopBars(piece.value),
  // saving
  localPieces,
  openLocal,
  deleteLocal,
  saveLocal,
  saveRemote,
  markRemoteSaved,
  refreshLandscapes,
  say,
}

export type Jam = typeof api

export function useJam(): Jam {
  init()
  return api
}
