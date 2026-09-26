<template>
  <div v-show="position.bar >= 0" class="ph" :style="{ transform: `translateX(${x}px)` }" aria-hidden="true" />
</template>

<script setup lang="ts">
/**
 * The playhead over the arrangement. Its own component, so following
 * `position.step` every frame re-renders this line and nothing else.
 */
import { computed } from 'vue'

const props = defineProps<{ headW: number; barW: number; gap: number }>()
const { position } = useJam()

const x = computed(() => {
  const b = Math.max(0, position.bar)
  return props.headW + props.gap * (Math.floor(b / 8) + 1) + (b + position.step / 16) * props.barW
})
</script>

<style scoped>
.ph {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 2;
  width: 2px;
  background: var(--pink);
  box-shadow: 0 0 8px color-mix(in srgb, var(--pink) 70%, transparent);
  pointer-events: none;
  will-change: transform;
}
</style>
