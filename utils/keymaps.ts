/**
 * The instruments' computer keys, by physical key (KeyboardEvent.code), so
 * the layout does not matter: on a Norwegian keyboard ';' and "'" are Ø and
 * Æ, on a German one Y and Z trade places, and the keys still sit where the
 * piano's keys are. None of them is a transport key (Space, Enter, [ ],
 * Tab, ?).
 *
 *   PIANO / BASS   A W S E D F T G Y H U J K O L P ; '  = C C# D .. F, an
 *                  octave and a fourth from the lowest C shown; Z / X octave
 *   DRUMS          Z X C V = KICK SNARE CLAP HAT, A S D F = OPEN RIDE PERC
 *                  TOM L, Q W E R = TOM M TOM H CRASH RISE
 *   GUITAR         1-7 chord, J strum down, K strum up
 *   TOUCH          A S D F G H J K L = scale degrees 1..9
 */
import type { DrumHit } from '../radio/engine/types.ts'

/** Semitones above the lowest C, one key each. */
export const PIANO_CODES = [
  'KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ',
  'KeyK', 'KeyO', 'KeyL', 'KeyP', 'Semicolon', 'Quote',
] as const
export const OCTAVE_DOWN = 'KeyZ'
export const OCTAVE_UP = 'KeyX'

export function pianoOffset(code: string): number | null {
  const i = (PIANO_CODES as readonly string[]).indexOf(code)
  return i < 0 ? null : i
}

export interface DrumPad {
  hit: DrumHit
  name: string
  code: string
}

/** The twelve pads as they sit on the screen, top row first (the keyboard's rows, Q row on top). */
export const DRUM_PADS: readonly DrumPad[] = [
  { hit: 'm', name: 'TOM M', code: 'KeyQ' },
  { hit: 'T', name: 'TOM H', code: 'KeyW' },
  { hit: 'x', name: 'CRASH', code: 'KeyE' },
  { hit: 'z', name: 'RISE', code: 'KeyR' },
  { hit: 'o', name: 'OPEN', code: 'KeyA' },
  { hit: 'r', name: 'RIDE', code: 'KeyS' },
  { hit: 'p', name: 'PERC', code: 'KeyD' },
  { hit: 't', name: 'TOM L', code: 'KeyF' },
  { hit: 'k', name: 'KICK', code: 'KeyZ' },
  { hit: 's', name: 'SNARE', code: 'KeyX' },
  { hit: 'c', name: 'CLAP', code: 'KeyC' },
  { hit: 'h', name: 'HAT', code: 'KeyV' },
]

export function drumPadFor(code: string): DrumPad | null {
  return DRUM_PADS.find(p => p.code === code) ?? null
}

/** Scale degrees 0..8 (1..9 on screen). */
export const TOUCH_CODES = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL'] as const

export function touchDegree(code: string): number | null {
  const i = (TOUCH_CODES as readonly string[]).indexOf(code)
  return i < 0 ? null : i
}

/** Guitar: the chord chip (0..6) of Digit1..Digit7. */
export function guitarChordKey(code: string): number | null {
  const m = /^Digit([1-7])$/.exec(code)
  return m ? Number(m[1]) - 1 : null
}
export const STRUM_DOWN = 'KeyJ'
export const STRUM_UP = 'KeyK'

const US: Record<string, string> = { Semicolon: ';', Quote: "'" }
let layout: Map<string, string> | null = null
let asked = false

/** Ask the browser what the keys print on this keyboard (Chromium only; others keep the US names). */
export function loadKeyLayout(): void {
  if (asked || typeof navigator === 'undefined') return
  asked = true
  const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard
  kb?.getLayoutMap?.().then((m) => { layout = m }).catch(() => {})
}

/** What to print on a key: the layout's character, else the US one. */
export function keyLabel(code: string): string {
  const c = layout?.get(code)
  if (c) return c.toUpperCase()
  if (US[code]) return US[code]!
  const m = /^(?:Key|Digit)(.)$/.exec(code)
  return m ? m[1]! : code
}
