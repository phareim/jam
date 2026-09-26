<template>
  <DialogFrame title="◈ FEEL" tone="gold" :width="620" @close="close">
    <p v-if="!allowed" class="dl-p"><a class="dl-link" :href="loginUrl()">SIGN IN</a> TO TALK WITH OPUS ABOUT THE PIECE.</p>

    <template v-else>
      <p v-if="!messages.length && !pending" class="dl-p">WHAT DOES THE PIECE FEEL LIKE? A PLACE, A TIME OF DAY, THE WEATHER, WHO IS THERE. OPUS LISTENS AND ASKS; THE BRIEF IT WRITES BECOMES THE CHANNEL'S NAME AND PAINTED PLACE.</p>

      <div v-if="messages.length || pending" ref="log" class="fd__log" aria-live="polite">
        <p v-for="(m, i) in messages" :key="i" class="fd__msg" :class="`fd__msg--${m.role}`">
          <span class="fd__who">{{ m.role === 'opus' ? 'OPUS' : 'YOU' }}</span>{{ m.text }}
        </p>
        <p v-if="pending?.request" class="fd__msg fd__msg--petter fd__msg--wait"><span class="fd__who">YOU</span>{{ pending.request }}</p>
        <OpusWait v-if="pending" :job="pending" what="OPUS IS LISTENING..." hint="UNDER A MINUTE, MOSTLY" />
      </div>

      <template v-if="!pending">
        <div v-if="messages.length" class="fd__say">
          <textarea
            ref="field"
            v-model="line"
            class="dl-text fd__field"
            rows="2"
            maxlength="4000"
            placeholder="say what you hear..."
            aria-label="Your answer"
            @keydown.enter.exact.prevent="send"
            @keydown.esc.prevent="close"
          />
        </div>
        <p v-if="failed" class="dl-err">OPUS COULD NOT ANSWER: {{ failed.toUpperCase() }}</p>
      </template>

      <label class="dl-sec" for="fd-brief">BRIEF <span class="dl-hint">FOR THE PAINTER</span></label>
      <textarea
        id="fd-brief"
        v-model="brief"
        class="dl-text fd__brief"
        rows="3"
        maxlength="1200"
        placeholder="opus writes it as you talk; you can change it."
        @blur="saveBrief"
        @keydown.esc.prevent="close"
      />
    </template>

    <template #actions>
      <button type="button" class="px-btn px-btn--dim" @click="close">{{ pending ? 'KEEP PLAYING' : 'DONE' }}</button>
      <template v-if="allowed && !pending">
        <button v-if="!messages.length" type="button" class="px-btn px-btn--gold" :disabled="busy" @click="send">START</button>
        <button v-else type="button" class="px-btn px-btn--pink" :disabled="!line.trim() || busy" @click="send">SEND</button>
      </template>
    </template>
  </DialogFrame>
</template>

<script setup lang="ts">
/**
 * FEEL: a conversation with Opus about what the piece feels like, kept in
 * the piece (feel.messages) with the brief it ends in. START lets Opus open;
 * SEND sends your line. The jam-feel job runs in useJobs, so the reply lands
 * in the piece even when this is closed: your line and Opus's reply are one
 * undo step, and the brief is replaced by Opus's new one. The brief can be
 * edited by hand (one undo step when you leave the field).
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { JamJob } from '~/composables/useJobs'
import DialogFrame from '~/components/dialogs/DialogFrame.vue'
import OpusWait from '~/components/dialogs/OpusWait.vue'

const emit = defineEmits<{ close: [] }>()
const jam = useJam()
const { piece } = jam
const jobs = useJobs()
const { allowed, loginUrl } = useAuth()

const MAX_SENT = 60

const messages = computed(() => piece.value.feel?.messages ?? [])
const last = computed(() => jobs.latest('jam-feel', piece.value.id))
const pending = computed<JamJob | null>(() => (last.value && (last.value.status === 'queued' || last.value.status === 'running') ? last.value : null))
const failed = computed(() => (last.value?.status === 'error' ? last.value.error ?? 'failed' : ''))

const line = ref('')
const brief = ref(piece.value.feel?.brief ?? '')
const busy = ref(false)
const log = ref<HTMLElement | null>(null)
const field = ref<HTMLTextAreaElement | null>(null)

// Opus's new brief replaces the field (unless you are writing in it).
watch(() => piece.value.feel?.brief, (b) => {
  if (document.activeElement?.id !== 'fd-brief') brief.value = b ?? ''
})
watch(() => messages.value.length + (pending.value ? 1 : 0), () => { void nextTick(scrollDown) })

function scrollDown(): void {
  const el = log.value
  if (el) el.scrollTop = el.scrollHeight
}

function saveBrief(): void {
  const b = brief.value.trim()
  if (b === (piece.value.feel?.brief ?? '')) return
  jam.transact('brief', (d) => { d.feel = { messages: d.feel?.messages ?? [], brief: b } })
}

async function send(): Promise<void> {
  const text = line.value.trim()
  if (busy.value || (messages.value.length && !text)) return
  saveBrief()
  busy.value = true
  if (last.value?.status === 'error') jobs.forget(last.value.id)
  const msgs = [...messages.value]
  if (text) msgs.push({ role: 'petter', text })
  try {
    await jobs.start('jam-feel', { piece: piece.value, messages: msgs.slice(-MAX_SENT), line: text })
    line.value = ''
  } catch (err) {
    jam.say(`OPUS: ${(err as Error).message}`.toUpperCase().slice(0, 60), 'warn')
  } finally {
    busy.value = false
  }
}

function close(): void {
  saveBrief()
  emit('close')
}

onMounted(() => {
  scrollDown()
  void nextTick(() => field.value?.focus())
})
</script>

<style scoped>
.fd__log {
  display: grid;
  gap: 10px;
  max-height: min(46vh, 360px);
  overflow-y: auto;
  overscroll-behavior: contain;
  margin-bottom: 10px;
  padding: 8px 10px;
  background: var(--bg-2);
}
.fd__msg { margin: 0; text-transform: none; overflow-wrap: anywhere; user-select: text; -webkit-user-select: text; }
.fd__who { display: block; margin-bottom: 2px; text-transform: uppercase; }
.fd__msg--opus { color: var(--ink); }
.fd__msg--opus .fd__who { color: var(--gold); }
.fd__msg--petter { justify-self: end; max-width: 88%; color: var(--ink); text-align: right; }
.fd__msg--petter .fd__who { color: var(--pink); }
.fd__msg--wait { opacity: 0.6; }
.fd__say { margin-bottom: 4px; }
.fd__field { --dl-focus: var(--pink); }
.fd__brief { text-transform: none; }
</style>
