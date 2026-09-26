<template>
  <DialogFrame title="LIBRARY" :width="680" @close="close">
    <div class="lb__bar">
      <div class="dl-chips lb__kinds" role="radiogroup" aria-label="Kind">
        <button
          v-for="k in KIND_TABS"
          :key="k"
          type="button"
          role="radio"
          class="px-btn px-btn--dim dl-chip"
          :class="{ on: kind === k, 'lb__yours': k === 'yours' }"
          :aria-checked="kind === k"
          @click="kind = k"
        >{{ k.toUpperCase() }}</button>
      </div>
      <div class="dl-row">
        <select v-if="kind !== 'yours'" v-model="place" class="px-field dl-grow lb__place" aria-label="From which channel">
          <option value="">EVERY CHANNEL</option>
          <option v-for="L in jam.landscapes.value" :key="L.id" :value="L.id">{{ L.name.toUpperCase() }}</option>
        </select>
        <div class="dl-row lb__target" role="radiogroup" aria-label="Where to insert">
          <span class="px-label">INTO</span>
          <button type="button" role="radio" class="px-btn px-btn--dim dl-chip" :class="{ on: target === 'new' }" :aria-checked="target === 'new'" @click="target = 'new'">NEW TRACK</button>
          <button
            type="button"
            role="radio"
            class="px-btn px-btn--dim dl-chip"
            :class="{ on: target === 'sel' }"
            :aria-checked="target === 'sel'"
            :disabled="!sel"
            :title="sel ? selText : 'SELECT BARS IN THE GRID FIRST'"
            @click="target = 'sel'"
          >SELECTION</button>
        </div>
      </div>
      <p v-if="target === 'sel' && sel" class="dl-hint">{{ selText }}</p>
    </div>

    <template v-if="kind === 'yours'">
      <p v-if="snippets.state.value === 'loading'" class="dl-hint">LOADING...</p>
      <p v-if="snippets.state.value === 'error'" class="dl-err">COULD NOT LOAD YOUR SAVED SNIPPETS.</p>
      <p v-if="!allSnippets.length && snippets.state.value !== 'loading'" class="dl-hint">NO SNIPPETS YET. SELECT BARS IN THE GRID AND PRESS SNIPPET.</p>
      <ul class="dl-list">
        <li v-for="s in allSnippets" :key="String(s.id)" class="dl-item lb__item" :style="{ '--acc': 'var(--pink)' }">
          <button type="button" class="lb__play" :class="{ on: aud.current.value === `s:${s.id}` }" :aria-label="`Hear ${s.name}`" @click="hearSnippet(s)">{{ aud.current.value === `s:${s.id}` ? '■' : '▶' }}</button>
          <span class="dl-item__main">
            <span class="dl-item__name">{{ s.name }}</span>
            <span class="dl-item__sub">{{ s.kind.toUpperCase() }} · {{ s.track.bars.length }} BAR{{ s.track.bars.length === 1 ? '' : 'S' }}{{ s.local ? ' · THIS BROWSER' : '' }}</span>
          </span>
          <button type="button" class="px-btn px-btn--dim" @click="insertSnippet(s)">INSERT</button>
          <button type="button" class="dl-x" :class="{ sure: sure === String(s.id) }" :title="`DELETE ${s.name.toUpperCase()}`" @click="removeSnippet(s)">{{ sure === String(s.id) ? 'SURE? ×' : '×' }}</button>
        </li>
      </ul>
    </template>

    <template v-else>
      <template v-for="g in groups" :key="g.kind">
        <p class="dl-sec">{{ g.kind.toUpperCase() }} <span class="dl-hint">{{ KIND_WORDS[g.kind] }}</span></p>
        <ul class="dl-list">
          <li v-for="it in g.items" :key="it.id" class="dl-item lb__item" :style="{ '--acc': accentOf(it.from) }">
            <button type="button" class="lb__play" :class="{ on: aud.current.value === it.id }" :aria-label="`Hear ${it.name}`" @click="hear(it)">{{ aud.current.value === it.id ? '■' : '▶' }}</button>
            <span class="dl-item__main">
              <span class="dl-item__name">{{ it.name }}</span>
              <span class="dl-item__sub">{{ INTENSITY_NAMES[it.level] }} · {{ label(it.kit ?? it.voice ?? '') }}{{ it.bar ? '' : ' · GROWN OVER YOUR CHORDS' }}</span>
            </span>
            <button type="button" class="px-btn px-btn--dim" @click="insert(it)">INSERT</button>
          </li>
        </ul>
      </template>
      <p v-if="!groups.length" class="dl-hint">NOTHING OF THIS KIND THERE.</p>
    </template>

    <template #actions>
      <button type="button" class="px-btn px-btn--dim" @click="close">DONE</button>
    </template>
  </DialogFrame>
</template>

<script setup lang="ts">
/**
 * LIBRARY: the radio's patterns (patternLibrary over the channels) by kind,
 * and the member's snippets. ▶ plays an item once on its own (useAudition);
 * INSERT adds it as a new track (a groove repeated over the loop; bass, arp,
 * lead and pad grown over the piece's chords with growLayer(..., { from })),
 * or fills the selected bars of the selected tracks of the same sort
 * (drum bars into kit tracks, notes into voice tracks). One undo step each.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { INTENSITY_NAMES } from '~/radio/engine/catalog.ts'
import { patternLibrary } from '~/radio/engine/piece/library.ts'
import type { LibraryItem } from '~/radio/engine/piece/library.ts'
import { growLayer } from '~/radio/engine/piece/grow.ts'
import type { Level, Track } from '~/radio/engine/piece/types.ts'
import * as E from '~/utils/edits.ts'
import type { AnySnippet } from '~/composables/useSnippets'
import DialogFrame from '~/components/dialogs/DialogFrame.vue'

const emit = defineEmits<{ close: [] }>()
const jam = useJam()
const aud = useAudition()
const snippets = useSnippets()

type Kind = LibraryItem['kind']
const KINDS: Kind[] = ['drums', 'perc', 'bass', 'arp', 'lead', 'pad']
const KIND_TABS = ['all', ...KINDS, 'yours'] as const
const KIND_WORDS: Record<Kind, string> = {
  drums: 'GROOVES AND FILLS', perc: 'SHAKERS, CONGAS, RIMS', bass: 'GROWN', arp: 'GROWN', lead: 'GROWN', pad: 'GROWN',
}

const kind = ref<(typeof KIND_TABS)[number]>('all')
const place = ref('')
const sel = computed(() => jam.selection.value)
const target = ref<'new' | 'sel'>(jam.selection.value ? 'sel' : 'new')
const sure = ref('')

const items = computed(() => patternLibrary(jam.landscapes.value))
const groups = computed(() => KINDS
  .filter(k => kind.value === 'all' || kind.value === k)
  .map(k => ({ kind: k, items: items.value.filter(it => it.kind === k && (!place.value || it.from === place.value)) }))
  .filter(g => g.items.length))
const allSnippets = computed(() => [...snippets.local.value, ...snippets.remote.value]
  .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))))

const selText = computed(() => {
  const s = sel.value
  if (!s) return ''
  const names = s.trackIds.map(id => jam.trackById(id)?.name ?? id).join(', ')
  return `BARS ${s.from + 1}-${s.to + 1} OF ${names}`.toUpperCase()
})

function label(id: string): string { return id.replace('.', ' ').toUpperCase() }
function accentOf(id: string): string { return jam.lookup(id)?.accent ?? '#2ff3ff' }
const loopN = () => E.loopBars(jam.piece.value)
const enterFor = (level: Level): Level => Math.min(level, jam.piece.value.intensity) as Level

// ---- growing (bass / arp / lead / pad), cached per item and harmony ----------------------------

const grown = new Map<string, Track>()
function grownTrack(it: LibraryItem, fresh = false): Track | null {
  const p = jam.piece.value
  const k = `${it.id}|${p.tonic}|${p.mode}|${p.bpm}|${p.chordBars ?? 2}|${p.chords.join('/')}`
  if (!fresh && grown.has(k)) return grown.get(k)!
  try {
    const level = Math.max(it.level, p.intensity) as Level
    const t = growLayer(p, it.kind, level, { lookup: jam.lookup, from: it.from, enter: enterFor(it.level), seed: fresh ? Math.floor(Math.random() * 1e9) : undefined })
    const out = { ...t, name: it.name.slice(0, 40) }
    grown.set(k, out)
    return out
  } catch (err) {
    console.error('jam: growLayer failed', err)
    jam.say('GROWING FAILED', 'warn')
    return null
  }
}

// ---- hearing -------------------------------------------------------------------------------

function hear(it: LibraryItem): void {
  if (aud.current.value === it.id) { aud.stop(); return }
  if (it.bar && it.kit) {
    aud.play(it.id, { layer: it.kind === 'perc' ? 'perc' : 'drums', kit: it.kit }, [it.bar, it.bar])
    return
  }
  const t = grownTrack(it)
  if (!t) return
  // The bars where the part plays, from the start of the loop: two of them.
  aud.play(it.id, { layer: t.layer, voice: t.voice, kit: t.kit }, t.bars.slice(0, 2))
}

function hearSnippet(s: AnySnippet): void {
  const key = `s:${s.id}`
  if (aud.current.value === key) { aud.stop(); return }
  const t = s.track
  aud.play(key, { layer: t.layer ?? (t.kit ? 'drums' : 'pad'), voice: t.voice, kit: t.kit, gain: t.gain }, t.bars.slice(0, 4))
}

// ---- inserting -----------------------------------------------------------------------------

/** Fill the selected bars of the selected tracks of the right sort with `barAt(loopBar)`; one undo step. */
function fillSelection(kit: boolean, barAt: (b: number, from: number) => string): boolean {
  const s = sel.value
  if (!s) return false
  const ids = s.trackIds.filter(id => !!jam.trackById(id)?.kit === kit)
  if (!ids.length) {
    jam.say(kit ? 'NO DRUM TRACK IS SELECTED' : 'NO NOTE TRACK IS SELECTED', 'warn')
    return false
  }
  jam.transact('library', (d) => {
    for (const id of ids) {
      const t = d.tracks.find(x => x.id === id)
      if (!t) continue
      for (let b = s.from; b <= s.to; b++) t.bars[b] = barAt(b, s.from)
    }
  })
  jam.say(`FILLED ${s.to - s.from + 1} BAR${s.to === s.from ? '' : 'S'}`)
  return true
}

function addGrown(t: Track): void {
  const { piece: next, ids } = E.addTracks(jam.piece.value, [t])
  if (!ids.length) { jam.say('24 TRACKS IS THE MOST', 'warn'); return }
  jam.commit(next, 'library')
  jam.say(`ADDED ${t.name.toUpperCase()}`)
}

function insert(it: LibraryItem): void {
  aud.stop()
  if (it.bar && it.kit) {
    const bar = it.bar
    if (target.value === 'sel') { fillSelection(true, () => bar); return }
    const id = jam.addTrack({
      name: it.name.slice(0, 40), instrument: 'drums', kit: it.kit, layer: it.kind === 'perc' ? 'perc' : 'drums',
      source: 'library', enter: enterFor(it.level), bars: Array.from({ length: loopN() }, () => bar),
    })
    if (id) jam.say(`ADDED ${it.name.toUpperCase()}`)
    return
  }
  const t = grownTrack(it, target.value === 'new')
  if (!t) return
  if (target.value === 'sel') { fillSelection(false, b => t.bars[b] ?? ''); return }
  addGrown(t)
}

function insertSnippet(s: AnySnippet): void {
  aud.stop()
  const src = s.track
  const bars = src.bars.length ? src.bars : ['']
  const kit = !!src.kit
  if (target.value === 'sel') { fillSelection(kit, (b, from) => bars[(b - from) % bars.length]!); return }
  const id = jam.addTrack({
    name: s.name.slice(0, 40),
    instrument: src.instrument ?? (kit ? 'drums' : undefined),
    layer: src.layer,
    ...(kit ? { kit: src.kit } : { voice: src.voice }),
    gain: src.gain,
    source: 'library',
    enter: 0,
    bars: Array.from({ length: loopN() }, (_, i) => bars[i % bars.length]!),
  })
  if (id) jam.say(`ADDED ${s.name.toUpperCase()}`)
}

async function removeSnippet(s: AnySnippet): Promise<void> {
  if (sure.value !== String(s.id)) { sure.value = String(s.id); return }
  sure.value = ''
  if (!(await snippets.remove(s))) jam.say('COULD NOT DELETE IT', 'warn')
}

function close(): void {
  aud.stop()
  emit('close')
}

onMounted(() => { void snippets.refresh() })
onBeforeUnmount(() => aud.stop())
</script>

<style scoped>
.lb__bar { display: grid; gap: 8px; padding-bottom: 6px; }
.lb__kinds .dl-chip { flex: 1 0 auto; }
.lb__yours { --px-edge: var(--pink); }
.lb__yours:not(.on) { color: var(--pink); }
.lb__place { flex: 1 1 180px; }
.lb__target { flex: 0 0 auto; }
.lb__item { box-shadow: inset 4px 0 0 0 var(--acc); padding-left: 4px; }
.lb__play {
  flex: none;
  width: var(--hit);
  height: var(--hit);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--acc);
  cursor: pointer;
}
.lb__play:hover, .lb__play:focus-visible, .lb__play.on { outline: none; color: var(--bg); background: var(--acc); }
</style>
