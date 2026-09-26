<template>
  <div class="df__veil" @pointerdown.self="emit('close')">
    <div class="df px-box" :class="toneClass" role="dialog" :aria-label="title" :style="{ width: `min(${width}px, 100%)` }">
      <div class="df__top">
        <p class="df__title">{{ title }}</p>
        <button type="button" class="df__x" aria-label="Close" title="CLOSE [ESC]" @click="emit('close')">×</button>
      </div>
      <div class="df__body"><slot /></div>
      <div v-if="$slots.actions" class="df__actions"><slot name="actions" /></div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The frame every dialog uses: a veil over the page, a notched box with a
 * title and ×, a scrolling body, and an actions row. Tone: cyan (the
 * interface), gold (Opus), pink (your own things). Import it explicitly:
 *   import DialogFrame from '~/components/dialogs/DialogFrame.vue'
 */
import { computed } from 'vue'

const props = withDefaults(defineProps<{ title: string; tone?: 'cyan' | 'gold' | 'pink'; width?: number }>(), { tone: 'cyan', width: 560 })
const emit = defineEmits<{ close: [] }>()
const toneClass = computed(() => (props.tone === 'cyan' ? '' : `px-box--${props.tone}`))
</script>

<style scoped>
.df__veil {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: max(16px, var(--safe-t)) calc(16px + var(--safe-r)) calc(16px + var(--app-safe-bottom)) calc(16px + var(--safe-l));
  background: rgba(11, 6, 22, 0.66);
}
.df {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  max-height: 100%;
  padding: 12px 16px 14px;
  background: var(--bg);
  color: var(--ink);
  font-size: 16px;
  line-height: 20px;
  text-transform: uppercase;
}
.df__top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.df__title { margin: 0; color: var(--px-edge); text-shadow: 2px 2px 0 var(--bg); }
.df__x {
  width: var(--hit);
  height: var(--hit);
  margin: -8px -10px -8px 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--subtle);
  cursor: pointer;
}
.df__x:hover { color: var(--ink); }
.df__body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.df__actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 14px; flex-wrap: wrap; }

@media (max-width: 700px) {
  .df__veil { place-items: start center; padding-top: calc(12px + var(--safe-t)); }
}
</style>
