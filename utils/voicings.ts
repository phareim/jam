/**
 * Fretted instruments: tunings, the note on a string and fret, and
 * open-position guitar chord shapes for any chord the engine names.
 *
 * guitarVoicing(chord) searches every shape of at most four fingers and a
 * three-fret stretch (a barre at the lowest fret counts as one finger) and
 * takes the one nearest the nut that sounds the chord: the lowest string
 * plays the chord's bass note, root and third (or the sus tone) and any
 * 6th/7th are in it, the fifth is left out only when it must be, and muted
 * strings sit at the low end only. Open strings count as free. So C gives
 * x32010, Am x02210, E 022100, G 320003, F 133211.
 *
 * Relative `.ts` imports so Node runs this file with type stripping.
 */
import type { Chord } from '../radio/engine/types.ts'

/** Open strings low to high, MIDI. */
export const GUITAR_TUNING: readonly number[] = [40, 45, 50, 55, 59, 64] // E2 A2 D3 G3 B3 E4
export const BASS_TUNING: readonly number[] = [28, 33, 38, 43] // E1 A1 D2 G2
export const MAX_FRET = 12

/** One entry per string, low to high: the fret played, or null for a muted string. */
export type Shape = Array<number | null>

const pc = (m: number) => ((m % 12) + 12) % 12

/** The MIDI notes a shape sounds, per string (null where muted). */
export function shapeNotes(shape: Shape, tuning: readonly number[] = GUITAR_TUNING): Array<number | null> {
  return shape.map((f, i) => (f === null ? null : tuning[i]! + f))
}

/** Shape as the usual chart string, low E first: 'x32010'; frets over 9 in parentheses. */
export function shapeName(shape: Shape): string {
  return shape.map(f => (f === null ? 'x' : f > 9 ? `(${f})` : String(f))).join('')
}

interface Need {
  all: Set<number>
  required: number[]
  fifth: number | null
}

function needs(chord: Chord): Need {
  const all = new Set(chord.tones.map(t => pc(chord.root + t)))
  const has = (t: number) => chord.tones.includes(t)
  const required = [pc(chord.root)]
  const third = [4, 3, 5, 2].find(has)
  if (third !== undefined) required.push(pc(chord.root + third))
  for (const t of [9, 10, 11]) if (has(t)) required.push(pc(chord.root + t))
  const fifthT = [7, 6, 8].find(has)
  const fifth = fifthT === undefined ? null : pc(chord.root + fifthT)
  // A power chord has no third: its fifth is what it is.
  if (third === undefined && fifth !== null) required.push(fifth)
  return { all, required: [...new Set(required)], fifth }
}

/** Fingers a shape needs: fretted notes, a barre at the lowest fret counting once (a barre leaves no string open). */
function fingers(frets: number[]): number {
  const fretted = frets.filter(f => f > 0)
  if (fretted.length <= 4) return fretted.length
  if (fretted.length < frets.length) return 99
  const lo = Math.min(...fretted)
  return fretted.filter(f => f > lo).length + 1
}

function cost(shape: Shape, need: Need, tuning: readonly number[]): number | null {
  const sounding = shape.filter((f): f is number => f !== null)
  const pcs = new Set(shape.map((f, i) => (f === null ? -1 : pc(tuning[i]! + f))))
  for (const r of need.required) if (!pcs.has(r)) return null
  if (fingers(sounding) > 4) return null
  const mutes = shape.length - sounding.length
  const opens = sounding.filter(f => f === 0).length
  let c = sounding.reduce((a, f) => a + f, 0) + mutes * 2 - opens
  if (need.fifth !== null && !pcs.has(need.fifth)) c += 3
  return c
}

const cache = new Map<string, Shape>()

/** The chord shape nearest the nut (see the file comment); falls back to root + fifth when nothing fits. */
export function guitarVoicing(chord: Chord, tuning: readonly number[] = GUITAR_TUNING): Shape {
  const key = `${chord.root}|${chord.bass}|${chord.tones.join(',')}|${tuning.join(',')}`
  const hit = cache.get(key)
  if (hit) return hit
  const need = needs(chord)
  const bass = pc(chord.bass)
  const n = tuning.length
  // Frets on each string that sound a chord tone.
  const options = tuning.map(open => {
    const out: number[] = []
    for (let f = 0; f <= MAX_FRET; f++) if (need.all.has(pc(open + f))) out.push(f)
    return out
  })
  let best: Shape | null = null
  let bestCost = Infinity
  const shape: Shape = new Array(n).fill(null)
  // `first`: the lowest sounding string; the ones below it are muted.
  for (let first = 0; first <= n - 3; first++) {
    const bassFrets = options[first]!.filter(f => pc(tuning[first]! + f) === bass)
    for (const bf of bassFrets) {
      for (let i = 0; i < n; i++) shape[i] = null
      shape[first] = bf
      const walk = (s: number, lo: number, hi: number): void => {
        if (s === n) {
          const c = cost(shape, need, tuning)
          // Ties: more strings sounding, then lower frets overall.
          if (c !== null && (c < bestCost || (c === bestCost && best && shape.filter(f => f !== null).length > best.filter(f => f !== null).length))) {
            bestCost = c
            best = [...shape]
          }
          return
        }
        for (const f of options[s]!) {
          // Nothing under the bass note.
          if (tuning[s]! + f < tuning[first]! + bf) continue
          const nlo = f > 0 ? Math.min(lo, f) : lo
          const nhi = f > 0 ? Math.max(hi, f) : hi
          if (nhi - nlo > 3) continue
          shape[s] = f
          walk(s + 1, nlo, nhi)
        }
        shape[s] = null
      }
      walk(first + 1, bf > 0 ? bf : Infinity, bf > 0 ? bf : -Infinity)
    }
  }
  if (!best) {
    // Nothing playable: the bass note and a fifth above it on the next strings.
    const s: Shape = new Array(n).fill(null)
    const f0 = options[0]!.find(f => pc(tuning[0]! + f) === bass) ?? 0
    s[0] = f0
    s[1] = f0 + 2 <= MAX_FRET ? f0 + 2 : f0
    best = s
  }
  cache.set(key, best)
  return best
}
