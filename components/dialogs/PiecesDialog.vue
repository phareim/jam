<template>
  <DialogFrame title="PIECES" tone="pink" :width="600" @close="emit('close')">
    <template v-if="allowed">
      <p class="dl-sec">SAVED <span class="dl-hint">ON ALL YOUR DEVICES</span></p>
      <p v-if="remote.state === 'loading'" class="dl-hint">LOADING...</p>
      <p v-else-if="remote.state === 'error'" class="dl-err">COULD NOT LOAD THE SAVED PIECES. {{ remote.error }}</p>
      <p v-else-if="!remote.list.length" class="dl-hint">NONE YET. SAVE IN THE TOP BAR KEEPS THE PIECE HERE.</p>
      <ul v-else class="dl-list">
        <li v-for="p in remote.list" :key="p.id" class="dl-item" :class="{ 'pd--open': p.id === piece.id }">
          <span class="dl-item__main">
            <span class="dl-item__name">{{ p.name }}</span>
            <span class="dl-item__sub">{{ when(p.updatedAt) }}<template v-if="p.channel"> · <span class="pd__ch">CHANNEL {{ p.channel }}</span></template><template v-if="p.id === piece.id"> · OPEN</template></span>
          </span>
          <button type="button" class="px-btn px-btn--dim" :disabled="busy" @click="openRemote(p.id)">OPEN</button>
          <button type="button" class="dl-x" :class="{ sure: sure === `r:${p.id}` }" :title="`DELETE ${p.name.toUpperCase()}`" @click="delRemote(p.id)">{{ sure === `r:${p.id}` ? 'SURE? ×' : '×' }}</button>
        </li>
      </ul>
    </template>
    <p v-else class="dl-p"><a class="dl-link" :href="loginUrl()">SIGN IN</a> TO SAVE PIECES ON EVERY DEVICE.</p>

    <p class="dl-sec">IN THIS BROWSER</p>
    <p v-if="!local.length" class="dl-hint">NOTHING YET.</p>
    <ul v-else class="dl-list">
      <li v-for="p in local" :key="p.id" class="dl-item" :class="{ 'pd--open': p.id === piece.id }">
        <span class="dl-item__main">
          <span class="dl-item__name">{{ p.name }}</span>
          <span class="dl-item__sub">{{ when(p.updatedAt) }}<template v-if="p.channel"> · <span class="pd__ch">CHANNEL {{ p.channel }}</span></template><template v-if="p.id === piece.id"> · OPEN</template></span>
        </span>
        <button type="button" class="px-btn px-btn--dim" :disabled="p.id === piece.id" @click="openLocal(p.id)">OPEN</button>
        <button type="button" class="dl-x" :class="{ sure: sure === `l:${p.id}` }" :disabled="p.id === piece.id" :title="`FORGET ${p.name.toUpperCase()} IN THIS BROWSER`" @click="delLocal(p.id)">{{ sure === `l:${p.id}` ? 'SURE? ×' : '×' }}</button>
      </li>
    </ul>
    <p v-if="error" class="dl-err">{{ error }}</p>

    <template #actions>
      <button type="button" class="px-btn px-btn--dim" @click="emit('close')">DONE</button>
    </template>
  </DialogFrame>
</template>

<script setup lang="ts">
/**
 * PIECES: the member's saved pieces on radio-api (signed in) and the
 * pieces kept in this browser (the autosave list), newest first, each with
 * the radio channel made from it. Open replaces the piece (one undo step;
 * the old one stays in the local list). Delete asks once more.
 */
import { onMounted, reactive, ref } from 'vue'
import type { PieceSummary } from '~/composables/useJamApi'
import type { Piece } from '~/radio/engine/piece/types.ts'
import { load } from '~/composables/storage'
import DialogFrame from '~/components/dialogs/DialogFrame.vue'

const emit = defineEmits<{ close: [] }>()
const jam = useJam()
const { piece } = jam
const api = useJamApi()
const { allowed, loginUrl } = useAuth()

interface LocalRow { id: string; name: string; updatedAt: number; channel?: string }
const remote = reactive({ state: 'idle' as 'idle' | 'loading' | 'ok' | 'error', list: [] as PieceSummary[], error: '' })
const local = ref<LocalRow[]>([])
const sure = ref('')
const busy = ref(false)
const error = ref('')

function readLocal(): void {
  // The autosave list keeps whole pieces; the channel id is read from them.
  const all = load<Record<string, { piece?: Piece }>>('jam.pieces', {})
  local.value = jam.localPieces().map(p => ({ ...p, channel: all[p.id]?.piece?.channel }))
}

async function readRemote(): Promise<void> {
  if (!allowed.value) return
  remote.state = 'loading'
  try {
    const r = await api.listPieces()
    remote.list = [...r.pieces].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    remote.state = 'ok'
  } catch (err) {
    remote.state = 'error'
    remote.error = String((err as { statusMessage?: string }).statusMessage ?? '').toUpperCase()
  }
}

function when(t: string | number): string {
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return ''
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (days < 1 && d.getDate() === new Date().getDate()) return `TODAY ${hm}`
  if (days < 2) return `YESTERDAY ${hm}`
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: days > 300 ? 'numeric' : undefined }).toUpperCase()
}

async function openRemote(id: string): Promise<void> {
  error.value = ''
  busy.value = true
  try {
    const r = await api.getPiece(id)
    jam.saveLocal()
    const errs = jam.loadPiece(r.piece, 'open')
    if (errs) { error.value = `IT DID NOT LOAD: ${errs.slice(0, 2).join(' · ')}`.toUpperCase(); return }
    jam.markRemoteSaved(r.updatedAt)
    jam.say(`OPENED ${r.piece.name.toUpperCase()}`)
    emit('close')
  } catch {
    error.value = 'COULD NOT OPEN IT'
  } finally {
    busy.value = false
  }
}

async function delRemote(id: string): Promise<void> {
  if (sure.value !== `r:${id}`) { sure.value = `r:${id}`; return }
  sure.value = ''
  try {
    await api.deletePiece(id)
    remote.list = remote.list.filter(p => p.id !== id)
  } catch {
    error.value = 'COULD NOT DELETE IT'
  }
}

function openLocal(id: string): void {
  error.value = ''
  jam.saveLocal()
  const errs = jam.openLocal(id)
  if (errs) { error.value = `IT DID NOT LOAD: ${errs.slice(0, 2).join(' · ')}`.toUpperCase(); return }
  jam.say(`OPENED ${jam.piece.value.name.toUpperCase()}`)
  emit('close')
}

function delLocal(id: string): void {
  if (sure.value !== `l:${id}`) { sure.value = `l:${id}`; return }
  sure.value = ''
  jam.deleteLocal(id)
  readLocal()
}

onMounted(() => {
  jam.saveLocal()
  readLocal()
  void readRemote()
})
</script>

<style scoped>
.pd--open { box-shadow: inset 4px 0 0 0 var(--pink); }
.pd__ch { color: var(--gold); }
</style>
