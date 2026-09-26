<template>
  <DialogFrame title="NEW PIECE" :width="640" @close="emit('close')">
    <div class="nd__tabs dl-row" role="tablist">
      <button type="button" role="tab" class="px-btn px-btn--dim" :class="{ on: tab === 'empty' }" :aria-selected="tab === 'empty'" @click="tab = 'empty'">EMPTY</button>
      <button type="button" role="tab" class="px-btn px-btn--dim" :class="{ on: tab === 'channel' }" :aria-selected="tab === 'channel'" @click="tab = 'channel'">FROM A CHANNEL</button>
    </div>

    <template v-if="tab === 'empty'">
      <p class="dl-sec">KEY</p>
      <div class="dl-chips nd__keys" role="radiogroup" aria-label="Key">
        <button
          v-for="(k, i) in KEY_NAMES"
          :key="k"
          type="button"
          role="radio"
          class="px-btn px-btn--dim dl-chip"
          :class="{ on: tonic === i }"
          :aria-checked="tonic === i"
          @click="tonic = i"
        ><PxText :text="k" /></button>
      </div>
      <p class="dl-sec">SCALE</p>
      <div class="nd__modes" role="radiogroup" aria-label="Scale">
        <button
          v-for="m in MODES"
          :key="m"
          type="button"
          role="radio"
          class="px-btn px-btn--dim nd__mode"
          :class="{ on: mode === m }"
          :aria-checked="mode === m"
          @click="mode = m"
        ><span>{{ MODE_NAMES[m] }}</span><span class="nd__word">{{ MODE_WORDS[m] }}</span></button>
      </div>
      <p class="dl-sec">TEMPO</p>
      <PxSlider v-model="bpm" label="BPM" :min="50" :max="200" :step="1" :segments="15" :format="(v: number) => String(Math.round(v))" />
    </template>

    <template v-else>
      <ul class="dl-list nd__places">
        <li v-for="L in jam.landscapes.value" :key="L.id">
          <button
            type="button"
            class="nd__place"
            :class="{ on: place === L.id }"
            :style="{ '--acc': L.accent || '#2ff3ff' }"
            :aria-pressed="place === L.id"
            @click="place = L.id"
          >
            <span class="nd__pname">{{ L.origin === 'opus' ? '◈ ' : '' }}{{ L.name }}</span>
            <span class="nd__pblurb">{{ L.origin === 'opus' ? 'YOURS · ' : '' }}{{ L.blurb }}</span>
          </button>
        </li>
      </ul>
      <div class="dl-row nd__opts">
        <span class="px-label">PHRASES</span>
        <button v-for="n in [1, 2]" :key="n" type="button" class="px-btn px-btn--dim dl-chip" :class="{ on: phrases === n }" :aria-pressed="phrases === n" @click="phrases = n as 1 | 2">{{ n }}</button>
        <span class="px-label nd__lvl">START AT</span>
        <select v-model.number="level" class="px-field" aria-label="Starting intensity">
          <option v-for="(n, i) in INTENSITY_NAMES" :key="n" :value="i">{{ n }}</option>
        </select>
      </div>
    </template>

    <p class="dl-hint nd__warn">THE PIECE YOU HAVE NOW STAYS IN PIECES.</p>
    <p v-if="error" class="dl-err">{{ error }}</p>

    <template #actions>
      <button type="button" class="px-btn px-btn--dim" @click="emit('close')">CANCEL</button>
      <button type="button" class="px-btn px-btn--pink" :disabled="tab === 'channel' && !place" @click="start">START</button>
    </template>
  </DialogFrame>
</template>

<script setup lang="ts">
/**
 * NEW: an empty piece (key, scale, tempo), or a piece from a radio channel
 * (the built-ins and the member's composed ones): its chords over one or
 * two phrases and its whole ladder grown as tracks. The piece that was open
 * is already in the local list (autosave), so nothing is lost.
 */
import { ref } from 'vue'
import type { Mode } from '~/radio/engine/types.ts'
import { INTENSITY_NAMES } from '~/radio/engine/catalog.ts'
import { pieceFromLandscape } from '~/radio/engine/piece/library.ts'
import type { Level } from '~/radio/engine/piece/types.ts'
import { newPieceId } from '~/utils/edits.ts'
import DialogFrame from '~/components/dialogs/DialogFrame.vue'

const emit = defineEmits<{ close: [] }>()
const jam = useJam()

const KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const MODES: Mode[] = ['lydian', 'ionian', 'mixolydian', 'dorian', 'aeolian', 'harmonicMinor', 'phrygian']
const MODE_NAMES: Record<Mode, string> = {
  lydian: 'LYDIAN', ionian: 'IONIAN', mixolydian: 'MIXOLYDIAN', dorian: 'DORIAN',
  aeolian: 'AEOLIAN', harmonicMinor: 'HARMONIC MINOR', phrygian: 'PHRYGIAN',
}
const MODE_WORDS: Record<Mode, string> = {
  lydian: 'FLOATING', ionian: 'BRIGHT', mixolydian: 'WARM', dorian: 'SOFT MINOR',
  aeolian: 'MINOR', harmonicMinor: 'EXOTIC', phrygian: 'DARK',
}

const tab = ref<'empty' | 'channel'>('empty')
const tonic = ref(jam.piece.value.tonic)
const mode = ref<Mode>(jam.piece.value.mode)
const bpm = ref(jam.piece.value.bpm)
const place = ref(jam.piece.value.base ?? '')
const phrases = ref<1 | 2>(2)
const level = ref<number>(2)
const error = ref('')

function start(): void {
  error.value = ''
  jam.saveLocal()
  if (tab.value === 'empty') {
    jam.newPiece({ tonic: tonic.value, mode: mode.value, bpm: Math.round(bpm.value) })
    jam.say('NEW PIECE')
    emit('close')
    return
  }
  const L = jam.lookup(place.value)
  if (!L) { error.value = 'NO SUCH CHANNEL'; return }
  let errs: string[] | null
  try {
    const p = pieceFromLandscape(L, { lookup: jam.lookup, phrases: phrases.value, level: level.value as Level, seed: Math.floor(Math.random() * 1e9) })
    errs = jam.loadPiece({ ...p, id: newPieceId() }, 'new piece')
  } catch (err) {
    console.error('jam: pieceFromLandscape failed', err)
    errs = ['THAT CHANNEL WOULD NOT TURN INTO A PIECE']
  }
  if (errs) { error.value = errs.slice(0, 3).join(' · ').toUpperCase(); return }
  jam.say(`NEW PIECE FROM ${L.name.toUpperCase()}`)
  emit('close')
}
</script>

<style scoped>
.nd__tabs { margin-bottom: 4px; }
.nd__keys { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 8px 6px; }
.nd__keys .dl-chip { min-width: 0; padding: 0; }
@media (max-width: 600px) { .nd__keys { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
.nd__modes { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.nd__mode { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 6px 8px; text-align: left; }
.nd__word { color: var(--subtle); }
.nd__mode.on .nd__word, .nd__mode:hover .nd__word { color: inherit; opacity: 0.7; }

.nd__places { margin-top: 10px; }
.nd__place {
  display: grid;
  gap: 2px;
  width: 100%;
  min-height: var(--hit);
  padding: 6px 10px;
  border: 0;
  background: var(--bg-2);
  box-shadow: inset 4px 0 0 0 var(--acc);
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}
.nd__place:hover, .nd__place:focus-visible { outline: none; background: var(--bg-3); }
.nd__place.on { background: color-mix(in srgb, var(--acc) 22%, var(--bg)); box-shadow: inset 4px 0 0 0 var(--acc), inset 0 0 0 2px var(--acc); }
.nd__pname { color: var(--acc); text-shadow: 2px 2px 0 var(--bg); }
.nd__pblurb { color: var(--muted); text-transform: none; }
.nd__opts { margin-top: 12px; }
.nd__lvl { margin-left: 8px; }
.nd__warn { margin-top: 14px; }
</style>
