<template>
  <component :is="comp" v-if="cur && comp" :key="cur.n" v-bind="cur.props" @close="close" />
</template>

<script setup lang="ts">
/**
 * Shows the dialog useDialogs() has open (see composables/useDialogs.ts for
 * the convention). While one is open the page's keys are off and Escape
 * closes it, unless the dialog sets its own handler with useKeys().setDialog().
 */
import { computed, defineAsyncComponent, watch } from 'vue'
import type { Component } from 'vue'

const dialogs = useDialogs()
// Opus's jobs outlive their dialogs: pick up any still running (after a reload too).
useJobs()
const keys = useKeys()
const cur = dialogs.current
const cache = new Map<string, Component>()

const comp = computed<Component | null>(() => {
  const d = cur.value
  if (!d) return null
  let c = cache.get(d.name)
  if (!c) {
    const loader = dialogs.loader(d.name)
    if (!loader) return null
    c = defineAsyncComponent(loader)
    cache.set(d.name, c)
  }
  return c
})

function close(): void { dialogs.close() }

watch(cur, (d) => {
  keys.setDialog(d ? { id: 'dialog', down: (e) => { if (e.key === 'Escape') { close(); return true } return false } } : null)
}, { immediate: true })
</script>
