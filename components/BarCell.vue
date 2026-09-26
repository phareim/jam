<template>
  <div class="bc" :class="{ sel, empty: !bar }" :data-track="trackId" :data-bar="index">
    <svg v-if="d" class="bc__roll" :viewBox="`0 0 16 ${rows}`" preserveAspectRatio="none" aria-hidden="true"><path :d="d" /></svg>
  </div>
</template>

<script setup lang="ts">
/**
 * One bar of one track: a mini note-roll (notes as bars on the track's own
 * pitch range) or hit dots (one row per drum hit the track uses). One SVG
 * path per cell, cached by bar string and range, so 32 bars × 24 tracks
 * stay cheap. `data-track` / `data-bar` let the grid find the cell under a
 * finger.
 */
import { computed } from 'vue'
import { grooveOf, notesOf } from '~/radio/engine/piece/conductor.ts'

const props = defineProps<{
  trackId: string
  index: number
  bar: string
  kit: boolean
  /** Lowest and highest MIDI note drawn (note tracks). */
  lo: number
  hi: number
  /** Drum hits drawn, one row each, top first (kit tracks), e.g. 'hsk'. */
  hits: string
  sel: boolean
}>()

const cache = new Map<string, string>()

const rows = computed(() => (props.kit ? Math.max(1, props.hits.length) : props.hi - props.lo + 1))

const d = computed(() => {
  if (!props.bar) return ''
  const k = `${props.kit ? 1 : 0}|${props.lo}|${props.hi}|${props.hits}|${props.bar}`
  let s = cache.get(k)
  if (s !== undefined) return s
  s = ''
  if (props.kit) {
    const g = grooveOf(props.bar)
    for (const [hit, row] of Object.entries(g)) {
      const y = props.hits.indexOf(hit)
      if (y < 0 || !row) continue
      for (let i = 0; i < 16; i++) {
        const c = row[i]
        if (c === 'X' || c === 'x') s += `M${i + 0.12} ${y + 0.12}h0.76v0.76h-0.76z`
        else if (c === 'g') s += `M${i + 0.3} ${y + 0.3}h0.4v0.4h-0.4z`
        else if (c === '-') s += `M${i} ${y + 0.4}h1v0.2h-1z`
      }
    }
  } else {
    for (const n of notesOf(props.bar)) {
      if (n.midi < props.lo || n.midi > props.hi) continue
      const w = Math.max(0.35, Math.min(n.len, 16 - n.step) - 0.08)
      s += `M${n.step} ${props.hi - n.midi}h${w.toFixed(2)}v1h-${w.toFixed(2)}z`
    }
  }
  if (cache.size > 4000) cache.clear()
  cache.set(k, s)
  return s
})
</script>

<style scoped>
.bc {
  position: relative;
  flex: none;
  width: var(--bar-w);
  min-height: var(--row-h);
  box-shadow: inset 1px 0 0 var(--bg-3);
  background: var(--bg-2);
}
.bc:nth-child(4n + 1) { box-shadow: inset 2px 0 0 var(--bg-3); }
.bc.empty { background: color-mix(in srgb, var(--bg-2) 55%, var(--bg)); }
.bc.sel { background: color-mix(in srgb, var(--cyan) 18%, var(--bg-2)); box-shadow: inset 0 0 0 2px var(--cyan); }
.bc__roll {
  position: absolute;
  inset: 5px 3px;
  display: block;
  width: calc(100% - 6px);
  height: calc(100% - 10px);
  fill: var(--tone, var(--pink));
  shape-rendering: crispEdges;
}
</style>
