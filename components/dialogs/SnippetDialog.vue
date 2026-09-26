<template>
  <DialogFrame title="SAVE A SNIPPET" tone="pink" :width="520" @close="emit('close')">
    <p v-if="!rows.length" class="dl-p">NO BARS ARE SELECTED.</p>
    <template v-else>
      <p class="dl-p">{{ what }} GO INTO THE LIBRARY, READY TO DROP INTO ANY PIECE.</p>
      <ul class="dl-list sd__rows">
        <li v-for="r in rows" :key="r.track.id" class="dl-item">
          <span class="dl-item__main">
            <span class="dl-item__name">{{ r.track.name }}</span>
            <span class="dl-item__sub">{{ r.kind.toUpperCase() }} · {{ r.bars.length }} BAR{{ r.bars.length === 1 ? '' : 'S' }}{{ r.empty ? ' · EMPTY' : '' }}</span>
          </span>
        </li>
      </ul>
      <label class="dl-sec" for="sd-name">NAME</label>
      <input
        id="sd-name"
        ref="field"
        v-model="name"
        class="px-field sd__name"
        maxlength="60"
        spellcheck="false"
        placeholder="WHAT TO CALL IT"
        @keydown.enter.prevent="save"
        @keydown.esc.prevent="emit('close')"
      >
      <p v-if="!allowed" class="dl-hint sd__where">SIGNED OUT, IT IS KEPT IN THIS BROWSER. <a class="dl-link" :href="loginUrl()">SIGN IN</a> TO KEEP IT EVERYWHERE.</p>
      <p v-if="error" class="dl-err">{{ error }}</p>
    </template>

    <template #actions>
      <button type="button" class="px-btn px-btn--dim" @click="emit('close')">CANCEL</button>
      <button type="button" class="px-btn px-btn--pink" :disabled="!canSave || busy" @click="save">{{ busy ? 'SAVING' : 'SAVE' }}</button>
    </template>
  </DialogFrame>
</template>

<script setup lang="ts">
/**
 * SNIPPET: keep the selected bars (one snippet per selected track) for the
 * library. Members keep them on radio-api, everyone else in this browser.
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import type { Track } from '~/radio/engine/piece/types.ts'
import type { BarSelection } from '~/utils/edits.ts'
import DialogFrame from '~/components/dialogs/DialogFrame.vue'

const props = defineProps<{ selection?: BarSelection }>()
const emit = defineEmits<{ close: [] }>()
const jam = useJam()
const { allowed, loginUrl } = useAuth()
const snippets = useSnippets()

const MAX_BARS = 32

function kindOf(t: Track): string {
  if (t.kit) return t.layer === 'perc' ? 'perc' : 'drums'
  return t.layer
}

const rows = computed(() => {
  const s = props.selection
  if (!s) return []
  return s.trackIds
    .map(id => jam.trackById(id))
    .filter((t): t is Track => !!t)
    .map((t) => {
      const bars = t.bars.slice(s.from, Math.min(s.to, s.from + MAX_BARS - 1) + 1)
      return { track: t, bars, kind: kindOf(t), empty: bars.every(b => !b.trim()) }
    })
})
const what = computed(() => {
  const n = rows.value[0]?.bars.length ?? 0
  const t = rows.value.length
  return `${n} BAR${n === 1 ? '' : 'S'}${t > 1 ? ` OF ${t} TRACKS (ONE SNIPPET EACH)` : ` OF ${rows.value[0]?.track.name.toUpperCase()}`}`
})
const canSave = computed(() => !!name.value.trim() && rows.value.some(r => !r.empty))

const s0 = props.selection
const name = ref(rows.value.length === 1 && s0 ? `${rows.value[0]!.track.name} ${s0.from + 1}-${s0.to + 1}` : jam.piece.value.name)
const field = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const error = ref('')

async function save(): Promise<void> {
  if (!canSave.value || busy.value) return
  busy.value = true
  error.value = ''
  const base = name.value.trim().slice(0, 60)
  const many = rows.value.filter(r => !r.empty).length > 1
  let local = 0
  try {
    for (const r of rows.value) {
      if (r.empty) continue
      const t = r.track
      const track: Partial<Track> & { bars: string[] } = { name: t.name.slice(0, 40), layer: t.layer, instrument: t.instrument, bars: r.bars }
      if (t.kit) track.kit = t.kit
      else track.voice = t.voice
      const where = await snippets.add({ name: many ? `${base} · ${t.name}`.slice(0, 60) : base, kind: r.kind, track })
      if (where === 'local') local++
    }
    jam.say(local ? 'KEPT IN THIS BROWSER' : 'SAVED TO THE LIBRARY')
    emit('close')
  } catch {
    error.value = 'COULD NOT SAVE IT'
  } finally {
    busy.value = false
  }
}

onMounted(() => { void nextTick(() => { field.value?.focus(); field.value?.select() }) })
</script>

<style scoped>
.sd__rows { margin-bottom: 4px; }
.sd__name { display: block; width: 100%; }
.sd__where { margin-top: 10px; }
</style>
