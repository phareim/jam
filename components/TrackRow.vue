<template>
  <div
    class="tr"
    :class="{ 'tr--silent': silent, 'tr--armed': armed, 'tr--open': open }"
    :style="{ '--tone': tone }"
  >
    <div class="tr__head">
      <div class="tr__line">
        <button type="button" class="tr__glyph" :title="open ? 'FEWER CONTROLS' : 'MORE CONTROLS'" :aria-expanded="open" @click="open = !open">
          <PxGlyph :name="track.instrument ?? (track.kit ? 'drums' : 'piano')" />
        </button>
        <input
          class="tr__name"
          :value="track.name"
          maxlength="40"
          spellcheck="false"
          :aria-label="`Track name: ${track.name}`"
          @change="rename(($event.target as HTMLInputElement).value)"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        >
        <TrackLadder class="tr__w3" :enter="track.enter" :intensity="intensity" @set="setEnter" />
        <button type="button" class="tr__tog tr__w2" :class="{ on: track.mute }" :aria-pressed="!!track.mute" title="MUTE" @click="toggle('mute')">M</button>
        <button type="button" class="tr__tog tr__tog--gold tr__w2" :class="{ on: track.solo }" :aria-pressed="!!track.solo" title="SOLO" @click="toggle('solo')">S</button>
        <button type="button" class="tr__tog tr__tog--pink" :class="{ on: armed }" :aria-pressed="armed" title="ARM: RECORD INTO THIS TRACK" @click="jam.arm(track.id)"><span class="px-dot" /></button>
      </div>
      <div v-if="open" class="tr__more">
        <div class="tr__line tr__n2">
          <TrackLadder :enter="track.enter" :intensity="intensity" @set="setEnter" />
          <button type="button" class="tr__tog" :class="{ on: track.mute }" title="MUTE" @click="toggle('mute')">M</button>
          <button type="button" class="tr__tog tr__tog--gold" :class="{ on: track.solo }" title="SOLO" @click="toggle('solo')">S</button>
        </div>
        <div class="tr__line">
          <select class="px-field tr__voice" :value="track.kit ?? track.voice" :aria-label="`Sound of ${track.name}`" @change="setSound(($event.target as HTMLSelectElement).value)">
            <template v-if="track.kit">
              <option v-for="k in KIT_IDS" :key="k" :value="k">{{ label(k) }}</option>
            </template>
            <template v-else>
              <optgroup v-for="g in VOICE_GROUPS" :key="g.family" :label="g.family.toUpperCase()">
                <option v-for="v in g.voices" :key="v" :value="v">{{ label(v) }}</option>
              </optgroup>
            </template>
          </select>
          <select class="px-field tr__layer" :value="track.layer" :aria-label="`Layer of ${track.name}`" title="LAYER: THE MIXER CHANNEL" @change="setLayer(($event.target as HTMLSelectElement).value as Layer)">
            <option v-for="l in layers" :key="l" :value="l">{{ l.toUpperCase() }}</option>
          </select>
        </div>
        <div class="tr__line">
          <PxSlider
            class="tr__gain"
            :model-value="track.gain ?? 1"
            label="GAIN"
            :max="1.5"
            :step="0.05"
            :segments="15"
            compact
            :format="(v: number) => `${Math.round(v * 100)}`"
            @update:model-value="jam.updateTrack(track.id, { gain: $event }, `gain:${track.id}`)"
          />
          <button type="button" class="tr__del" title="DELETE THIS TRACK (UNDO BRINGS IT BACK)" @click="jam.removeTrack(track.id)">DEL</button>
        </div>
      </div>
    </div>
    <div class="tr__cells">
      <div v-for="p in phrases" :key="p" class="tr__phrase">
        <BarCell
          v-for="b in 8"
          :key="b"
          :track-id="track.id"
          :index="(p - 1) * 8 + b - 1"
          :bar="track.bars[(p - 1) * 8 + b - 1] ?? ''"
          :kit="!!track.kit"
          :lo="range[0]"
          :hi="range[1]"
          :hits="hits"
          :sel="isSel((p - 1) * 8 + b - 1)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * One track: its header (instrument glyph, name, ladder level, mute, solo,
 * arm; the glyph opens sound, layer, gain and delete) and its bars grouped
 * by phrase. A track that enters above the current intensity is dimmed:
 * it is silent now.
 */
import { computed, ref } from 'vue'
import type { Layer, VoiceId } from '~/radio/engine/types.ts'
import { DRUM_HITS, KIT_IDS, VOICE_IDS } from '~/radio/engine/catalog.ts'
import { notesOf, grooveOf } from '~/radio/engine/piece/conductor.ts'
import type { Level, Track } from '~/radio/engine/piece/types.ts'

const props = defineProps<{
  track: Track
  phrases: number
  intensity: number
  soloing: boolean
  /** Selected bars of this track, inclusive, or null. */
  selFrom: number | null
  selTo: number | null
}>()

const jam = useJam()
const open = ref(false)

const armed = computed(() => jam.armed.value === props.track.id)
const silent = computed(() => props.track.enter > props.intensity || !!props.track.mute || (props.soloing && !props.track.solo))
const tone = computed(() => {
  const s = props.track.source
  return s === 'grown' || s === 'opus' ? 'var(--gold)' : s === 'library' ? 'var(--cyan)' : 'var(--pink)'
})

const VOICE_GROUPS = (() => {
  const groups: Array<{ family: string; voices: VoiceId[] }> = []
  for (const v of VOICE_IDS) {
    const family = v.split('.')[0]!
    let g = groups.find(x => x.family === family)
    if (!g) { g = { family, voices: [] }; groups.push(g) }
    g.voices.push(v)
  }
  return groups
})()

const layers = computed<Layer[]>(() => (props.track.kit ? ['drums', 'perc'] : ['pad', 'bass', 'arp', 'lead', 'counter', 'bells', 'drone']))

function label(id: string): string {
  return id.replace('.', ' ').toUpperCase()
}

/** The pitches the track spans, at least an octave, for the note-roll. */
const range = computed<[number, number]>(() => {
  if (props.track.kit) return [0, 0]
  let lo = 127
  let hi = 0
  for (const b of props.track.bars) {
    if (!b) continue
    for (const n of notesOf(b)) { if (n.midi < lo) lo = n.midi; if (n.midi > hi) hi = n.midi }
  }
  if (lo > hi) return [60, 72]
  const pad = Math.max(0, 12 - (hi - lo))
  return [lo - Math.floor(pad / 2), hi + Math.ceil(pad / 2)]
})

/** The drum hits the track uses, cymbals on top, kick at the bottom. */
const hits = computed(() => {
  if (!props.track.kit) return ''
  const used = new Set<string>()
  for (const b of props.track.bars) if (b) for (const [h, row] of Object.entries(grooveOf(b))) if (row && /[xXg]/.test(row)) used.add(h)
  const order = ['x', 'r', 'o', 'h', 'c', 's', 'p', 'T', 'm', 't', 'k', 'z'].filter(h => DRUM_HITS.includes(h as never))
  return order.filter(h => used.has(h)).join('')
})

function isSel(b: number): boolean {
  return props.selFrom !== null && props.selTo !== null && b >= props.selFrom && b <= props.selTo
}

function rename(v: string): void {
  const name = v.trim().slice(0, 40)
  if (name && name !== props.track.name) jam.updateTrack(props.track.id, { name })
}
function setEnter(l: number): void { jam.updateTrack(props.track.id, { enter: l as Level }) }
function toggle(k: 'mute' | 'solo'): void { jam.updateTrack(props.track.id, { [k]: !props.track[k] }) }
function setSound(id: string): void {
  if (props.track.kit) jam.updateTrack(props.track.id, { kit: id as Track['kit'] })
  else jam.updateTrack(props.track.id, { voice: id as VoiceId })
}
function setLayer(l: Layer): void { jam.updateTrack(props.track.id, { layer: l }) }
</script>

<style scoped>
.tr {
  display: flex;
  min-height: var(--row-h);
  box-shadow: 0 1px 0 0 var(--bg);
}

.tr__head {
  position: sticky;
  left: 0;
  z-index: 3;
  flex: none;
  width: var(--head-w);
  padding: 2px 8px 2px calc(8px + var(--safe-l));
  margin-left: calc(-1 * var(--safe-l));
  background: var(--bg);
  box-shadow: 2px 0 0 0 var(--edge-dim);
}
.tr--armed .tr__head { box-shadow: 2px 0 0 0 var(--edge-dim), inset 4px 0 0 0 var(--pink); }

.tr__line { display: flex; align-items: center; gap: 4px; min-height: 40px; min-width: 0; }
.tr__more { display: grid; gap: 4px; padding: 4px 0 6px; }

.tr__glyph {
  flex: none;
  width: 32px;
  height: 40px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--tone);
  cursor: pointer;
}
.tr--open .tr__glyph { color: var(--ink); }

.tr__name {
  flex: 1 1 auto;
  min-width: 0;
  height: 36px;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: var(--ink);
  font-family: var(--font-pixel);
  font-size: 16px;
  text-transform: uppercase;
  text-overflow: ellipsis;
  text-shadow: 2px 2px 0 var(--bg);
  outline: none;
  user-select: text;
  -webkit-user-select: text;
}
.tr__name:focus { box-shadow: 0 2px 0 0 var(--cyan); }
.tr--silent .tr__name { color: var(--subtle); }

.tr__tog {
  flex: none;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  background: var(--bg-2);
  color: var(--subtle);
  box-shadow: inset 0 0 0 2px var(--bg-3);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.tr__tog:hover { color: var(--ink); }
.tr__tog.on { background: var(--cyan); color: var(--bg); box-shadow: none; }
.tr__tog--gold.on { background: var(--gold); }
.tr__tog--pink { color: color-mix(in srgb, var(--pink) 50%, var(--subtle)); }
.tr__tog--pink.on { background: var(--pink); color: var(--bg); }

.tr__voice { flex: 1 1 auto; min-width: 0; }
.tr__layer { flex: 0 0 104px; }
.tr__gain { flex: 1 1 auto; --pxs-label-w: auto; min-width: 0; }
.tr__del {
  flex: none;
  height: 40px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--subtle);
  cursor: pointer;
}
.tr__del:hover { color: var(--pink); }

.tr__cells { display: flex; gap: var(--phrase-gap); padding-left: var(--phrase-gap); }
.tr__phrase { display: flex; }
.tr--silent .tr__cells { opacity: 0.4; }

/* Which controls sit on the first line, by the header's width. */
.tr__n2 { display: none; }
@media (max-width: 899px) {
  .tr__w3 { display: none; }
  .tr__n2 { display: flex; }
  .tr__n2 .tr__tog { display: none; }
}
@media (max-width: 599px) {
  .tr__w2 { display: none; }
  .tr__n2 .tr__tog { display: inline-block; }
}
</style>
