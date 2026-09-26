<template>
  <div
    ref="el"
    class="tl"
    role="slider"
    tabindex="0"
    aria-label="Enters at intensity"
    aria-valuemin="0"
    aria-valuemax="4"
    :aria-valuenow="enter"
    :aria-valuetext="INTENSITY_NAMES[enter]"
    :title="`PLAYS FROM ${INTENSITY_NAMES[enter]} UP`"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="up"
    @keydown="key"
  >
    <span v-for="i in 5" :key="i" class="tl__s" :class="{ lit: i - 1 >= enter, at: i - 1 === enter, now: i - 1 === intensity }" />
  </div>
</template>

<script setup lang="ts">
/**
 * A track's ladder level: five steps STILL..SURGE, lit from the level the
 * track enters at upwards. Tap or drag across it; arrow keys when focused.
 * The step of the current intensity has a mark under it.
 */
import { ref } from 'vue'
import { INTENSITY_NAMES } from '~/radio/engine/catalog.ts'

const props = defineProps<{ enter: number; intensity: number }>()
const emit = defineEmits<{ set: [level: number] }>()
const el = ref<HTMLElement | null>(null)
let dragging = false

function at(x: number): void {
  const r = el.value?.getBoundingClientRect()
  if (!r) return
  const l = Math.max(0, Math.min(4, Math.floor(((x - r.left) / r.width) * 5)))
  if (l !== props.enter) emit('set', l)
}
function down(e: PointerEvent): void {
  dragging = true
  el.value?.setPointerCapture(e.pointerId)
  at(e.clientX)
}
function move(e: PointerEvent): void { if (dragging) at(e.clientX) }
function up(): void { dragging = false }
function key(e: KeyboardEvent): void {
  const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0
  if (!d) return
  e.preventDefault()
  e.stopPropagation()
  const l = Math.max(0, Math.min(4, props.enter + d))
  if (l !== props.enter) emit('set', l)
}
</script>

<style scoped>
.tl {
  flex: none;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  align-items: end;
  gap: 2px;
  width: 64px;
  height: 40px;
  padding: 8px 2px 8px;
  cursor: pointer;
  touch-action: none;
  outline: none;
}
.tl:focus-visible { box-shadow: inset 0 -2px 0 var(--cyan); }
.tl__s { position: relative; display: block; background: var(--bg-3); }
.tl__s:nth-child(1) { height: 8px; }
.tl__s:nth-child(2) { height: 11px; }
.tl__s:nth-child(3) { height: 14px; }
.tl__s:nth-child(4) { height: 17px; }
.tl__s:nth-child(5) { height: 20px; }
.tl__s.lit { background: color-mix(in srgb, var(--tone, var(--pink)) 45%, var(--bg)); }
.tl__s.at { background: var(--tone, var(--pink)); }
.tl__s.now::after { content: ''; position: absolute; left: 0; right: 0; bottom: -5px; height: 2px; background: var(--ink); }
</style>
