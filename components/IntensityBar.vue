<template>
  <div class="ib" role="radiogroup" aria-label="Intensity">
    <span class="ib__name">{{ INTENSITY_NAMES[piece.intensity] }}</span>
    <div class="ib__segs">
      <button
        v-for="(name, i) in INTENSITY_NAMES"
        :key="name"
        type="button"
        role="radio"
        class="ib__seg"
        :class="{ lit: i <= piece.intensity, now: i === piece.intensity }"
        :aria-checked="i === piece.intensity"
        :aria-label="name"
        :title="`${name} [ [ ] ]`"
        @click="setIntensity(i)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Intensity, five steps STILL..SURGE, as on the radio: tracks whose ladder
 * step is above it fall silent (and dim in the grid). Lands on the next bar.
 */
import { INTENSITY_NAMES } from '~/radio/engine/catalog.ts'

const { piece, setIntensity } = useJam()
</script>

<style scoped>
.ib { display: flex; align-items: center; gap: 10px; }
.ib__name { min-width: 72px; color: var(--pink); text-shadow: 2px 2px 0 var(--bg); text-align: right; }
.ib__segs { display: grid; grid-template-columns: repeat(5, 18px); gap: 4px; align-items: end; height: var(--hit); padding-bottom: 6px; }
.ib__seg {
  position: relative;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: color-mix(in srgb, var(--pink) 10%, var(--bg));
  box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--pink) 22%, var(--bg));
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.ib__seg:nth-child(1) { height: 12px; }
.ib__seg:nth-child(2) { height: 16px; }
.ib__seg:nth-child(3) { height: 20px; }
.ib__seg:nth-child(4) { height: 24px; }
.ib__seg:nth-child(5) { height: 28px; }
/* The segment is short; its tap area is not. */
.ib__seg::after { content: ''; position: absolute; left: -2px; right: -2px; bottom: -6px; height: var(--hit); }
.ib__seg:focus-visible { outline: 2px solid var(--ink); outline-offset: 1px; }
.ib__seg.lit { background: color-mix(in srgb, var(--pink) 45%, var(--bg)); box-shadow: none; }
.ib__seg.now { background: var(--pink); box-shadow: 0 0 12px color-mix(in srgb, var(--pink) 55%, transparent); }
</style>
