<template>
  <div class="ih">
    <select
      class="px-field ih__track"
      :value="current?.trackId ?? ''"
      :aria-label="`${NAME} records into`"
      title="THE TRACK THIS INSTRUMENT PLAYS AND RECORDS INTO"
      @change="pickTrack(($event.target as HTMLSelectElement).value)"
    >
      <option value="">NEW {{ NAME }} TRACK</option>
      <option v-for="t in tracks" :key="t.id" :value="t.id">{{ t.name.toUpperCase() }}</option>
    </select>
    <button
      type="button"
      class="px-btn px-btn--pink ih__arm"
      :class="{ on: !!current?.trackId }"
      :aria-pressed="!!current?.trackId"
      :title="current?.trackId ? 'DISARM: THE NEXT TAKE MAKES A NEW TRACK' : `ARM A NEW ${NAME} TRACK`"
      @click="toggleArm"
    ><span class="px-dot" /> ARM</button>
    <select
      class="px-field ih__sound"
      :value="soundNow"
      :aria-label="`${NAME} sound`"
      :title="instrument === 'drums' ? 'KIT' : 'VOICE'"
      @change="rec.setSound(instrument, ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="s in soundList" :key="s" :value="s">{{ label(s) }}</option>
    </select>
    <slot />
    <span class="ih__fill" />
    <RecOptions />
  </div>
</template>

<script setup lang="ts">
/**
 * The strip over each instrument: the track it plays into (the armed one
 * of its kind, or a new one: picking a track arms it), ARM, the sound
 * (voice or kit: the armed track's, or the one a new track gets), the
 * instrument's own controls (the slot) and the recording options.
 */
import { computed } from 'vue'
import type { Instrument } from '~/radio/engine/piece/types.ts'
import { KIT_IDS, VOICE_IDS } from '~/radio/engine/catalog.ts'

const props = defineProps<{ instrument: Instrument }>()

const jam = useJam()
const rec = useRecorder()

const NAME = props.instrument.toUpperCase()

const FAMILIES: Record<Instrument, string[]> = {
  piano: ['keys.piano', 'keys.felt', 'lead.ep', 'pad.', 'bell.', 'mallet.', 'arp.', 'counter.'],
  guitar: ['guitar.', 'pluck.harp', 'mallet.'],
  bass: ['bass.'],
  touch: ['lead.', 'counter.', 'bell.'],
  drums: [],
}

const sounds = computed<string[]>(() => {
  if (props.instrument === 'drums') return [...KIT_IDS]
  const out: string[] = []
  for (const f of FAMILIES[props.instrument]) {
    for (const v of VOICE_IDS) if ((f.endsWith('.') ? v.startsWith(f) : v === f) && !out.includes(v)) out.push(v)
  }
  return out
})

const current = computed(() => rec.target(props.instrument))
const soundNow = computed(() => current.value.kit ?? current.value.voice ?? '')
/** The list, plus the armed track's sound when it is not one of this instrument's. */
const soundList = computed(() => (soundNow.value && !sounds.value.includes(soundNow.value) ? [soundNow.value, ...sounds.value] : sounds.value))
const tracks = computed(() => jam.piece.value.tracks.filter(t => !!t.kit === (props.instrument === 'drums')))

function label(id: string): string {
  return id.replace('.', ' ').toUpperCase()
}

function pickTrack(id: string): void {
  const now = current.value.trackId
  if (id === (now ?? '')) return
  if (!id) { if (now) jam.arm(now); return }
  jam.arm(id)
}

function toggleArm(): void {
  const now = current.value.trackId
  if (now) { jam.arm(now); return }
  const t = current.value
  const id = jam.addTrack({ instrument: props.instrument, layer: t.layer, voice: t.voice, kit: t.kit, source: 'played', enter: jam.piece.value.intensity })
  if (id) jam.arm(id)
}
</script>

<style scoped>
.ih {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  min-width: 0;
  padding: 2px 2px 8px;
  overflow-x: auto;
  scrollbar-width: none;
  touch-action: pan-x;
}
.ih::-webkit-scrollbar { display: none; }
.ih > * { flex: none; }
.ih__track { width: 220px; }
.ih__sound { width: 170px; }
.ih__arm { display: inline-flex; align-items: center; gap: 6px; }
.ih__fill { flex: 1 1 0; }

@media (max-width: 700px) {
  .ih { gap: 6px; }
  .ih__track { width: 116px; order: -3; }
  .ih__arm { order: -2; }
  /* The recording options before the sound, so they are on screen. */
  .ro { order: -1; }
  .ih__sound { width: 128px; }
  .ih__fill { display: none; }
  .ih__arm { padding: 0 8px; }
}
</style>
