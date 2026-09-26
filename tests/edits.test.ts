// The pure edits behind useJam(): node --test with native type stripping.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Piece } from '../radio/engine/piece/types.ts'
import { emptyPiece } from '../radio/engine/piece/library.ts'
import { validatePiece } from '../radio/engine/piece/validate.ts'
import {
  addTracks, clearBars, copyBars, dupPhrase, mergeBar, newTrack, normSelection, pasteBars,
  setBars, setChordBars, setPhrases, uniqueTrackId,
} from '../utils/edits.ts'

const KICK = 'k:x.......x.......'
const SNARE = 's:....x.......x...'

function piece(): Piece {
  let p = emptyPiece({ id: 'p-test' })
  p = setPhrases(p, 2)
  const keys = newTrack(p, { instrument: 'piano', name: 'Keys' })
  keys.bars[0] = '0:C4+E4+G4:8'
  keys.bars[1] = '0:A3:4'
  const drums = newTrack({ ...p, tracks: [keys] }, { instrument: 'drums' })
  drums.bars[0] = KICK
  drums.bars[9] = SNARE
  return { ...p, tracks: [keys, drums] }
}

const ok = (p: Piece) => {
  const v = validatePiece(p)
  assert.equal(v.ok, true, v.errors.join('\n'))
}

test('the fixture is a valid piece', () => {
  const p = piece()
  ok(p)
  assert.deepEqual(p.tracks.map(t => t.id), ['keys', 'drums'])
  assert.equal(p.tracks[0]!.bars.length, 16)
})

test('setPhrases copies the last chords and pads bars; shrinking drops them', () => {
  const p = piece()
  const up = setPhrases(p, 4)
  ok(up)
  assert.equal(up.chords.length, 4)
  assert.equal(up.chords[3], p.chords[1])
  assert.equal(up.tracks[1]!.bars.length, 32)
  assert.equal(up.tracks[1]!.bars[31], '')
  const down = setPhrases(up, 1)
  ok(down)
  assert.equal(down.tracks[1]!.bars.length, 8)
  assert.equal(down.tracks[1]!.bars.includes(SNARE), false)
  // The input is untouched.
  assert.equal(p.phrases, 2)
})

test('copy and paste bars across tracks, never drums into a note track', () => {
  const p = piece()
  const clip = copyBars(p, { trackIds: ['drums', 'keys'], from: 0, to: 1 })!
  // Rows follow the piece's order, not the order asked for.
  assert.equal(clip.rows[0]!.kit, false)
  assert.deepEqual(clip.rows[1]!.bars, [KICK, ''])
  const q = pasteBars(p, clip, ['keys'], 4)
  ok(q)
  assert.equal(q.tracks[0]!.bars[4], '0:C4+E4+G4:8')
  assert.equal(q.tracks[1]!.bars[4], KICK, 'the second row continues into the next track')
  const r = pasteBars(p, { rows: [{ kit: true, bars: [KICK] }] }, ['keys'], 3)
  assert.equal(r.tracks[0]!.bars[3], '', 'a drum row skips a note track')
  const s = pasteBars(p, clip, ['keys'], 15)
  assert.equal(s.tracks[0]!.bars.length, 16, 'bars past the loop end are dropped')
})

test('clearBars and setBars', () => {
  const p = piece()
  const c = clearBars(p, { trackIds: ['keys', 'drums'], from: 0, to: 0 })
  assert.equal(c.tracks[0]!.bars[0], '')
  assert.equal(c.tracks[1]!.bars[0], '')
  assert.equal(c.tracks[0]!.bars[1], '0:A3:4')
  const s = setBars(p, 'drums', 14, [KICK, KICK, KICK])
  assert.deepEqual(s.tracks[1]!.bars.slice(14), [KICK, KICK])
  assert.equal(s.tracks[1]!.bars.length, 16)
})

test('dupPhrase inserts a copy after the phrase and stops at four', () => {
  const p = piece()
  const d = dupPhrase(p, 0)!
  ok(d)
  assert.equal(d.phrases, 3)
  assert.equal(d.tracks[1]!.bars[8], KICK)
  assert.equal(d.tracks[1]!.bars[17], SNARE, 'the old second phrase moved one phrase on')
  assert.equal(dupPhrase(setPhrases(p, 4), 0), null)
})

test('normSelection orders, clamps and drops unknown tracks', () => {
  const p = piece()
  assert.deepEqual(normSelection(p, { trackIds: ['drums', 'nope', 'keys'], from: 20, to: 3 }), { trackIds: ['keys', 'drums'], from: 3, to: 15 })
  assert.equal(normSelection(p, { trackIds: ['nope'], from: 0, to: 1 }), null)
})

test('setChordBars keeps every progression eight bars long', () => {
  const p = piece()
  const one = setChordBars(p, 1)
  ok(one)
  assert.equal(one.chords[0], '1 6 4 5 1 6 4 5')
  const two = setChordBars(one, 2)
  ok(two)
  assert.equal(two.chords[0], '1 6 4 5')
})

test('track ids stay unique', () => {
  const p = piece()
  assert.equal(uniqueTrackId(p, 'Keys'), 'keys-2')
  const { piece: q, ids } = addTracks(p, [{ ...p.tracks[0]!, bars: ['0:C4:1'] }])
  ok(q)
  assert.deepEqual(ids, ['keys-2'])
  assert.equal(q.tracks[2]!.bars.length, 16)
})

test('mergeBar overdubs notes and hits', () => {
  assert.equal(mergeBar(false, '0:C4:4', '4:E4:4'), '0:C4:4 4:E4:4')
  assert.equal(mergeBar(false, '0:C4:4', '0:C4:4'), '0:C4:4')
  assert.equal(mergeBar(true, KICK, SNARE), `${KICK} ${SNARE}`)
  assert.equal(mergeBar(true, 'k:x.......x.......', 'k:X...............'), 'k:X.......x.......')
})
