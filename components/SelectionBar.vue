<template>
  <div class="sb px-box" role="toolbar" aria-label="Selected bars">
    <span class="sb__what">{{ what }}</span>
    <button type="button" class="px-btn px-btn--dim" title="COPY [CTRL+C]" @click="doCopy">COPY</button>
    <button type="button" class="px-btn px-btn--dim" :disabled="!clipboard" title="PASTE AT THE SELECTION [CTRL+V]" @click="jam.paste()">PASTE</button>
    <button type="button" class="px-btn px-btn--dim" title="EMPTY THESE BARS [DELETE]" @click="jam.clearBars()">CLEAR</button>
    <button type="button" class="px-btn px-btn--dim" :disabled="piece.phrases >= 4" :title="`COPY PHRASE ${phrase + 1} AFTER ITSELF`" @click="jam.dupPhrase(phrase)">DUP PHRASE</button>
    <button type="button" class="px-btn" title="KEEP THESE BARS AS A SNIPPET" @click="dialogs.open('snippet', { selection: sel })">SNIPPET</button>
    <button type="button" class="px-btn px-btn--pink" :disabled="sel.trackIds.length !== 1" title="EDIT THIS TRACK STEP BY STEP" @click="dialogs.open('step', { trackId: sel.trackIds[0], bar: sel.from })">EDIT</button>
    <button type="button" class="sb__x" title="LET GO [ESC]" aria-label="Clear the selection" @click="jam.setSelection(null)">×</button>
  </div>
</template>

<script setup lang="ts">
/**
 * What to do with the selected bars. SNIPPET and EDIT open the 'snippet'
 * and 'step' dialogs with { selection } and { trackId, bar }.
 */
import { computed } from 'vue'

const jam = useJam()
const { piece, clipboard } = jam
const dialogs = useDialogs()

const sel = computed(() => jam.selection.value!)
const phrase = computed(() => Math.floor(sel.value.from / 8))
const what = computed(() => {
  const bars = sel.value.to - sel.value.from + 1
  const tracks = sel.value.trackIds.length
  return `${bars} BAR${bars === 1 ? '' : 'S'} × ${tracks}`
})

function doCopy(): void {
  if (jam.copy()) jam.say('COPIED')
}
</script>

<style scoped>
.sb {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--bg);
  overflow-x: auto;
  scrollbar-width: none;
}
.sb::-webkit-scrollbar { display: none; }
.sb > * { flex: none; }
.sb__what { color: var(--cyan); padding: 0 4px; white-space: nowrap; text-shadow: 2px 2px 0 var(--bg); }
.sb__x {
  width: var(--hit);
  height: var(--hit);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--subtle);
  cursor: pointer;
}
.sb__x:hover { color: var(--ink); }
</style>
