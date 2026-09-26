<template>
  <div class="inst">
    <InstrumentHeader instrument="bass">
      <div class="pos" role="group" aria-label="Fret position">
        <button type="button" class="px-btn px-btn--dim pos__b" title="TOWARD THE NUT" aria-label="Toward the nut" :disabled="first <= 0" @click="move(-1)">◀</button>
        <span class="pos__v">FR {{ first }}</span>
        <button type="button" class="px-btn px-btn--dim pos__b" title="UP THE NECK" aria-label="Up the neck" :disabled="first + count > MAX_FRET" @click="move(1)">▶</button>
      </div>
      <span v-if="labels" class="inst-key pos__keys" title="THE COMPUTER KEYS PLAY FROM THIS C [Z / X]">KEYS C{{ octave }}</span>
    </InstrumentHeader>
    <Fretboard ref="board" instrument="bass" :tuning="BASS_TUNING" :first="first" :lit="lit" @count="count = $event" />
  </div>
</template>

<script setup lang="ts">
/**
 * BASS: four strings E1 A1 D2 G2 (bass.finger unless the armed track has
 * another voice), frets from the chosen position. Keys as the piano's, an
 * octave lower: A W S E D F T G Y H U J K O L P ; ' from C2, Z / X octave;
 * the notes they hold light up on the neck.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { LiveNote } from '~/radio/engine/types.ts'
import { BASS_TUNING, MAX_FRET } from '~/utils/voicings.ts'
import { OCTAVE_DOWN, OCTAVE_UP, pianoOffset } from '~/utils/keymaps.ts'

const rec = useRecorder()
const keysApi = useKeys()
const labels = keysApi.keyboardUsed
const first = ref(0)
const count = ref(7)
const octave = ref(2)
const board = ref<{ releaseAll(): void } | null>(null)

function move(d: number): void {
  first.value = Math.max(0, Math.min(MAX_FRET + 1 - count.value, first.value + d))
}

const byCode = reactive(new Map<string, { midi: number; note: LiveNote }>())
const lit = computed(() => [...byCode.values()].map(h => h.midi))

function keyDown(e: KeyboardEvent): boolean {
  if (e.code === OCTAVE_DOWN || e.code === OCTAVE_UP) {
    if (!e.repeat) octave.value = Math.max(0, Math.min(3, octave.value + (e.code === OCTAVE_UP ? 1 : -1)))
    return true
  }
  const off = pianoOffset(e.code)
  if (off === null) return false
  if (e.repeat || byCode.has(e.code)) return true
  const midi = (octave.value + 1) * 12 + off
  byCode.set(e.code, { midi, note: rec.play('bass', { midi }, e.shiftKey ? 1 : 0.8) })
  return true
}
function keyUp(e: KeyboardEvent): void {
  const h = byCode.get(e.code)
  if (!h) return
  byCode.delete(e.code)
  h.note.release()
}
function releaseAll(): void {
  board.value?.releaseAll()
  for (const h of byCode.values()) h.note.release()
  byCode.clear()
}

let off = () => {}
onMounted(() => { off = keysApi.register({ id: 'bass', down: keyDown, up: keyUp, blur: releaseAll }) })
onBeforeUnmount(() => { off(); releaseAll() })
</script>

<style scoped>
.pos { display: inline-flex; align-items: center; gap: 6px; }
.pos__b { width: var(--hit); padding: 0; }
.pos__v { min-width: 44px; text-align: center; color: var(--muted); }
.pos__keys { white-space: nowrap; }
</style>
