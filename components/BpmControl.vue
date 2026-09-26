<template>
  <div class="bpm">
    <span class="px-label">BPM</span>
    <input
      v-if="typing"
      ref="field"
      class="px-field bpm__field"
      inputmode="numeric"
      :value="piece.bpm"
      aria-label="Tempo in beats per minute"
      @keydown.enter="($event.target as HTMLInputElement).blur()"
      @keydown.esc="typing = false"
      @blur="commit(($event.target as HTMLInputElement).value)"
    >
    <span
      v-else
      class="px-field bpm__field bpm__drag"
      role="spinbutton"
      tabindex="0"
      :aria-valuenow="piece.bpm"
      aria-valuemin="50"
      aria-valuemax="200"
      aria-label="Tempo: drag, or tap to type"
      title="DRAG TO CHANGE, TAP TO TYPE"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
      @keydown="key"
    >{{ piece.bpm }}</span>
    <button type="button" class="px-btn px-btn--dim bpm__tap" title="TAP THE BEAT" @pointerdown="tap">TAP</button>
  </div>
</template>

<script setup lang="ts">
/** Tempo: drag the number sideways or up and down, tap it to type, or tap the beat on TAP. A drag is one undo step. */
import { nextTick, ref } from 'vue'

const { piece, setBpm } = useJam()
const typing = ref(false)
const field = ref<HTMLInputElement | null>(null)
let drag: { x: number; y: number; bpm: number; moved: boolean; id: number } | null = null

function down(e: PointerEvent): void {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  drag = { x: e.clientX, y: e.clientY, bpm: piece.value.bpm, moved: false, id: e.pointerId }
}
function move(e: PointerEvent): void {
  if (!drag || e.pointerId !== drag.id) return
  const d = (e.clientX - drag.x) - (e.clientY - drag.y)
  if (!drag.moved && Math.abs(d) < 6) return
  drag.moved = true
  setBpm(drag.bpm + Math.round(d / 4))
}
function up(e: PointerEvent): void {
  if (!drag || e.pointerId !== drag.id) return
  const tapped = !drag.moved && e.type === 'pointerup'
  drag = null
  if (!tapped) return
  typing.value = true
  void nextTick(() => { field.value?.focus(); field.value?.select() })
}
function key(e: KeyboardEvent): void {
  const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0
  if (!d) return
  e.preventDefault()
  e.stopPropagation()
  setBpm(piece.value.bpm + d * (e.shiftKey ? 10 : 1))
}
function commit(v: string): void {
  typing.value = false
  const n = Number(v)
  if (Number.isFinite(n) && n > 0) setBpm(n)
}

let taps: number[] = []
function tap(): void {
  const t = performance.now()
  taps = taps.filter(x => t - x < 2500)
  taps.push(t)
  if (taps.length < 3) return
  const gaps = taps.slice(1).map((x, i) => x - taps[i]!)
  setBpm(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length))
}
</script>

<style scoped>
.bpm { display: flex; align-items: center; gap: 8px; }
.bpm__field { width: 56px; display: inline-flex; align-items: center; justify-content: center; text-align: center; color: var(--cyan); }
.bpm__drag { cursor: ew-resize; touch-action: none; }
.bpm__tap { padding: 0 8px; }
</style>
