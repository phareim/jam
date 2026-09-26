<template>
  <PxPop class="ro" tone="pink" :width="304" title="RECORDING: OVERDUB OR REPLACE, QUANTIZE, RANGE, LATENCY">
    <template #button><span class="ro__btn ro__long">{{ summary }}</span><span class="ro__btn ro__short">{{ short }}</span></template>
    <template #default>
      <div class="ro__panel">
        <div class="ro__row">
          <span class="px-label">MODE</span>
          <div class="ro__chips">
            <button v-for="m in MODES" :key="m.id" type="button" class="px-btn px-btn--dim" :class="{ on: s.mode === m.id }" :title="m.title" @click="s.mode = m.id">{{ m.label }}</button>
          </div>
        </div>
        <div class="ro__row">
          <span class="px-label">QUANTIZE</span>
          <div class="ro__chips">
            <button v-for="q in QS" :key="q" type="button" class="px-btn px-btn--dim ro__q" :class="{ on: s.quantize === q }" @click="s.quantize = q">{{ QUANTIZE_LABEL[q] }}</button>
          </div>
        </div>
        <div class="ro__row">
          <span class="px-label">STRENGTH</span>
          <div class="ro__chips">
            <button v-for="k in STRENGTHS" :key="k" type="button" class="px-btn px-btn--dim ro__q" :class="{ on: Math.abs(s.strength - k) < 0.01 }" :disabled="s.quantize === 'off'" @click="s.strength = k">{{ Math.round(k * 100) }}%</button>
          </div>
        </div>
        <p class="ro__note">DRUMS ALWAYS GO TO 1/16.</p>
        <div class="ro__row">
          <span class="px-label">RANGE</span>
          <div class="ro__chips">
            <button type="button" class="px-btn px-btn--dim" :class="{ on: s.range === 'loop' }" title="RECORD OVER THE WHOLE LOOP" @click="s.range = 'loop'">LOOP</button>
            <button type="button" class="px-btn px-btn--dim" :class="{ on: s.range === 'selection' }" title="PUNCH IN AND OUT: ONLY THE SELECTED BARS" @click="s.range = 'selection'">SELECTION</button>
          </div>
        </div>
        <p v-if="s.range === 'selection'" class="ro__note">{{ selText }}</p>
        <PxSlider
          class="ro__lat"
          :model-value="s.offsetMs"
          label="LATENCY"
          :min="OFFSET_MIN"
          :max="OFFSET_MAX"
          :step="5"
          :segments="14"
          compact
          color="#ff2fa0"
          :format="(v: number) => `${v > 0 ? '+' : ''}${v} MS`"
          @update:model-value="s.offsetMs = $event"
        />
        <p class="ro__note">THE DEVICE SAYS {{ deviceMs() }} MS. IF WHAT YOU RECORD LANDS LATE, MOVE THIS UP; EARLY, DOWN.</p>
      </div>
    </template>
  </PxPop>
</template>

<script setup lang="ts">
/**
 * The recording options, a popover in each instrument's header: OVERDUB or
 * REPLACE, quantize and its strength, the range (the loop, or the bar
 * selection for punch in/out) and a latency offset added to what the
 * device reports. Kept in localStorage by the recorder.
 */
import { computed } from 'vue'
import { OFFSET_MAX, OFFSET_MIN, QUANTIZE_LABEL } from '~/composables/useRecorder'
import type { Quantize } from '~/composables/useRecorder'

const jam = useJam()
const s = useRecorder().settings

const MODES = [
  { id: 'overdub', label: 'OVERDUB', title: 'ADD TO WHAT IS THERE' },
  { id: 'replace', label: 'REPLACE', title: 'CLEAR WHAT THE TAKE PASSES, THEN WRITE' },
] as const
const QS: Quantize[] = ['off', '16', '8', '8t']
const STRENGTHS = [0.5, 0.75, 1]

const summary = computed(() => `${s.mode === 'overdub' ? 'OVERDUB' : 'REPLACE'} ${QUANTIZE_LABEL[s.quantize]}${s.range === 'selection' ? ' PUNCH' : ''}`)
/** Read when the panel renders (the player's latency is not reactive). */
const short = computed(() => `${s.mode === 'overdub' ? 'OVR' : 'REP'} ${QUANTIZE_LABEL[s.quantize]}`)
const deviceMs = () => Math.round((jam.player.value?.latency ?? 0) * 1000)
const selText = computed(() => {
  const sel = jam.selection.value
  if (!sel) return 'NO BARS SELECTED: THE WHOLE LOOP.'
  return sel.from === sel.to ? `BAR ${sel.from + 1} ONLY.` : `BARS ${sel.from + 1} TO ${sel.to + 1}.`
})
</script>

<style scoped>
.ro__btn { white-space: nowrap; }
.ro__short { display: none; }
@media (max-width: 700px) {
  .ro__long { display: none; }
  .ro__short { display: inline; }
}
.ro__panel { display: grid; gap: 10px; }
.ro__row { display: grid; gap: 6px; }
.ro__chips { display: flex; flex-wrap: wrap; gap: 8px; }
.ro__chips .px-btn { padding: 0 10px; }
.ro__q { min-width: 56px; }
.ro__note { margin: -4px 0 0; color: var(--subtle); font-size: 16px; line-height: 20px; text-transform: uppercase; }
.ro__lat { width: 100%; }
</style>
