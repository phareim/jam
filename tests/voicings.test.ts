// Guitar chord shapes (utils/voicings.ts): node --test with type stripping.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BASS_TUNING, GUITAR_TUNING, guitarVoicing, shapeName, shapeNotes } from '../utils/voicings.ts'
import { chordPcs, parseToken } from '../radio/engine/theory.ts'
import { diatonicChords } from '../radio/engine/piece/chords.ts'
import { MODE_IDS } from '../radio/engine/catalog.ts'
import type { Chord, Key } from '../radio/engine/types.ts'

const chord = (tok: string, key: Key = { tonic: 0, mode: 'ionian' }): Chord => parseToken(tok, key)!.chord

test('the open chords everyone knows', () => {
  const C: Key = { tonic: 0, mode: 'ionian' }
  assert.equal(shapeName(guitarVoicing(chord('1', C))), 'x32010')
  assert.equal(shapeName(guitarVoicing(chord('5', C))), '320003')
  assert.equal(shapeName(guitarVoicing(chord('6', C))), 'x02210')
  assert.equal(shapeName(guitarVoicing(chord('2', C))), 'xx0231')
  assert.equal(shapeName(guitarVoicing(chord('3', C))), '022000')
  assert.equal(shapeName(guitarVoicing(chord('4', C))), '133211')
  assert.equal(shapeName(guitarVoicing(chord('1', { tonic: 4, mode: 'ionian' }))), '022100')
  assert.equal(shapeName(guitarVoicing(chord('57', C))), '320001')
})

function playable(c: Chord, label: string): void {
  const shape = guitarVoicing(c)
  const notes = shapeNotes(shape, GUITAR_TUNING)
  const sounding = notes.filter((m): m is number => m !== null)
  assert.ok(sounding.length >= 3, `${label}: ${shapeName(shape)} sounds fewer than 3 strings`)
  // The lowest note is the chord's bass.
  assert.equal(Math.min(...sounding) % 12, c.bass, `${label}: ${shapeName(shape)} bass`)
  // Root and third (or its sus tone) and any 7th are in it; nothing outside the chord.
  const pcs = new Set(sounding.map(m => m % 12))
  const all = new Set(chordPcs(c))
  for (const p of pcs) assert.ok(all.has(p), `${label}: ${shapeName(shape)} plays a note outside ${c.symbol}`)
  assert.ok(pcs.has(c.root), `${label}: ${shapeName(shape)} lacks the root of ${c.symbol}`)
  const third = [4, 3, 5, 2].find(t => c.tones.includes(t))
  if (third !== undefined) assert.ok(pcs.has((c.root + third) % 12), `${label}: ${shapeName(shape)} lacks the third of ${c.symbol}`)
  for (const t of [10, 11]) if (c.tones.includes(t)) assert.ok(pcs.has((c.root + t) % 12), `${label}: ${shapeName(shape)} lacks the 7th of ${c.symbol}`)
  // Muted strings only at the low end, a stretch of at most three frets.
  const firstSounding = shape.findIndex(f => f !== null)
  assert.ok(shape.slice(firstSounding).every(f => f !== null), `${label}: ${shapeName(shape)} mutes an inner string`)
  const fretted = shape.filter((f): f is number => f !== null && f > 0)
  if (fretted.length) assert.ok(Math.max(...fretted) - Math.min(...fretted) <= 3, `${label}: ${shapeName(shape)} stretches too far`)
}

test('every diatonic triad and 7th in every key and mode is a playable shape of the chord', () => {
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of MODE_IDS) {
      for (const { token, chord: c } of diatonicChords(tonic, mode)) playable(c, `${tonic} ${mode} ${token}`)
    }
  }
})

test('slash chords, sus, add9 and borrowed chords', () => {
  const key: Key = { tonic: 9, mode: 'aeolian' }
  for (const tok of ['4/1', '5s4', '1add9', 'b7M', '5/7', '1s2', '2m7', '5M7', '15']) playable(chord(tok, key), tok)
})

test('the bass tuning is E1 A1 D2 G2 and the guitar E2 to E4', () => {
  assert.deepEqual([...BASS_TUNING], [28, 33, 38, 43])
  assert.deepEqual([...GUITAR_TUNING], [40, 45, 50, 55, 59, 64])
})
