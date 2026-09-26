<template>
  <section class="dock" :class="{ 'dock--closed': closed }" aria-label="Instruments">
    <div class="dock__tabs" role="tablist">
      <button
        v-for="i in INSTRUMENTS"
        :key="i"
        type="button"
        role="tab"
        class="dock__tab"
        :class="{ on: instrument === i }"
        :aria-selected="instrument === i"
        :title="`${i.toUpperCase()} [TAB]`"
        @click="pick(i)"
      ><PxGlyph :name="i" /><span class="dock__tabname">{{ i.toUpperCase() }}</span></button>
      <span class="dock__fill" />
      <span class="dock__into" :class="{ rec: recording }" :title="into.title">
        <span class="px-dot" /> {{ into.text }}
      </span>
      <button type="button" class="dock__fold" :title="closed ? 'SHOW THE INSTRUMENT' : 'HIDE THE INSTRUMENT'" :aria-expanded="!closed" @click="closed = !closed">{{ closed ? '▲' : '▼' }}</button>
    </div>
    <div v-if="!closed" class="dock__body">
      <component :is="active" v-if="active" :key="instrument" />
      <div v-else class="dock__none">
        <PxGlyph :name="instrument" :u="4" />
        <p>THE {{ instrument.toUpperCase() }} IS NOT BUILT YET.</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * The instrument dock: tabs PIANO GUITAR BASS DRUMS TOUCH over the active
 * instrument.
 *
 * Convention: an instrument is `components/instruments/Instrument<Name>.vue`
 * (InstrumentPiano, InstrumentGuitar, InstrumentBass, InstrumentDrums,
 * InstrumentTouch). The dock loads it lazily and mounts only the active one;
 * switching tabs unmounts it, so release held notes and unregister keys in
 * onBeforeUnmount. It takes no props and fills the dock body (a flex item of
 * the body's height; `height: 100%` works). What it uses:
 *   - `useJam().live(layer, sound, vel)` to sound a note (returns a handle to
 *     release), with `useJam().targetFor(instrument)` for the layer and the
 *     voice or kit (the armed track's, else the instrument's default);
 *   - `useJam().currentChord()`, `scale()`, `key()` to light chord and scale
 *     tones; `position` for anything that follows the beat;
 *   - `useKeys().register({ id, down, up, blur })` for its computer keys, and
 *     `useKeys().keyboardUsed` to print the key names on the keys;
 *   - pointer events with `touch-action: none` on the playing surface
 *     (several fingers at once; each pointerId is one note).
 * The recorder (the REC button, `useJam().recording`) captures what the
 * instruments play; an instrument only plays.
 */
import { computed, defineAsyncComponent, ref, shallowRef, watch } from 'vue'
import type { Component } from 'vue'
import type { Instrument } from '~/radio/engine/piece/types.ts'
import { INSTRUMENTS } from '~/composables/useJam'
import { load, save } from '~/composables/storage'

const jam = useJam()
const { instrument, recording, armed } = jam

const loaders = import.meta.glob<{ default: Component }>('./instruments/Instrument*.vue')
const cache = new Map<string, Component>()

function componentOf(i: Instrument): Component | null {
  const name = i.charAt(0).toUpperCase() + i.slice(1)
  const loader = loaders[`./instruments/Instrument${name}.vue`]
  if (!loader) return null
  let c = cache.get(name)
  if (!c) { c = defineAsyncComponent(loader); cache.set(name, c) }
  return c
}

const active = shallowRef<Component | null>(componentOf(instrument.value))
watch(instrument, (i) => { active.value = componentOf(i) })

const closed = ref(load<boolean>('jam.dockClosed', false) === true)
watch(closed, v => save('jam.dockClosed', v))

function pick(i: Instrument): void {
  if (instrument.value === i && !closed.value) return
  jam.setInstrument(i)
  closed.value = false
}

const into = computed(() => {
  const t = jam.trackById(armed.value)
  if (t) return { text: t.name.toUpperCase(), title: `REC GOES INTO ${t.name.toUpperCase()}` }
  return { text: 'NEW TRACK', title: 'REC MAKES A NEW TRACK (ARM ONE WITH ITS DOT TO RECORD INTO IT)' }
})
</script>

<style scoped>
.dock {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: var(--dock-h);
  background: var(--bg-2);
  box-shadow: 0 -2px 0 0 var(--edge-dim);
}
.dock--closed { height: auto; }

.dock__tabs {
  display: flex;
  align-items: stretch;
  gap: 2px;
  padding: 0 calc(8px + var(--safe-r)) 0 calc(8px + var(--safe-l));
  background: var(--bg);
  min-width: 0;
}
.dock__tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 12px;
  border: 0;
  background: transparent;
  color: var(--subtle);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.dock__tab:hover { color: var(--ink); }
.dock__tab.on { color: var(--cyan); background: var(--bg-2); box-shadow: inset 0 2px 0 var(--cyan); }
.dock__fill { flex: 1; }
.dock__into { display: inline-flex; align-items: center; gap: 8px; padding: 0 8px; color: var(--subtle); white-space: nowrap; overflow: hidden; }
.dock__into.rec { color: var(--pink); }
.dock__fold {
  width: 44px;
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.dock__fold:hover { color: var(--ink); }

.dock__body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 8px calc(8px + var(--safe-r)) calc(8px + var(--app-safe-bottom)) calc(8px + var(--safe-l));
}
.dock__body > * { flex: 1; min-height: 0; }
.dock__none {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 12px;
  color: var(--subtle);
  text-align: center;
}
.dock__none p { margin: 0; }

.dock--closed .dock__tabs { padding-bottom: var(--app-safe-bottom); }

@media (max-width: 700px) {
  .dock__tab { padding: 0 10px; }
  .dock__tabname { display: none; }
  .dock__into { display: none; }
  .dock__tab { flex: 1; justify-content: center; }
}
</style>
