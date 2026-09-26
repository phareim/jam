<template>
  <DialogFrame title="◈ MAKE A RADIO CHANNEL" tone="gold" :width="580" @close="emit('close')">
    <p v-if="!allowed" class="dl-p"><a class="dl-link" :href="loginUrl()">SIGN IN</a> TO TURN THE PIECE INTO A RADIO CHANNEL.</p>

    <template v-else-if="made">
      <p class="cd__name" :style="{ color: made.landscape.accent || 'var(--gold)' }">{{ made.landscape.name }}</p>
      <p v-if="made.landscape.blurb" class="dl-p">{{ made.landscape.blurb }}</p>
      <p class="dl-hint">{{ made.painting ? 'A PAINTER IS PAINTING ITS PLACE NOW. UNTIL IT IS DONE THE CHANNEL SHOWS A PLACE IT BORROWS.' : `IT SHOWS THE ${String(made.landscape.scene ?? 'nightdrive').toUpperCase()} PLACE FOR NOW.` }}</p>
      <p class="dl-hint cd__id">CHANNEL {{ made.landscape.id }}</p>
    </template>

    <template v-else-if="pending">
      <OpusWait :job="pending" what="OPUS IS MAKING THE CHANNEL..." />
    </template>

    <template v-else>
      <p class="dl-p">OPUS TURNS THE PIECE INTO A CHANNEL THAT PLAYS FOR HOURS, KEEPING YOUR CHORDS, GROOVES AND LINES. THEN A PAINTER PAINTS ITS PLACE.</p>
      <p v-if="piece.channel" class="dl-hint cd__was">THIS PIECE ALREADY MADE CHANNEL {{ piece.channel }}. MAKING IT AGAIN ADDS ANOTHER.</p>
      <p class="dl-sec">BRIEF</p>
      <p v-if="brief" class="cd__brief">{{ brief }}</p>
      <p v-else class="dl-hint">NO BRIEF YET. IT WORKS WITHOUT ONE, BUT A TALK IN <button type="button" class="cd__feel" @click="dialogs.open('feel')">FEEL</button> GIVES THE CHANNEL ITS PLACE AND NAME.</p>
      <p v-if="failed" class="dl-err">IT DID NOT WORK: {{ failed.toUpperCase() }}</p>
    </template>

    <template #actions>
      <template v-if="made">
        <button type="button" class="px-btn px-btn--dim" @click="done">CLOSE</button>
        <a class="px-btn px-btn--gold cd__listen" href="https://radio.phareim.no/" target="_blank" rel="noopener">LISTEN ON RADIO ▶</a>
      </template>
      <button v-else-if="pending || !allowed" type="button" class="px-btn px-btn--dim" @click="emit('close')">{{ pending ? 'KEEP PLAYING' : 'CLOSE' }}</button>
      <template v-else>
        <button v-if="brief" type="button" class="px-btn px-btn--dim" @click="dialogs.open('feel')">FEEL</button>
        <button type="button" class="px-btn px-btn--dim" @click="emit('close')">CANCEL</button>
        <button type="button" class="px-btn px-btn--gold" :disabled="busy || !piece.tracks.length" :title="piece.tracks.length ? '' : 'THE PIECE HAS NO TRACKS YET'" @click="make">MAKE IT</button>
      </template>
    </template>
  </DialogFrame>
</template>

<script setup lang="ts">
/**
 * CHANNEL: the piece becomes a radio channel. The jam-channel job (useJobs)
 * has Opus distil the piece into a landscape; radio-api stores it as the
 * member's composed channel and starts the painter. When it lands the
 * piece's `channel` is set; this shows the channel's name and blurb, how the
 * painting goes, and a link to the radio.
 */
import { computed, ref } from 'vue'
import type { ChannelResult, JamJob } from '~/composables/useJobs'
import DialogFrame from '~/components/dialogs/DialogFrame.vue'
import OpusWait from '~/components/dialogs/OpusWait.vue'

const emit = defineEmits<{ close: [] }>()
const jam = useJam()
const { piece } = jam
const jobs = useJobs()
const dialogs = useDialogs()
const { allowed, loginUrl } = useAuth()

const busy = ref(false)
const brief = computed(() => piece.value.feel?.brief?.trim() ?? '')
const last = computed(() => jobs.latest('jam-channel', piece.value.id))
const pending = computed<JamJob | null>(() => (last.value && (last.value.status === 'queued' || last.value.status === 'running') ? last.value : null))
const failed = computed(() => (last.value?.status === 'error' ? last.value.error ?? 'failed' : ''))
const made = computed(() => (last.value?.status === 'done' ? (last.value.result as ChannelResult) : null))

async function make(): Promise<void> {
  if (busy.value) return
  busy.value = true
  if (last.value?.status === 'error') jobs.forget(last.value.id)
  try {
    await jobs.start('jam-channel', { piece: piece.value })
  } catch (err) {
    jam.say(`OPUS: ${(err as Error).message}`.toUpperCase().slice(0, 60), 'warn')
  } finally {
    busy.value = false
  }
}

/** Seen: forget the finished job so the next open starts fresh. */
function done(): void {
  if (last.value && last.value.status === 'done') jobs.forget(last.value.id)
  emit('close')
}
</script>

<style scoped>
.cd__name { margin: 0 0 8px; font-size: 32px; line-height: 36px; text-shadow: 4px 4px 0 var(--bg); overflow-wrap: anywhere; }
.cd__id { margin-top: 8px; }
.cd__was { margin-bottom: 4px; }
.cd__brief { margin: 0; padding: 8px 10px; background: var(--bg-2); color: var(--ink); text-transform: none; }
.cd__feel { padding: 0; border: 0; background: transparent; color: var(--gold); box-shadow: 0 2px 0 0 currentColor; cursor: pointer; }
.cd__listen { display: inline-flex; align-items: center; text-decoration: none; }
</style>
