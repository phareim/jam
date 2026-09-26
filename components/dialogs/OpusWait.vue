<template>
  <div class="dl-work" role="status">
    <span class="dl-spin" aria-hidden="true"><span v-for="i in 8" :key="i" /></span>
    <div>
      <p class="ow__what">{{ what }}</p>
      <p class="dl-hint">{{ job.status === 'queued' ? 'WAITING ITS TURN' : hint }} · {{ elapsed }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/** Opus working on a job: the spinner, what it does, and how long it has taken. */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { JamJob } from '~/composables/useJobs'

const props = withDefaults(defineProps<{ job: JamJob; what: string; hint?: string }>(), { hint: 'A MINUTE OR THREE. YOU CAN CLOSE THIS.' })

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
const elapsed = computed(() => {
  const s = Math.max(0, Math.round((now.value - props.job.since) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 1000) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.ow__what { color: var(--gold); text-shadow: 2px 2px 0 var(--bg); }
</style>
