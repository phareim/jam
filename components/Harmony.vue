<template>
  <div class="hm">
    <div class="hm__row hm__row--key">
      <PxPop :width="228" title="KEY">
        <template #button><span class="px-label">KEY</span><PxText class="hm__val" :text="pcName(piece.tonic, key)" /></template>
        <template #default="{ close }">
          <div class="keys">
            <button
              v-for="(n, pc) in KEY_NAMES"
              :key="n"
              type="button"
              class="px-btn px-btn--dim keys__k"
              :class="{ on: pc === piece.tonic }"
              @click="setKey(pc); close()"
            ><PxText :text="n" /></button>
          </div>
        </template>
      </PxPop>

      <PxPop :width="300" title="SCALE">
        <template #button><span class="px-label">SCALE</span><span class="hm__val">{{ MODE_NAMES[piece.mode] }}</span><span class="hm__word">{{ MODE_WORDS[piece.mode] }}</span></template>
        <template #default="{ close }">
          <div class="modes">
            <button
              v-for="m in BRIGHTNESS"
              :key="m"
              type="button"
              class="modes__m"
              :class="{ on: m === piece.mode }"
              @click="setMode(m); close()"
            ><span>{{ MODE_NAMES[m] }}</span><span class="modes__w">{{ MODE_WORDS[m] }}</span></button>
          </div>
        </template>
      </PxPop>

      <button v-if="!open" type="button" class="hm__summary" title="SHOW THE CHORDS" @click="setOpen(true)">
        <PxText :text="summary" />
      </button>
      <template v-if="open">
      <div class="hm__bars" role="radiogroup" aria-label="Bars per chord">
        <span class="px-label">CHORD BARS</span>
        <button
          v-for="n in [1, 2] as const"
          :key="n"
          type="button"
          role="radio"
          class="px-btn px-btn--dim hm__n"
          :class="{ on: (piece.chordBars ?? 2) === n }"
          :aria-checked="(piece.chordBars ?? 2) === n"
          @click="setChordBars(n)"
        >{{ n }}</button>
      </div>

      <PxPop label="PRESETS" title="PROGRESSIONS FROM THE RADIO'S PLACES" :width="340">
        <template #default="{ close }">
          <div class="presets">
            <template v-for="L in BUILTIN" :key="L.id">
              <p class="presets__from" :style="{ color: L.accent }">{{ L.name }}</p>
              <button
                v-for="(pr, i) in L.progressions"
                :key="i"
                type="button"
                class="presets__p"
                @click="usePreset(pr.chords, pr.barsPerChord ?? 1); close()"
              ><span class="presets__role">{{ (pr.role ?? 'a').toUpperCase() }}</span><PxText :text="presetSymbols(pr.chords, pr.barsPerChord ?? 1)" /></button>
            </template>
          </div>
        </template>
      </PxPop>

      <div class="hm__chips" aria-label="Chords of the scale">
        <button
          v-for="c in chips"
          :key="c.token"
          type="button"
          class="px-btn px-btn--dim hm__chip"
          :title="`ADD ${c.chord.degree} TO PHRASE ${focus + 1}`"
          @pointerdown.prevent
          @click="append(c.token)"
        ><PxText :text="c.chord.symbol" /></button>
        <button type="button" class="px-btn px-btn--dim hm__chip" :class="{ on: sevenths }" title="SEVENTH CHORDS" @pointerdown.prevent @click="sevenths = !sevenths">7</button>
      </div>
      </template>
      <button type="button" class="hm__fold" :title="open ? 'HIDE THE CHORD FIELDS' : 'SHOW THE CHORD FIELDS'" :aria-expanded="open" @click="setOpen(!open)">{{ open ? '▲' : '▼' }}</button>
    </div>

    <div v-if="open" class="hm__phrases" :class="`hm__phrases--${piece.phrases}`">
      <div
        v-for="p in shown"
        :key="p"
        class="hm__ph"
        :class="{ focus: focus === p, bad: !!errors[p] }"
      >
        <button
          v-if="narrow && piece.phrases > 1"
          type="button"
          class="hm__plabel hm__plabel--cycle"
          :title="`PHRASE ${p + 1} OF ${piece.phrases}: TAP FOR THE NEXT`"
          @click="focus = (focus + 1) % piece.phrases"
        >P{{ p + 1 }}<span class="hm__of">/{{ piece.phrases }}</span></button>
        <button v-else type="button" class="hm__plabel" :title="`CHORDS OF PHRASE ${p + 1}`" @click="focusField(p)">P{{ p + 1 }}</button>
        <div class="hm__field">
          <div class="hm__overlay" aria-hidden="true"><PxText :ref="(el) => setOverlay(p, el)" :text="drafts[p] ?? ''" /></div>
          <input
            :ref="(el) => setField(p, el as HTMLInputElement | null)"
            class="px-field px-field--raw hm__input"
            :value="drafts[p]"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            :aria-label="`Chords of phrase ${p + 1}`"
            :aria-invalid="!!errors[p]"
            @focus="focus = p"
            @input="onInput(p, ($event.target as HTMLInputElement).value)"
            @scroll="onScroll(p)"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
            @keydown.esc="revert(p); ($event.target as HTMLInputElement).blur()"
          >
          <button v-if="drafts[p]" type="button" class="hm__clear" title="CLEAR" aria-label="Clear" @pointerdown.prevent @click="clearDraft(p)">×</button>
        </div>
        <p class="hm__status">
          <template v-if="errors[p]"><span class="hm__err">{{ errors[p] }}</span><button type="button" class="hm__undo" @click="revert(p)">KEEP OLD</button></template>
          <PxText v-else :text="symbols(p)" />
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The harmony strip: key, scale (brightest first, a word each), bars per
 * chord, presets from the radio's places, chips of the scale's chords, and
 * one progression per phrase. A phrase's text is a draft until it parses
 * and lasts exactly eight bars; then it is the piece's (one undo step per
 * phrase while typing). Chips append to the phrase last touched.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { Mode } from '~/radio/engine/types.ts'
import { BRIGHTNESS, parseProgression, pcName } from '~/radio/engine/theory.ts'
import { BUILTIN } from '~/radio/engine/landscapes/index.ts'
import { diatonicChords } from '~/radio/engine/piece/chords.ts'
import { phraseChords } from '~/radio/engine/piece/library.ts'
import { load, save } from '~/composables/storage'

const jam = useJam()
const { piece, setKey, setMode, setChordBars, setChords, chordError } = jam

const KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const MODE_NAMES: Record<Mode, string> = {
  lydian: 'LYDIAN', ionian: 'IONIAN', mixolydian: 'MIXOLYDIAN', dorian: 'DORIAN',
  aeolian: 'AEOLIAN', harmonicMinor: 'HARMONIC MINOR', phrygian: 'PHRYGIAN',
}
const MODE_WORDS: Record<Mode, string> = {
  lydian: 'FLOATING', ionian: 'BRIGHT', mixolydian: 'WARM', dorian: 'SOFT MINOR',
  aeolian: 'MINOR', harmonicMinor: 'EXOTIC', phrygian: 'DARK',
}

const key = computed(() => ({ tonic: piece.value.tonic, mode: piece.value.mode }))
const bpc = computed(() => piece.value.chordBars ?? 2)
const sevenths = ref(false)
const chips = computed(() => diatonicChords(piece.value.tonic, piece.value.mode).filter(c => c.token.endsWith('7') === sevenths.value))

// ---- drafts per phrase -------------------------------------------------------------------

const focus = ref(0)
const drafts = reactive<string[]>([])
const fields: Array<HTMLInputElement | null> = []
const overlays: Array<HTMLElement | null> = []
const errors = computed(() => drafts.map((d, i) => (i < piece.value.phrases && d !== piece.value.chords[i] ? chordError(d) : null)))

// Follow the piece (undo, presets, new pieces), except a phrase being typed into that does not parse yet.
watch(() => [piece.value.chords.join('\n'), piece.value.phrases, piece.value.tonic, piece.value.mode, bpc.value] as const, () => {
  const n = piece.value.phrases
  drafts.length = n
  for (let p = 0; p < n; p++) {
    const typing = document.activeElement === fields[p] && chordError(drafts[p] ?? '') !== null
    if (!typing) drafts[p] = piece.value.chords[p] ?? ''
  }
  if (focus.value >= n) focus.value = 0
}, { immediate: true })

function onInput(p: number, v: string): void {
  drafts[p] = v
  setChords(p, v)
}

function append(token: string): void {
  const p = focus.value
  const next = `${(drafts[p] ?? '').trim()} ${token}`.trim()
  drafts[p] = next
  setChords(p, next)
}

function clearDraft(p: number): void {
  drafts[p] = ''
  focus.value = p
  fields[p]?.focus()
}

function revert(p: number): void { drafts[p] = piece.value.chords[p] ?? '' }

function usePreset(chords: string, barsPerChord: number): void {
  const p = focus.value
  const text = phraseChords(chords, barsPerChord, key.value, bpc.value)
  drafts[p] = text
  const err = setChords(p, text)
  if (err) jam.say(err, 'warn')
}

/** The chord symbols a progression makes, spaced by how long each lasts. */
function symbolsOf(text: string, barsPerChord: number): string {
  const r = parseProgression(text.trim(), key.value, barsPerChord)
  if ('error' in r) return ''
  return r.chords.map(c => c.chord.symbol + (c.bars !== barsPerChord ? `:${c.bars}` : '')).join(' ')
}
function symbols(p: number): string { return symbolsOf(drafts[p] ?? '', bpc.value) }
function presetSymbols(chords: string, barsPerChord: number): string { return symbolsOf(chords, barsPerChord) }

// ---- the field: an input with transparent text over PxText, so 'm' and 'M' look different --------------

function setField(p: number, el: HTMLInputElement | null): void { fields[p] = el }
function setOverlay(p: number, el: unknown): void {
  overlays[p] = (el as { $el?: HTMLElement } | null)?.$el ?? null
}
function onScroll(p: number): void {
  const f = fields[p]
  const o = overlays[p]
  if (f && o) o.style.transform = `translateX(${-f.scrollLeft}px)`
}
function focusField(p: number): void {
  focus.value = p
  fields[p]?.focus()
}

// ---- folding, and narrow screens show one phrase at a time ------------------------------------

const narrow = ref(false)
const open = ref(true)
let mq: MediaQueryList | null = null
const onMq = () => { narrow.value = !!mq?.matches }
function setOpen(v: boolean): void {
  open.value = v
  save('jam.harmonyOpen', v)
}
/** Folded: the chords of every phrase on one line. */
const summary = computed(() => piece.value.chords.map((_, p) => symbols(p)).join('  |  '))
onMounted(() => {
  mq = window.matchMedia('(max-width: 700px)')
  onMq()
  mq.addEventListener('change', onMq)
  // Folded by default where the screen is small; the choice is remembered.
  const saved = load<boolean | null>('jam.harmonyOpen', null)
  open.value = saved ?? !window.matchMedia('(max-width: 700px), (max-height: 760px)').matches
})
onBeforeUnmount(() => mq?.removeEventListener('change', onMq))

const shown = computed(() => {
  const all = Array.from({ length: piece.value.phrases }, (_, i) => i)
  return narrow.value ? [Math.min(focus.value, piece.value.phrases - 1)] : all
})
</script>

<style scoped>
.hm {
  display: grid;
  gap: 8px;
  padding: 8px calc(16px + var(--safe-r)) 10px calc(16px + var(--safe-l));
  background: var(--bg-2);
  box-shadow: 0 -2px 0 0 var(--edge-dim), 0 2px 0 0 var(--edge-dim);
}

.hm__row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0; }
.hm__val { color: var(--cyan); }
.hm__word { color: var(--subtle); }

.hm__bars { display: flex; align-items: center; gap: 6px; }
.hm__n { width: var(--hit); padding: 0; }

.hm__chips { display: flex; gap: 6px; flex-wrap: wrap; }
.hm__chip { min-width: 44px; padding: 0 6px; color: var(--ink); }
.hm__chip.on { color: var(--bg); }

.hm__phrases { display: grid; grid-template-columns: repeat(var(--cols, 1), minmax(0, 1fr)); gap: 8px 16px; }
.hm__phrases--2 { --cols: 2; }
.hm__phrases--3 { --cols: 3; }
.hm__phrases--4 { --cols: 4; }

.hm__ph { display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 8px; row-gap: 4px; align-items: center; min-width: 0; }
.hm__plabel {
  width: 36px;
  height: var(--hit);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--subtle);
  text-shadow: 2px 2px 0 var(--bg);
  cursor: pointer;
}
.hm__ph.focus .hm__plabel { color: var(--cyan); }
.hm__plabel--cycle { width: 64px; color: var(--cyan); box-shadow: inset 0 0 0 2px var(--edge-dim); }
.hm__of { color: var(--subtle); }

.hm__field { position: relative; min-width: 0; overflow: hidden; padding: 2px; margin: -2px; }
.hm__input { width: 100%; color: transparent; caret-color: var(--cyan); padding-right: 36px; }
.hm__input::selection { color: transparent; background: color-mix(in srgb, var(--pink) 50%, transparent); }
.hm__overlay {
  position: absolute;
  left: 10px;
  right: 38px;
  top: 2px;
  height: var(--hit);
  display: flex;
  align-items: center;
  overflow: hidden;
  color: var(--ink);
  pointer-events: none;
  white-space: pre;
}
.hm__overlay > * { white-space: pre; }
.hm__ph.bad .hm__overlay { color: var(--pink); }
.hm__clear {
  position: absolute;
  right: 2px;
  top: 2px;
  width: 36px;
  height: var(--hit);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--subtle);
  cursor: pointer;
}
.hm__clear:hover { color: var(--ink); }

.hm__status { grid-column: 2; margin: 0; min-height: 20px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hm__err { color: var(--pink); margin-right: 12px; }
.hm__undo { border: 0; padding: 0; background: transparent; color: var(--cyan); cursor: pointer; }

.hm__summary {
  flex: 1 1 0;
  min-width: 0;
  height: var(--hit);
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: var(--ink);
  text-align: left;
  overflow: hidden;
  cursor: pointer;
}
.hm__summary :deep(.pxt) { display: block; overflow: hidden; text-overflow: ellipsis; }
.hm__fold {
  margin-left: auto;
  width: var(--hit);
  height: var(--hit);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.hm__fold:hover { color: var(--ink); }

.keys { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 4px; }
.keys__k { padding: 0; color: var(--ink); }

.modes { display: grid; gap: 2px; }
.modes__m {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  min-height: var(--hit);
  align-items: center;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--cyan);
  cursor: pointer;
  text-shadow: 2px 2px 0 var(--bg);
}
.modes__m.on { background: var(--cyan); color: var(--bg); text-shadow: none; }
.modes__m:hover:not(.on), .modes__m:focus-visible:not(.on) { outline: none; background: var(--bg-3); }
.modes__w { color: var(--subtle); }
.modes__m.on .modes__w { color: var(--bg); }

.presets { display: grid; gap: 2px; }
.presets__from { margin: 8px 8px 2px; text-shadow: 2px 2px 0 var(--bg); }
.presets__from:first-child { margin-top: 0; }
.presets__p {
  display: flex;
  gap: 12px;
  align-items: center;
  min-height: var(--hit);
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}
.presets__p:hover, .presets__p:focus-visible { outline: none; background: var(--bg-3); }
.presets__role { color: var(--subtle); width: 12px; }

@media (max-width: 1000px) {
  .hm__phrases--3, .hm__phrases--4 { --cols: 2; }
}

@media (max-width: 700px) {
  .hm { padding: 6px calc(12px + var(--safe-r)) 8px calc(12px + var(--safe-l)); gap: 6px; }
  .hm__row { gap: 8px; }
  .hm__word { display: none; }
  .hm__row--key > .pop :deep(.px-label) { display: none; }
  .hm__bars .px-label { display: none; }
  .hm__phrases { --cols: 1 !important; }
  .hm__chips { gap: 4px; }
  .hm__chip { min-width: 40px; padding: 0 4px; }
}
</style>
