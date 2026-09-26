<template>
  <DialogFrame title="◈ ADD A TRACK WITH OPUS" tone="gold" :width="620" @close="close">
    <p v-if="!allowed" class="dl-p"><a class="dl-link" :href="loginUrl()">SIGN IN</a> TO ASK OPUS FOR A TRACK.</p>

    <template v-else>
      <!-- Opus's tracks, waiting for KEEP or DROP -->
      <template v-if="proposal">
        <p v-if="proposal.job.pieceId !== piece.id" class="dl-hint">WRITTEN FOR {{ proposal.job.pieceName.toUpperCase() }}.</p>
        <p v-if="proposal.result.note" class="od__note">{{ proposal.result.note }}</p>
        <p class="od__asked">“{{ proposal.job.request }}”</p>
        <ul class="dl-list">
          <li v-for="(t, i) in proposal.result.tracks" :key="`${proposal.job.id}-${i}`" class="dl-item od__track">
            <span class="dl-item__main">
              <span class="dl-item__name">{{ t.name }}</span>
              <span class="dl-item__sub">{{ t.layer.toUpperCase() }} · {{ label(t.kit ?? t.voice ?? '') }} · {{ filled(t) }}/{{ t.bars.length }} BARS</span>
            </span>
            <div class="od__btns">
              <button type="button" class="px-btn px-btn--dim dl-chip" :class="{ on: isHearing(i, false) }" :aria-pressed="isHearing(i, false)" title="HEAR IT IN THE MIX" @click="hear(i, false)">HEAR</button>
              <button type="button" class="px-btn px-btn--dim dl-chip" :class="{ on: isHearing(i, true) }" :aria-pressed="isHearing(i, true)" title="HEAR IT ALONE" @click="hear(i, true)">SOLO</button>
              <button type="button" class="px-btn px-btn--gold dl-chip" @click="keep([i])">KEEP</button>
              <button type="button" class="px-btn px-btn--dim dl-chip" title="DROP IT" @click="drop([i])">DROP</button>
            </div>
          </li>
        </ul>
      </template>

      <template v-else-if="pending">
        <OpusWait :job="pending" what="OPUS IS WRITING..." />
        <p class="od__asked">“{{ pending.request }}”</p>
      </template>

      <template v-else>
        <p class="dl-p">SAY WHAT YOU WANT TO HEAR. OPUS WRITES IT AS A TRACK OVER YOUR CHORDS; YOU HEAR IT FIRST AND KEEP IT OR NOT.</p>
        <textarea
          ref="field"
          v-model="request"
          class="dl-text"
          rows="3"
          maxlength="2000"
          placeholder="a walking bass that stays low..."
          aria-label="What you want"
          @keydown.enter.exact.prevent="ask"
          @keydown.esc.prevent="close"
        />
        <div class="dl-row od__opts">
          <span class="px-label">LAYER</span>
          <select v-model="layer" class="px-field" aria-label="Layer">
            <option value="">ANY</option>
            <option v-for="l in LAYERS" :key="l" :value="l">{{ l.toUpperCase() }}</option>
          </select>
          <template v-if="piece.phrases > 1">
            <span class="px-label od__ph">PHRASES</span>
            <button
              v-for="p in piece.phrases"
              :key="p"
              type="button"
              class="px-btn px-btn--dim dl-chip"
              :class="{ on: phrases.includes(p - 1) }"
              :aria-pressed="phrases.includes(p - 1)"
              @click="togglePhrase(p - 1)"
            >P{{ p }}</button>
          </template>
        </div>
        <p v-if="failed" class="dl-err">OPUS COULD NOT: {{ failed.toUpperCase() }}</p>
      </template>
    </template>

    <template #actions>
      <template v-if="proposal">
        <button type="button" class="px-btn px-btn--dim" @click="drop(allIdx)">DROP ALL</button>
        <button type="button" class="px-btn px-btn--gold" @click="keep(allIdx)">KEEP ALL</button>
      </template>
      <button v-else-if="pending || !allowed" type="button" class="px-btn px-btn--dim" @click="close">{{ pending ? 'KEEP PLAYING' : 'CLOSE' }}</button>
      <template v-else>
        <button type="button" class="px-btn px-btn--dim" @click="close">CANCEL</button>
        <button type="button" class="px-btn px-btn--gold" :disabled="!request.trim() || asking || !phrases.length" @click="ask">{{ asking ? 'ASKING' : 'ASK' }}</button>
      </template>
    </template>
  </DialogFrame>
</template>

<script setup lang="ts">
/**
 * ASK OPUS: what you want, optionally a layer and which phrases; the
 * jam-track job runs on radio-api (useJobs keeps it when this closes; a
 * toast says when it lands). The tracks come back as a proposal: HEAR plays
 * one with the loop, SOLO alone (useJam().setPreview, nothing is added),
 * KEEP adds it (one undo step), DROP forgets it. Opus's note says what it did.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Layer } from '~/radio/engine/types.ts'
import type { Track } from '~/radio/engine/piece/types.ts'
import * as E from '~/utils/edits.ts'
import type { JamJob, TrackResult } from '~/composables/useJobs'
import DialogFrame from '~/components/dialogs/DialogFrame.vue'
import OpusWait from '~/components/dialogs/OpusWait.vue'

const emit = defineEmits<{ close: [] }>()
const jam = useJam()
const { piece } = jam
const jobs = useJobs()
const { allowed, loginUrl } = useAuth()

const LAYERS: Layer[] = ['bass', 'drums', 'perc', 'pad', 'arp', 'lead', 'counter', 'bells', 'drone']

const request = ref('')
const layer = ref<Layer | ''>('')
const phrases = ref<number[]>(Array.from({ length: piece.value.phrases }, (_, i) => i))
const asking = ref(false)
const field = ref<HTMLTextAreaElement | null>(null)

const last = computed(() => jobs.latest('jam-track'))
const pending = computed<JamJob | null>(() => (last.value && (last.value.status === 'queued' || last.value.status === 'running') ? last.value : null))
const failed = computed(() => (last.value?.status === 'error' ? last.value.error ?? 'failed' : ''))
const proposal = computed(() => {
  const j = jobs.jobs.value.find(x => x.kind === 'jam-track' && x.status === 'done' && (x.result as TrackResult | undefined)?.tracks?.length)
  return j ? { job: j, result: j.result as TrackResult } : null
})
const allIdx = computed(() => proposal.value?.result.tracks.map((_, i) => i) ?? [])

function label(id: string): string { return id.replace('.', ' ').toUpperCase() }
function filled(t: Track): number { return t.bars.filter(b => b.trim()).length }

function togglePhrase(p: number): void {
  phrases.value = phrases.value.includes(p) ? phrases.value.filter(x => x !== p) : [...phrases.value, p].sort((a, b) => a - b)
}

async function ask(): Promise<void> {
  const text = request.value.trim()
  if (!text || asking.value || !phrases.value.length) return
  asking.value = true
  // A finished error is replaced by the new job.
  if (last.value?.status === 'error') jobs.forget(last.value.id)
  try {
    const all = phrases.value.length === piece.value.phrases
    await jobs.start('jam-track', {
      piece: piece.value,
      request: text,
      ...(layer.value ? { layer: layer.value } : {}),
      ...(all ? {} : { phrases: phrases.value }),
    })
    request.value = ''
  } catch (err) {
    jam.say(`OPUS: ${(err as Error).message}`.toUpperCase().slice(0, 60), 'warn')
  } finally {
    asking.value = false
  }
}

// ---- hearing a proposal --------------------------------------------------------------------

const hearing = ref<{ index: number; solo: boolean } | null>(null)
let startedPlaying = false

function isHearing(i: number, solo: boolean): boolean {
  return hearing.value?.index === i && hearing.value.solo === solo
}

function hear(i: number, solo: boolean): void {
  const t = proposal.value?.result.tracks[i]
  if (!t || isHearing(i, solo)) { stopHearing(); return }
  hearing.value = { index: i, solo }
  jam.setPreview([t], solo)
  if (!jam.playing.value) {
    startedPlaying = true
    void jam.play()
  }
}

function stopHearing(): void {
  hearing.value = null
  jam.setPreview(null)
  if (startedPlaying && jam.playing.value) jam.stop()
  startedPlaying = false
}

function keep(indices: number[]): void {
  const p = proposal.value
  if (!p) return
  stopHearing()
  const tracks = indices.map(i => p.result.tracks[i]).filter((t): t is Track => !!t).map(t => ({ ...t, source: 'opus' as const }))
  const { piece: next, ids } = E.addTracks(jam.piece.value, tracks)
  if (!ids.length) { jam.say('24 TRACKS IS THE MOST', 'warn'); return }
  jam.commit(next, 'opus track')
  jobs.take(p.job.id, indices)
  jam.say(`KEPT ${ids.length} TRACK${ids.length === 1 ? '' : 'S'}`, 'gold')
}

function drop(indices: number[]): void {
  const p = proposal.value
  if (!p) return
  stopHearing()
  jobs.take(p.job.id, indices)
}

function close(): void {
  stopHearing()
  emit('close')
}

onMounted(() => { void nextTick(() => field.value?.focus()) })
onBeforeUnmount(() => { if (hearing.value) stopHearing() })
</script>

<style scoped>
.od__note { margin: 0 0 8px; color: var(--gold); white-space: pre-line; }
.od__asked { margin: 8px 0 10px; color: var(--subtle); overflow-wrap: anywhere; }
.od__opts { margin-top: 12px; }
.od__ph { margin-left: 8px; }
.od__track { flex-wrap: wrap; box-shadow: inset 4px 0 0 0 var(--gold); padding-top: 6px; padding-bottom: 6px; }
.od__track .dl-item__main { flex: 1 1 240px; }
.od__btns { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
</style>
