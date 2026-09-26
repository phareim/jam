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
  grid-template: minmax(0, 1fr) / minmax(0, 1fr);
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
/* The padding keeps the 2 px pixel edges of what is inside from being clipped by the scroller. */
.df__body { min-height: 0; margin: 0 -4px; padding: 2px 4px; overflow-y: auto; overscroll-behavior: contain; }
.df__actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 14px; flex-wrap: wrap; }

@media (max-width: 700px) {
  .df__veil { place-items: start center; padding-top: calc(12px + var(--safe-t)); }
}
</style>

<style>
/*
 * Shared bits of the dialogs' bodies (global, loaded with the first dialog):
 * paragraphs, section labels, chips, lists, the text box and Opus's
 * working spinner. Gold is Opus, pink is Petter, cyan the interface.
 */
.dl-p { margin: 0 0 10px; color: var(--muted); }
.dl-hint { margin: 0; color: var(--subtle); }
.dl-err { margin: 8px 0 0; color: var(--pink); overflow-wrap: anywhere; }
.dl-sec { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 14px 0 8px; color: var(--cyan); text-shadow: 2px 2px 0 var(--bg); }
.dl-sec:first-child { margin-top: 0; }
.dl-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.dl-chip { min-width: var(--hit); padding: 0 8px; }
.dl-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dl-grow { flex: 1 1 auto; min-width: 0; }
.dl-list { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; margin: 0; padding: 0; list-style: none; }
.dl-item { display: flex; align-items: center; gap: 8px; min-height: calc(var(--hit) + 8px); padding: 4px 4px 4px 10px; background: var(--bg-2); }
.dl-item__main { flex: 1 1 auto; min-width: 0; }
.dl-item__name { display: block; color: var(--ink); overflow-wrap: anywhere; }
.dl-item__sub { display: block; color: var(--subtle); overflow-wrap: anywhere; }
.dl-x { flex: none; min-width: var(--hit); height: var(--hit); padding: 0 6px; border: 0; background: transparent; color: var(--subtle); cursor: pointer; }
.dl-x:hover, .dl-x:focus-visible { outline: none; color: var(--pink); }
.dl-x.sure { color: var(--pink); }
.dl-link { color: var(--cyan); text-decoration: none; box-shadow: 0 2px 0 0 currentColor; }
.dl-link:hover, .dl-link:focus-visible { outline: none; color: var(--ink); }

.dl-text {
  display: block;
  width: 100%;
  padding: 8px;
  border: 0;
  border-radius: 0;
  background: var(--bg-3);
  box-shadow: inset 0 0 0 2px var(--edge-dim);
  color: var(--ink);
  font-family: var(--font-pixel);
  font-size: 16px;
  line-height: 20px;
  resize: none;
  user-select: text;
  -webkit-user-select: text;
  -webkit-font-smoothing: none;
}
.dl-text:focus { outline: none; box-shadow: inset 0 0 0 2px var(--dl-focus, var(--cyan)); }
.dl-text::placeholder { color: var(--subtle); }
.px-box--gold .dl-text { --dl-focus: var(--gold); }
.px-box--pink .dl-text { --dl-focus: var(--pink); }

/* Opus at work: a ring of eight pixel blocks, one lit at a time. */
.dl-work { display: flex; align-items: center; gap: 14px; margin: 4px 0; }
.dl-work p { margin: 0; }
.dl-spin { position: relative; flex: none; width: 32px; height: 32px; }
.dl-spin span { position: absolute; width: 8px; height: 8px; background: color-mix(in srgb, var(--gold) 25%, var(--bg)); animation: dl-spin 0.8s steps(1) infinite; }
.dl-spin span:nth-child(1) { left: 12px; top: 0; animation-delay: 0s; }
.dl-spin span:nth-child(2) { left: 22px; top: 2px; animation-delay: 0.1s; }
.dl-spin span:nth-child(3) { left: 24px; top: 12px; animation-delay: 0.2s; }
.dl-spin span:nth-child(4) { left: 22px; top: 22px; animation-delay: 0.3s; }
.dl-spin span:nth-child(5) { left: 12px; top: 24px; animation-delay: 0.4s; }
.dl-spin span:nth-child(6) { left: 2px; top: 22px; animation-delay: 0.5s; }
.dl-spin span:nth-child(7) { left: 0; top: 12px; animation-delay: 0.6s; }
.dl-spin span:nth-child(8) { left: 2px; top: 2px; animation-delay: 0.7s; }
@keyframes dl-spin {
  0% { background: var(--gold); box-shadow: 0 0 8px var(--gold); }
  12.5% { background: color-mix(in srgb, var(--gold) 25%, var(--bg)); box-shadow: none; }
}
@media (prefers-reduced-motion: reduce) { .dl-spin span { animation: none; } }
</style>
