<template>
  <svg class="pxg" :viewBox="`0 0 ${w} ${h}`" :width="w * u" :height="h * u" aria-hidden="true"><path :d="d" /></svg>
</template>

<script setup lang="ts">
/**
 * Small pixel pictures in the font's grid (one glyph pixel = `u` CSS px):
 * the five instruments and a few marks the font lacks. Filled with
 * currentColor.
 */
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name: string; u?: number }>(), { u: 2 })

const GLYPHS: Record<string, string[]> = {
  piano: [
    '111111111',
    '1.11.11.1',
    '1.11.11.1',
    '1.11.11.1',
    '1..1..1.1',
    '1..1..1.1',
    '111111111',
  ],
  guitar: [
    '.......11',
    '......11.',
    '.....1...',
    '.11.1....',
    '1..1.....',
    '1...1....',
    '.111.....',
  ],
  bass: [
    '1..1..1..',
    '111111111',
    '1..1..1..',
    '111111111',
    '1..1..1..',
    '111111111',
    '1..1..1..',
  ],
  drums: [
    '1.......1',
    '.1.....1.',
    '.1111111.',
    '1.......1',
    '111111111',
    '1.1.1.1.1',
    '.1111111.',
  ],
  touch: [
    '.........',
    '.11......',
    '1..1.....',
    '1..1....1',
    '....1..1.',
    '....1..1.',
    '.....11..',
  ],
  grow: [
    '..11.....',
    '.1..1.11.',
    '.1..11..1',
    '..1.1..1.',
    '....111..',
    '....1....',
    '..11111..',
  ],
}

const rows = computed(() => GLYPHS[props.name] ?? GLYPHS.piano!)
const w = computed(() => rows.value[0]!.length)
const h = computed(() => rows.value.length)
const d = computed(() => {
  let s = ''
  rows.value.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '1') s += `M${x} ${y}h1v1h-1z`
  })
  return s
})
</script>

<style scoped>
.pxg {
  display: inline-block;
  flex: none;
  fill: currentColor;
  shape-rendering: crispEdges;
  vertical-align: middle;
  filter: drop-shadow(2px 2px 0 var(--bg));
}
</style>
