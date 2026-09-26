<template>
  <div class="inst">
    <InstrumentHeader instrument="touch">
      <div class="oct" role="group" aria-label="Octave">
        <button type="button" class="px-btn px-btn--dim oct__b" aria-label="Octave down" :disabled="octave <= 2" @click="setOctave(octave - 1)">◀</button>
        <span class="oct__v"><PxText :text="`${tonicName}${octave}`" /></span>
        <button type="button" class="px-btn px-btn--dim oct__b" aria-label="Octave up" :disabled="octave >= 6" @click="setOctave(octave + 1)">▶</button>
      </div>
    </InstrumentHeader>
    <div
      class="inst-surface tc"
      :style="{ '--cols': columns.length }"
      role="group"
      aria-label="Touch surface: across for the note, up for louder"
      @pointerdown="p.down"
      @pointermove="p.move"
      @pointerup="p.up"
      @pointercancel="p.up"
      @lostpointercapture="p.up"
      @contextmenu.prevent
    >
      <div
        v-for="(c, i) in columns"
        :key="i"
        class="tc__col"
        :class="{ chord: s.chordSet.value.has(c.midi % 12), tonic: c.midi % 12 === s.tonic.value, down: downCols.has(i) }"
      >
        <span v-if="s.labels.value && i < TOUCH_CODES.length" class="inst-key tc__key">{{ keyLabel(TOUCH_CODES[i]!) }}</span>
        <span class="tc__name"><PxText :text="c.name" /></span>
      </div>
      <span v-for="f in [...fingers.values()]" :key="f.id" class="tc__finger" :style="{ left: `${f.x}px`, top: `${f.y}px` }" />
      <span class="tc__axis">LOUD ↑</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * TOUCH: an XY surface for a lead line. Across: the scale's notes over two
 * octaves (fifteen columns from the tonic of the chosen octave), the
 * sounding chord's tones lit; up: louder. Slide a finger across the columns
 * and it plays legato: the new note starts, then the old one lets go (the
 * lead.glide voice glides between them). Every finger is its own line.
 * Voice: the armed track's, else the header's (default lead.glide).
 * Keys: A S D F G H J K L = scale degrees 1..9 from the chosen octave.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { LiveNote } from '~/radio/engine/types.ts'
import { pcName } from '~/radio/engine/theory.ts'
import { TOUCH_CODES, keyLabel, touchDegree } from '~/utils/keymaps.ts'
import { load, save } from '~/composables/storage'

const jam = useJam()
const rec = useRecorder()
const s = useSounding()
const keysApi = useKeys()

const octave = ref(Math.max(2, Math.min(6, Number(load<number>('jam.touch.octave', 4)) || 4)))
function setOctave(o: number): void { octave.value = Math.max(2, Math.min(6, o)); save('jam.touch.octave', octave.value) }
const tonicName = computed(() => pcName(jam.piece.value.tonic, jam.key()))

/** Fifteen scale notes from the tonic of the octave: two octaves and the top tonic. */
const columns = computed(() => {
  const sc = jam.scale()
  const start = (octave.value + 1) * 12 + jam.piece.value.tonic
  const steps = sc.map(pc => (pc - jam.piece.value.tonic + 12) % 12)
  const out: Array<{ midi: number; name: string }> = []
  for (let i = 0; i < 15; i++) {
    const midi = start + Math.floor(i / 7) * 12 + steps[i % 7]!
    out.push({ midi, name: pcName(midi % 12, jam.key()) })
  }
  return out
})

interface Held { col: number; midi: number; note: LiveNote; id: number }
const downCols = reactive(new Map<number, number>())
const fingers = reactive(new Map<number, { id: number; x: number; y: number }>())

function start(col: number, vel: number, id: number): Held {
  const midi = columns.value[col]!.midi
  downCols.set(col, (downCols.get(col) ?? 0) + 1)
  return { col, midi, note: rec.play('touch', { midi }, vel), id }
}
function end(h: Held): void {
  h.note.release()
  const c = (downCols.get(h.col) ?? 1) - 1
  if (c > 0) downCols.set(h.col, c)
  else downCols.delete(h.col)
}

function at(e: PointerEvent, r: DOMRect): { col: number; vel: number; x: number; y: number } {
  const x = e.clientX - r.left
  const y = e.clientY - r.top
  const n = columns.value.length
  const col = Math.max(0, Math.min(n - 1, Math.floor((x / r.width) * n)))
  const vel = 0.25 + 0.75 * (1 - Math.max(0, Math.min(1, y / r.height)))
  return { col, vel, x, y }
}

const p = usePointers<Held>({
  start(e, r) {
    const a = at(e, r)
    fingers.set(e.pointerId, { id: e.pointerId, x: a.x, y: a.y })
    return start(a.col, a.vel, e.pointerId)
  },
  move(e, r, h) {
    const a = at(e, r)
    fingers.set(e.pointerId, { id: e.pointerId, x: a.x, y: a.y })
    if (a.col === h.col) return
    // Legato: the new note first, then the old one lets go.
    const n = start(a.col, a.vel, h.id)
    end(h)
    return n
  },
  end(h) {
    fingers.delete(h.id)
    end(h)
  },
})

const byCode = new Map<string, Held>()
function keyDown(e: KeyboardEvent): boolean {
  const d = touchDegree(e.code)
  if (d === null) return false
  if (e.repeat || byCode.has(e.code)) return true
  byCode.set(e.code, start(d, e.shiftKey ? 1 : 0.75, -1))
  return true
}
function keyUp(e: KeyboardEvent): void {
  const h = byCode.get(e.code)
  if (!h) return
  byCode.delete(e.code)
  end(h)
}
function releaseAll(): void {
  p.endAll()
  for (const h of byCode.values()) end(h)
  byCode.clear()
  fingers.clear()
}

let off = () => {}
onMounted(() => { off = keysApi.register({ id: 'touch', down: keyDown, up: keyUp, blur: releaseAll }) })
onBeforeUnmount(() => { off(); releaseAll() })
</script>

<style scoped>
.oct { display: inline-flex; align-items: center; gap: 6px; }
.oct__b { width: var(--hit); padding: 0; }
.oct__v { min-width: 40px; text-align: center; color: var(--muted); text-transform: none; }

.tc {
  display: grid;
  grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
  background:
    linear-gradient(to bottom, color-mix(in srgb, var(--pink) 10%, transparent), transparent 70%),
    var(--bg);
}
.tc__col {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  padding-bottom: 6px;
  box-shadow: inset -1px 0 0 0 #2a1d4a;
  pointer-events: none;
}
.tc__col.chord { background: color-mix(in srgb, var(--cyan) 12%, transparent); }
.tc__col.tonic { box-shadow: inset -1px 0 0 0 #2a1d4a, inset 0 -4px 0 0 var(--edge-dim); }
.tc__col.chord.tonic { box-shadow: inset -1px 0 0 0 #2a1d4a, inset 0 -4px 0 0 var(--cyan); }
.tc__col.down { background: color-mix(in srgb, var(--pink) 35%, transparent); }
.tc__name { color: var(--subtle); text-transform: none; font-size: 16px; line-height: 16px; }
.tc__col.chord .tc__name { color: var(--cyan); }
.tc__col.down .tc__name { color: var(--ink); }
.tc__key { position: absolute; top: 6px; }
.tc__finger {
  position: absolute;
  width: 20px;
  height: 20px;
  margin: -10px 0 0 -10px;
  background: var(--pink);
  box-shadow: 0 0 12px var(--pink);
  pointer-events: none;
}
.tc__axis { position: absolute; top: 6px; right: 8px; color: var(--subtle); pointer-events: none; opacity: 0.7; }
</style>
