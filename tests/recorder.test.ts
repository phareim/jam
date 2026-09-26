// The recorder's pure part (utils/takes.ts): captures → bars. node --test with type stripping.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { captureToNote, placeNotes, takeBars, writeNotes } from '../utils/takes.ts'
import type { Capture, Pos, TakeOpts } from '../utils/takes.ts'
import { parseDrumBar, parseNoteBar } from '../radio/engine/piece/notation.ts'

const empty = (n: number) => new Array<string>(n).fill('')
const pos = (abs: number, loopBar: number, step: number): Pos => ({ abs, loopBar, step })
/** A note from loop bar/step to an absolute end, the loop starting at abs 10 (loop bar b = abs 10 + b). */
const note = (bar: number, step: number, lenSteps: number, midi = 60, vel = 7 / 9): Capture => {
  const a = pos(10 + bar, bar, step)
  const endAbs = 10 * 16 + bar * 16 + step + lenSteps
  return { at: a, end: pos(Math.floor(endAbs / 16), -1, endAbs % 16), midi, vel }
}
const hit = (bar: number, step: number, h: Capture['hit'], vel = 0.8): Capture => ({ at: pos(10 + bar, bar, step), end: pos(10 + bar, bar, step + 0.5), hit: h, vel })

const opts = (o: Partial<TakeOpts> = {}): TakeOpts => ({ loopBars: 8, range: { from: 0, to: 7 }, mode: 'overdub', grid: 1, strength: 1, ...o })

test('positions become notes in their bars', () => {
  const r = takeBars(empty(8), false, [note(0, 0.1, 3.9), note(2, 7.8, 2.2, 64)], opts())
  assert.equal(r.bars[0], '0:C4:4')
  assert.equal(r.bars[1], '')
  assert.equal(r.bars[2], '8:E4:2')
  assert.equal(r.count, 2)
})

test('a note held over a bar line is one note running past the bar end', () => {
  const r = takeBars(empty(8), false, [note(1, 12, 10)], opts())
  assert.equal(r.bars[1], '12:C4:10')
  assert.equal(r.bars[2], '')
  const parsed = parseNoteBar(r.bars[1]!)
  assert.ok(!('error' in parsed))
})

test('a note held across the loop end is cut at the end', () => {
  const r = takeBars(empty(8), false, [note(7, 8, 20)], opts())
  assert.equal(r.bars[7], '8:C4:8')
  // Still held when the pass commits: runs to the range end.
  const held: Capture = { at: pos(17, 7, 12), end: null, midi: 62, vel: 7 / 9 }
  assert.equal(captureToNote(held, { from: 0, to: 7 })!.len, 4)
})

test('a note that quantizes onto the loop end carries to bar 0 of the next pass', () => {
  const r = takeBars(empty(8), false, [note(7, 15.8, 1)], opts())
  assert.equal(r.bars.join(''), '')
  assert.equal(r.carry.length, 1)
  assert.equal(r.carry[0]!.start, 0)
  const next = takeBars(r.bars, false, [], opts(), { carry: r.carry })
  assert.equal(next.bars[0], '0:C4:1')
})

test('quantize: off, 1/16, 1/8, 1/8T and strength', () => {
  const c = [note(0, 2.7, 1.3)]
  assert.equal(takeBars(empty(8), false, c, opts({ grid: 0 })).bars[0], '2.7:C4:1.3')
  assert.equal(takeBars(empty(8), false, c, opts({ grid: 1 })).bars[0], '3:C4:1')
  assert.equal(takeBars(empty(8), false, c, opts({ grid: 2 })).bars[0], '2:C4:2')
  assert.equal(takeBars(empty(8), false, c, opts({ grid: 4 / 3 })).bars[0], '2.67:C4:1.33')
  assert.equal(takeBars(empty(8), false, c, opts({ grid: 2, strength: 0.5 })).bars[0], '2.35:C4:1.65')
  // Drums go to sixteenths whatever the setting.
  const d = takeBars(empty(8), true, [hit(0, 2.7, 'k')], opts({ grid: 0 }))
  assert.equal(d.bars[0], 'k:...x............')
})

test('a note just before the range start comes in on its first step', () => {
  const early: Capture = { at: pos(10, 0, -0.3), end: pos(10, 0, 1.7), midi: 60, vel: 7 / 9 }
  assert.equal(takeBars(empty(8), false, [early], opts()).bars[0], '0:C4:2')
  assert.equal(takeBars(empty(8), false, [early], opts({ grid: 0 })).bars[0], '0:C4:2')
})

test('overdub merges: new notes join, the same pitch on the same step is replaced', () => {
  const bars = empty(8)
  bars[0] = '0:C4:4 8:G4:4'
  const r = takeBars(bars, false, [note(0, 0, 2, 60, 1), note(0, 4, 4, 64)], opts())
  assert.equal(r.bars[0], '0:C4:2:9 4:E4:4 8:G4:4')
  const drums = empty(8)
  drums[0] = 'k:x.......x....... h:x.x.x.x.x.x.x.x.'
  const d = takeBars(drums, true, [hit(0, 4, 's', 1), hit(0, 8, 'k', 1)], opts())
  const g = parseDrumBar(d.bars[0]!)
  assert.ok(!('error' in g))
  if (!('error' in g)) {
    assert.equal(g.groove.k, 'x.......X.......')
    assert.equal(g.groove.s, '....X...........')
    assert.equal(g.groove.h, 'x.x.x.x.x.x.x.x.')
  }
})

test('replace clears what starts in the span the pass went through, and only there', () => {
  const bars = empty(8)
  bars[0] = '0:C3:16'
  bars[1] = '0:D3:4 8:E3:4'
  bars[2] = '0:F3:4'
  // The pass ran from bar 1 step 6 to the end of bar 1.
  const r = takeBars(bars, false, [note(1, 10, 2, 72)], opts({ mode: 'replace', span: { from: 22, to: 32 } }))
  assert.equal(r.bars[0], '0:C3:16')
  assert.equal(r.bars[1], '0:D3:4 10:C5:2')
  assert.equal(r.bars[2], '0:F3:4')
  // Drums: hits in the span go; a riser's hold left without its hit becomes rests.
  const drums = empty(8)
  drums[0] = 'k:x...x...x...x... z:......x---------'
  const d = writeNotes(drums, true, [], { mode: 'replace', span: { from: 4, to: 8 } })
  assert.equal(d[0], 'k:x.......x...x...')
})

test('punch range: only notes inside count, cut at the punch-out', () => {
  const range = { from: 2, to: 3 }
  const r = takeBars(empty(8), false, [note(1, 4, 2, 60), note(2, 0, 2, 62), note(3, 12, 12, 64), note(3, 15.8, 1, 65)], opts({ range, mode: 'replace', span: { from: 32, to: 64 } }))
  assert.equal(r.bars[1], '')
  assert.equal(r.bars[2], '0:D4:2')
  assert.equal(r.bars[3], '12:E4:4')
  assert.equal(r.bars[4], '')
  // Quantized onto the punch-out: dropped, not carried.
  assert.equal(r.carry.length, 0)
  const placed = placeNotes([{ start: 40, len: 30, midi: 60, vel: 0.7 }], { loopBars: 8, range, grid: 1, strength: 1 }, false)
  assert.equal(placed.notes[0]!.len, 24)
})

test('a riser held for a while keeps its hold, inside the bar', () => {
  const z: Capture = { at: pos(10, 0, 8), end: pos(10, 0, 13), hit: 'z', vel: 0.8 }
  const r = takeBars(empty(8), true, [z], opts())
  assert.equal(r.bars[0], 'z:........x----...')
})
