<template>
  <DialogFrame :title="`STEP EDIT · ${track ? track.name.toUpperCase() : ''}`" tone="pink" :width="780" @close="close">
    <p v-if="!track" class="dl-p">THAT TRACK IS GONE.</p>
    <template v-else>
      <div class="se__top">
        <div class="se__nav" role="group" aria-label="Bar">
          <button type="button" class="px-btn px-btn--dim se__arrow" title="BAR BEFORE [←]" aria-label="Bar before" @click="move(-1)">◀</button>
          <span class="se__bar">BAR {{ bar + 1 }}<span class="se__of">/{{ loopN }}</span></span>
          <button type="button" class="px-btn px-btn--dim se__arrow" title="NEXT BAR [→]" aria-label="Next bar" @click="move(1)">▶</button>
        </div>
        <span class="se__chords"><PxText v-for="(c, i) in chordMarks" :key="i" :text="c.symbol" /></span>
        <span class="dl-grow" />
        <div v-if="narrow" class="dl-row" role="radiogroup" aria-label="Which half of the bar">
          <button type="button" role="radio" class="px-btn px-btn--dim dl-chip" :class="{ on: half === 0 }" :aria-checked="half === 0" @click="half = 0">1-8</button>
          <button type="button" role="radio" class="px-btn px-btn--dim dl-chip" :class="{ on: half === 1 }" :aria-checked="half === 1" @click="half = 1">9-16</button>
        </div>
        <div v-if="!kit" class="dl-row" role="group" aria-label="Octave">
          <button type="button" class="px-btn px-btn--dim dl-chip" title="AN OCTAVE DOWN" aria-label="Octave down" @click="oct--">OCT-</button>
          <button type="button" class="px-btn px-btn--dim dl-chip" title="AN OCTAVE UP" aria-label="Octave up" @click="oct++">OCT+</button>
        </div>
      </div>

      <p v-if="parseError" class="dl-err">THIS BAR DOES NOT READ: {{ parseError.toUpperCase() }}. AN EDIT REWRITES IT.</p>
      <p v-if="outside.above || outside.below" class="dl-hint se__outside">
        <button v-if="outside.above" type="button" class="se__more" @click="oct++">▲ {{ outside.above }} NOTE{{ outside.above === 1 ? '' : 'S' }} ABOVE</button>
        <button v-if="outside.below" type="button" class="se__more" @click="oct--">▼ {{ outside.below }} NOTE{{ outside.below === 1 ? '' : 'S' }} BELOW</button>
      </p>

      <div
        ref="grid"
        class="se__grid"
        :class="{ 'se__grid--kit': kit }"
        :style="{ '--cols': cols.length, '--lab': kit ? '68px' : '48px' }"
        @pointerdown="down"
        @pointermove="drag"
        @pointerup="up"
        @pointercancel="cancel"
      >
        <span class="se__corner" />
        <span v-for="c in cols" :key="`h${c}`" class="se__step" :class="{ beat: c % 4 === 0 }">{{ c + 1 }}</span>

        <template v-if="kit">
          <template v-for="h in HIT_ROWS" :key="h.hit">
            <span class="se__lab" :class="{ used: !!groove[h.hit] }">{{ h.name }}</span>
            <button
              v-for="c in cols"
              :key="c"
              type="button"
              class="se__cell se__hit"
              :class="[`v-${VCLASS[cellChar(h.hit, c)]}`, { beat: c % 4 === 0 }]"
              :aria-label="`${h.name} step ${c + 1}: ${HIT_WORDS[cellChar(h.hit, c)]}`"
              @click="cycle(h.hit, c)"
            ><span class="se__dot" /></button>
          </template>
        </template>

        <template v-else>
          <template v-for="r in rows" :key="r.midi">
            <span class="se__lab" :class="{ tonic: r.tonic, chrom: r.chrom }"><PxText :text="r.name" /></span>
            <button
              v-for="c in cols"
              :key="c"
              type="button"
              class="se__cell se__note"
              :class="[cellClass(r.midi, c), { beat: c % 4 === 0, tonic: r.tonic, chrom: r.chrom, ct: chordTone(r.midi, c) }]"
              :data-midi="r.midi"
              :data-col="c"
              :aria-label="`${r.name} step ${c + 1}`"
              @keydown.enter.prevent="keyToggle(r.midi, c)"
              @keydown.space.prevent="keyToggle(r.midi, c)"
            />
          </template>
        </template>
      </div>
      <p class="dl-hint se__help">{{ kit ? 'TAP A STEP: SOFT, HARD, GHOST, OFF.' : 'TAP TO ADD A NOTE, DRAG RIGHT TO MAKE IT LONGER, TAP A NOTE TO TAKE IT AWAY. LIT CELLS ARE THE CHORD.' }}</p>
    </template>

    <template #actions>
      <button type="button" class="px-btn px-btn--dim" :disabled="!track || isEmpty" @click="clearBar">CLEAR BAR</button>
      <button type="button" class="px-btn px-btn--pink" :class="{ on: aud.current.value === 'step' }" :disabled="!track || isEmpty" title="HEAR THIS BAR [SPACE]" @click="playBar">{{ aud.current.value === 'step' ? '■ STOP' : '▶ PLAY BAR' }}</button>
      <button type="button" class="px-btn px-btn--dim" @click="close">DONE</button>
    </template>
  </DialogFrame>
</template>

<script setup lang="ts">
/**
 * STEP EDIT: one bar of one track, sixteen steps wide, with ◀ ▶ (or the
 * arrow keys) to walk the loop. Drum tracks: a row per hit; a tap cycles
 * . → x → X → g → . (soft, hard, ghost, off). Note tracks: a row per scale
 * pitch over two octaves around the track's notes (OCT to shift; pitches off
 * the scale get a row when a note sits on them), sixteen columns; tap an
 * empty cell for a one-step note, drag right to lengthen it, tap a note to
 * take it away (drag from a note to change its length). Cells of the chord
 * sounding at that step are lit. Every change is one undo step (setBars).
 * On a phone the bar shows half at a time (1-8 / 9-16).
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { DrumHit, Groove } from '~/radio/engine/types.ts'
import { grooveOf, notesOf } from '~/radio/engine/piece/conductor.ts'
import { formatDrumBar, formatNoteBar, noteName, parseDrumBar, parseNoteBar } from '~/radio/engine/piece/notation.ts'
import type { PieceNote } from '~/radio/engine/piece/types.ts'
import { loopBars } from '~/utils/edits.ts'
import DialogFrame from '~/components/dialogs/DialogFrame.vue'

const props = defineProps<{ trackId: string; bar?: number }>()
const emit = defineEmits<{ close: [] }>()
const jam = useJam()
const aud = useAudition()
const keys = useKeys()

const HIT_ROWS: Array<{ hit: DrumHit; name: string }> = [
  { hit: 'x', name: 'CRASH' }, { hit: 'r', name: 'RIDE' }, { hit: 'o', name: 'OPEN' }, { hit: 'h', name: 'HAT' },
  { hit: 'c', name: 'CLAP' }, { hit: 's', name: 'SNARE' }, { hit: 'p', name: 'PERC' }, { hit: 'T', name: 'TOM H' },
  { hit: 'm', name: 'TOM M' }, { hit: 't', name: 'TOM L' }, { hit: 'k', name: 'KICK' }, { hit: 'z', name: 'RISER' },
]
const HIT_WORDS: Record<string, string> = { '.': 'off', x: 'hit', X: 'accent', g: 'ghost', '-': 'riser hold' }
const VCLASS: Record<string, string> = { '.': 'off', x: 'x', X: 'xx', g: 'g', '-': 'hold' }
const NEXT: Record<string, string> = { '.': 'x', '-': 'x', x: 'X', X: 'g', g: '.' }
const LAYER_CENTRE: Record<string, number> = { bass: 38, drone: 48, pad: 62, counter: 64, arp: 66, lead: 72, bells: 78 }
const NEW_VEL = 7 / 9

const track = computed(() => jam.trackById(props.trackId))
const kit = computed(() => !!track.value?.kit)
const loopN = computed(() => loopBars(jam.piece.value))
const bar = ref(Math.max(0, Math.min((props.bar ?? 0), loopN.value - 1)))
const src = computed(() => track.value?.bars[bar.value] ?? '')
const isEmpty = computed(() => !src.value.trim())
const oct = ref(0)
const half = ref(0)

// ---- the phone's half-bar view ---------------------------------------------------------------

const narrow = ref(false)
let mq: MediaQueryList | null = null
const onMq = () => { narrow.value = !!mq?.matches }
const cols = computed(() => {
  const all = Array.from({ length: 16 }, (_, i) => i)
  return narrow.value ? all.slice(half.value * 8, half.value * 8 + 8) : all
})

function move(d: number): void {
  const n = loopN.value
  bar.value = (bar.value + d + n) % n
}

const parseError = computed(() => {
  if (!src.value.trim()) return ''
  const r = kit.value ? parseDrumBar(src.value) : parseNoteBar(src.value)
  return 'error' in r ? r.error : ''
})

// ---- harmony -------------------------------------------------------------------------------

const chordMarks = computed(() => {
  const out: Array<{ step: number; symbol: string }> = []
  let prev = ''
  for (let s = 0; s < 16; s++) {
    const c = jam.chordAt(bar.value, s)
    if (c.symbol !== prev) out.push({ step: s, symbol: c.symbol })
    prev = c.symbol
  }
  return out
})
const chordPcs = computed(() => Array.from({ length: 16 }, (_, s) => {
  const c = jam.chordAt(bar.value, s)
  return new Set(c.tones.map(t => (c.root + t) % 12))
}))
function chordTone(midi: number, c: number): boolean { return chordPcs.value[c]!.has(((midi % 12) + 12) % 12) }

// ---- drums ---------------------------------------------------------------------------------

const groove = computed<Groove>(() => (kit.value ? grooveOf(src.value) : {}))
function cellChar(hit: DrumHit, c: number): string { return groove.value[hit]?.[c] ?? '.' }

function cycle(hit: DrumHit, c: number): void {
  const g: Groove = { ...groove.value }
  const row = (g[hit] ?? '.'.repeat(16)).split('')
  row[c] = NEXT[row[c] ?? '.'] ?? 'x'
  if (hit === 'z') {
    // A riser's '-' hold only follows a z or another '-'.
    for (let s = 0; s < 16; s++) if (row[s] === '-' && (s === 0 || row[s - 1] === '.')) row[s] = '.'
  } else {
    for (let s = 0; s < 16; s++) if (row[s] === '-') row[s] = '.'
  }
  g[hit] = row.join('')
  write(formatDrumBar(g))
}

// ---- notes ---------------------------------------------------------------------------------

const notes = computed<PieceNote[]>(() => (kit.value ? [] : notesOf(src.value)))
/** The notes shown while a finger drags (null: the bar's own). */
const draft = ref<PieceNote[] | null>(null)
const shown = computed(() => draft.value ?? notes.value)

/** Two octaves from the tonic nearest an octave under the track's middle. */
const range = computed<[number, number]>(() => {
  const t = track.value
  const all: number[] = []
  for (const b of t?.bars ?? []) if (b && !t?.kit) for (const n of notesOf(b)) all.push(n.midi)
  const centre = all.length ? all.reduce((a, b) => a + b, 0) / all.length : LAYER_CENTRE[t?.layer ?? 'pad'] ?? 60
  const tonic = jam.piece.value.tonic
  const want = centre - 12
  const lo = Math.round((want - tonic) / 12) * 12 + tonic + oct.value * 12
  return [Math.max(12, lo), Math.min(120, lo + 24)]
})

/** Flat names in flat keys (and in the minor modes on C, D, F, G). */
const preferFlats = computed(() => {
  const { tonic, mode } = jam.piece.value
  return [1, 3, 5, 8, 10].includes(tonic) || (['aeolian', 'phrygian', 'dorian'].includes(mode) && [0, 2, 5, 7].includes(tonic))
})

const rows = computed(() => {
  const [lo, hi] = range.value
  const scale = new Set(jam.scale())
  const present = new Set(shown.value.map(n => n.midi))
  const tonic = jam.piece.value.tonic
  const out: Array<{ midi: number; name: string; tonic: boolean; chrom: boolean }> = []
  for (let m = hi; m >= lo; m--) {
    const pc = m % 12
    const inScale = scale.has(pc)
    if (!inScale && !present.has(m)) continue
    out.push({ midi: m, name: noteName(m, preferFlats.value), tonic: pc === tonic, chrom: !inScale })
  }
  return out
})

const outside = computed(() => {
  const [lo, hi] = range.value
  return { above: notes.value.filter(n => n.midi > hi).length, below: notes.value.filter(n => n.midi < lo).length }
})

/** The note covering a cell (last one wins), and its index. */
function noteAt(list: PieceNote[], midi: number, c: number): number {
  for (let i = list.length - 1; i >= 0; i--) {
    const n = list[i]!
    if (n.midi === midi && Math.floor(n.step) <= c && c < n.step + n.len) return i
  }
  return -1
}

function cellClass(midi: number, c: number): string {
  const i = noteAt(shown.value, midi, c)
  if (i < 0) return ''
  const n = shown.value[i]!
  const start = Math.floor(n.step) === c
  const end = c + 1 >= n.step + n.len || c === 15
  return `on${start ? ' start' : ''}${end ? ' end' : ''}${c === 15 && n.step + n.len > 16 ? ' over' : ''}`
}

function write(text: string): void {
  if (!track.value || text === src.value) return
  jam.setBars(track.value.id, bar.value, [text], 'step edit')
}

function keyToggle(midi: number, c: number): void {
  const list = [...notes.value]
  const i = noteAt(list, midi, c)
  if (i >= 0) list.splice(i, 1)
  else list.push({ step: c, midi, len: 1, vel: NEW_VEL })
  write(formatNoteBar(list, preferFlats.value))
}

// ---- pointer: tap, drag to lengthen ------------------------------------------------------------

const grid = ref<HTMLElement | null>(null)
const g = reactive({ id: -1, mode: '' as '' | 'new' | 'hit', midi: 0, step: 0, index: -1, from: 0, moved: false })

function colAt(x: number): number {
  const el = grid.value
  if (!el) return 0
  const r = el.getBoundingClientRect()
  const lab = kit.value ? 68 : 48
  const w = (r.width - lab) / cols.value.length
  return Math.max(0, Math.min(15, cols.value[0]! + Math.floor((x - r.left - lab) / w)))
}

function down(e: PointerEvent): void {
  if (kit.value || e.button > 0) return
  const cell = (e.target as HTMLElement).closest<HTMLElement>('.se__note')
  if (!cell) return
  e.preventDefault()
  const midi = Number(cell.dataset.midi)
  const c = Number(cell.dataset.col)
  const i = noteAt(notes.value, midi, c)
  g.id = e.pointerId
  g.midi = midi
  g.from = c
  g.moved = false
  if (i >= 0) {
    g.mode = 'hit'
    g.index = i
    draft.value = [...notes.value]
  } else {
    g.mode = 'new'
    g.step = c
    draft.value = [...notes.value, { step: c, midi, len: 1, vel: NEW_VEL }]
  }
  try { grid.value?.setPointerCapture(e.pointerId) } catch { /* not capturable */ }
}

function drag(e: PointerEvent): void {
  if (e.pointerId !== g.id || !g.mode || !draft.value) return
  const c = colAt(e.clientX)
  if (g.mode === 'new') {
    const len = Math.max(1, c - g.step + 1)
    draft.value = [...notes.value, { step: g.step, midi: g.midi, len, vel: NEW_VEL }]
    return
  }
  if (c !== g.from) g.moved = true
  if (!g.moved) return
  const n = notes.value[g.index]!
  const len = Math.max(1, Math.round((c + 1 - n.step) * 100) / 100)
  draft.value = notes.value.map((x, i) => (i === g.index ? { ...x, len } : x))
}

function up(e: PointerEvent): void {
  if (e.pointerId !== g.id || !g.mode) return
  let list = draft.value ?? notes.value
  if (g.mode === 'hit' && !g.moved) list = notes.value.filter((_, i) => i !== g.index)
  reset()
  write(formatNoteBar(list, preferFlats.value))
}

function cancel(e: PointerEvent): void {
  if (e.pointerId === g.id) reset()
}

function reset(): void {
  g.id = -1
  g.mode = ''
  g.index = -1
  draft.value = null
}

// ---- actions -------------------------------------------------------------------------------

function clearBar(): void { write('') }

function playBar(): void {
  const t = track.value
  if (!t) return
  aud.toggle('step', { layer: t.layer, voice: t.voice, kit: t.kit, gain: t.gain }, [src.value])
}

function close(): void {
  aud.stop()
  emit('close')
}

watch(bar, () => { reset(); if (aud.current.value === 'step') aud.stop() })

onMounted(() => {
  mq = window.matchMedia('(max-width: 600px)')
  onMq()
  mq.addEventListener('change', onMq)
  keys.setDialog({
    id: 'step',
    down: (e) => {
      if (e.key === 'Escape') { close(); return true }
      if (e.key === 'ArrowLeft') { move(-1); return true }
      if (e.key === 'ArrowRight') { move(1); return true }
      if (e.key === ' ' && !(e.target instanceof HTMLButtonElement)) { if (!e.repeat) playBar(); return true }
      return false
    },
  })
})
onBeforeUnmount(() => {
  mq?.removeEventListener('change', onMq)
  aud.stop()
})
</script>

<style scoped>
.se__top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 10px; }
.se__nav { display: flex; align-items: center; gap: 8px; }
.se__arrow { width: var(--hit); padding: 0; }
.se__bar { min-width: 80px; text-align: center; color: var(--pink); text-shadow: 2px 2px 0 var(--bg); }
.se__of { color: var(--subtle); }
.se__chords { display: inline-flex; gap: 10px; color: var(--cyan); }
.se__outside { display: flex; gap: 12px; margin-bottom: 6px; }
.se__more { min-height: 32px; padding: 0 4px; border: 0; background: transparent; color: var(--muted); cursor: pointer; }
.se__more:hover { color: var(--ink); }

.se__grid {
  display: grid;
  grid-template-columns: var(--lab) repeat(var(--cols), minmax(0, 1fr));
  gap: 2px;
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
}
.se__corner { display: block; }
.se__step { color: var(--subtle); text-align: center; font-size: 16px; line-height: 20px; overflow: hidden; }
.se__step.beat { color: var(--muted); }
.se__lab {
  display: flex;
  align-items: center;
  padding-right: 6px;
  color: var(--subtle);
  white-space: nowrap;
  overflow: hidden;
}
.se__lab.used, .se__lab.tonic { color: var(--ink); }
.se__lab.chrom { color: var(--edge-dim); }

.se__cell {
  position: relative;
  display: block;
  min-width: 0;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: var(--bg-2);
  cursor: pointer;
}
.se__grid--kit .se__cell { height: 34px; }
.se__cell.beat { box-shadow: inset 2px 0 0 0 var(--edge-dim); }
.se__cell:focus-visible { outline: 2px solid var(--cyan); outline-offset: -2px; z-index: 1; }
.se__note.tonic { background: var(--bg-3); }
.se__note.chrom { background: color-mix(in srgb, var(--bg-2) 60%, var(--bg)); }
.se__note.ct { background: color-mix(in srgb, var(--cyan) 14%, var(--bg-2)); }
.se__note.on { background: var(--pink); box-shadow: none; }
.se__note.on:not(.start) { margin-left: -2px; }
.se__note.on.start::after {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--ink);
}
.se__note.on.over::before { content: '›'; position: absolute; right: 2px; top: 4px; color: var(--bg); }

.se__hit .se__dot { position: absolute; inset: 0; margin: auto; width: 0; height: 0; background: var(--pink); }
.se__hit.v-x .se__dot { width: 12px; height: 12px; }
.se__hit.v-xx .se__dot { width: 20px; height: 20px; box-shadow: 0 0 8px var(--pink); }
.se__hit.v-g .se__dot { width: 6px; height: 6px; background: var(--muted); }
.se__hit.v-hold .se__dot { width: 100%; height: 4px; background: var(--muted); }
.se__hit:hover { background: var(--bg-3); }
.se__help { margin-top: 10px; }

@media (hover: none) {
  .se__hit:hover { background: var(--bg-2); }
}
@media (max-width: 600px) {
  .se__cell { height: 32px; }
  .se__grid--kit .se__cell { height: 38px; }
}
</style>
