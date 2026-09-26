<template>
  <div
    ref="el"
    class="inst-surface fb"
    :style="{ '--cols': count, '--rows': tuning.length }"
    role="group"
    :aria-label="`${instrument} fretboard`"
    @pointerdown="p.down"
    @pointermove="p.move"
    @pointerup="p.up"
    @pointercancel="p.up"
    @lostpointercapture="p.up"
    @contextmenu.prevent
  >
    <template v-for="(open, row) in rows" :key="row">
      <div
        v-for="f in frets"
        :key="`${row}-${f}`"
        class="fb__cell"
        :class="{
          nut: f === 0,
          scale: sounding.scaleSet.value.has((open + f) % 12),
          chord: sounding.chordSet.value.has((open + f) % 12),
          down: isDown(row, f) || lit.includes(open + f),
        }"
        :style="{ '--thick': `${thickness(row)}px` }"
      >
        <span class="fb__dot" />
        <span v-if="isDown(row, f) || lit.includes(open + f)" class="fb__name"><PxText :text="name(open + f)" /></span>
      </div>
    </template>
    <span v-for="m in marks" :key="m.f + ':' + m.y" class="fb__inlay" :style="{ left: `${(m.f - first + 0.5) * (100 / count)}%`, top: `calc(${m.y / 100} * (100% - ${NUM_H}px))` }" />
    <span v-for="f in frets" :key="'n' + f" class="fb__num" :style="{ left: `${(f - first + 0.5) * (100 / count)}%` }">{{ f || '' }}</span>
  </div>
</template>

<script setup lang="ts">
/**
 * A fretboard for GUITAR and BASS: the strings as rows, the lowest string
 * on top (as the instrument looks to the one holding it), the frets as
 * columns from `first` (as many as fit at 48 px or more, emitted as
 * `count`). Tap a fret to play it; a string plays one note at a time (a new
 * fret on it ends the old one), and sliding along a string or onto another
 * plays each fret it reaches. Velocity: loudest right on the string.
 * Scale tones get a dim dot, the sounding chord's tones a cyan one, held
 * frets are pink; `lit` lights notes the computer keys hold.
 */
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import type { LiveNote } from '~/radio/engine/types.ts'
import type { Instrument } from '~/radio/engine/piece/types.ts'
import { MAX_FRET } from '~/utils/voicings.ts'
import { midiName } from '~/radio/engine/theory.ts'

const props = withDefaults(defineProps<{
  instrument: Instrument
  /** Open strings, low to high. */
  tuning: readonly number[]
  first?: number
  lit?: number[]
}>(), { first: 0, lit: () => [] })
const emit = defineEmits<{ count: [n: number] }>()

const jam = useJam()
const rec = useRecorder()
const sounding = useSounding()
const el = ref<HTMLElement | null>(null)
const { w } = useSize(el)

const count = computed(() => Math.max(5, Math.min(MAX_FRET + 1, Math.floor((w.value || 400) / 48))))
watch(count, n => emit('count', n), { immediate: true })
const firstFret = computed(() => Math.max(0, Math.min(props.first, MAX_FRET + 1 - count.value)))
const frets = computed(() => Array.from({ length: count.value }, (_, i) => firstFret.value + i))
/** Rows top to bottom: the lowest string first, so a row is its string's index. */
const rows = computed(() => props.tuning)
const first = firstFret
/** Room under the strings for the fret numbers. */
const NUM_H = 18

const marks = computed(() => {
  const out: Array<{ f: number; y: number }> = []
  for (const f of frets.value) {
    if ([3, 5, 7, 9].includes(f)) out.push({ f, y: 50 })
    if (f === 12) out.push({ f, y: 30 }, { f, y: 70 })
  }
  return out
})

function thickness(row: number): number {
  // Low strings thicker.
  const n = props.tuning.length
  return row < n / 3 ? 4 : row < (2 * n) / 3 ? 3 : 2
}
function name(midi: number): string { return midiName(midi, jam.key()) }

interface Held { string: number; fret: number; note: LiveNote }
const held = reactive(new Map<number, Held>())
function isDown(string: number, fret: number): boolean {
  return held.get(string)?.fret === fret
}

function cellAt(x: number, y: number, r: DOMRect): { string: number; fret: number; vel: number } {
  const n = props.tuning.length
  const rowH = (r.height - NUM_H) / n
  const row = Math.max(0, Math.min(n - 1, Math.floor(y / rowH)))
  const col = Math.max(0, Math.min(count.value - 1, Math.floor(x / (r.width / count.value))))
  const off = Math.abs(y - (row + 0.5) * rowH) / (rowH / 2)
  return { string: row, fret: firstFret.value + col, vel: 0.55 + 0.45 * (1 - Math.min(1, off)) }
}

function start(string: number, fret: number, vel: number): Held {
  const old = held.get(string)
  const h: Held = { string, fret, note: rec.play(props.instrument, { midi: props.tuning[string]! + fret }, vel) }
  held.set(string, h)
  if (old) old.note.release()
  return h
}
function end(h: Held): void {
  h.note.release()
  if (held.get(h.string) === h) held.delete(h.string)
}

const p = usePointers<Held>({
  start(e, r) {
    const c = cellAt(e.clientX - r.left, e.clientY - r.top, r)
    return start(c.string, c.fret, c.vel)
  },
  move(e, r, h) {
    const c = cellAt(e.clientX - r.left, e.clientY - r.top, r)
    if (c.string === h.string && c.fret === h.fret) return
    const n = start(c.string, c.fret, c.vel)
    if (h.string !== c.string) end(h)
    return n
  },
  end,
})

function releaseAll(): void {
  p.endAll()
  for (const h of [...held.values()]) end(h)
}
onBeforeUnmount(releaseAll)
defineExpose({ releaseAll })
</script>

<style scoped>
.fb {
  display: grid;
  grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
  grid-template-rows: repeat(var(--rows), minmax(0, 1fr));
  background: #1a1030;
  padding-bottom: 18px; /* NUM_H */
}
.fb__cell {
  position: relative;
  display: grid;
  place-items: center;
  pointer-events: none;
  box-shadow: inset -2px 0 0 0 #6a5a96;
}
.fb__cell.nut { background: #120a22; box-shadow: inset -6px 0 0 0 #d9cfee; }
/* The string. */
.fb__cell::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: calc(50% - var(--thick) / 2);
  height: var(--thick);
  background: #8f80b3;
}
.fb__dot { position: relative; width: 6px; height: 6px; }
.fb__cell.scale .fb__dot { background: #4a3d88; }
.fb__cell.chord .fb__dot { width: 10px; height: 10px; background: var(--cyan); }
.fb__cell.down .fb__dot { display: none; }
.fb__cell.down::after {
  content: '';
  position: absolute;
  inset: 3px 6px;
  background: var(--pink);
}
.fb__name { position: relative; z-index: 1; color: var(--bg); font-size: 16px; line-height: 16px; --pxt-shadow: none; }
.fb__inlay {
  position: absolute;
  width: 8px;
  height: 8px;
  margin: -4px 0 0 -4px;
  background: #3a2d5e;
  pointer-events: none;
}
.fb__num {
  position: absolute;
  bottom: 0;
  transform: translateX(-50%);
  color: var(--subtle);
  font-size: 16px;
  line-height: 16px;
  pointer-events: none;
}
</style>
