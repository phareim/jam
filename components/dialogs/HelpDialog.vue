<template>
  <DialogFrame title="HELP" :width="620" @close="emit('close')">
    <p class="hd__lead">A LOOP OF ONE TO FOUR PHRASES OF EIGHT BARS. PLAY IN, WRITE, GROW WITH THE RADIO'S COMPOSER, OR ASK OPUS.</p>
    <dl class="hd__keys">
      <template v-for="k in KEYS" :key="k[0]">
        <dt>{{ k[0] }}</dt>
        <dd>{{ k[1] }}</dd>
      </template>
    </dl>
    <dl class="hd__keys">
      <template v-for="k in INSTRUMENT_KEYS" :key="k[0]">
        <dt>{{ k[0] }}</dt>
        <dd>{{ k[1] }}</dd>
      </template>
    </dl>
    <p class="hd__lead">IN THE GRID: TAP A BAR NUMBER TO PLAY FROM THERE. DRAG OVER BARS TO SELECT THEM (ON A TOUCH SCREEN: TAP A BAR, OR PRESS AND HOLD, THEN DRAG). A TRACK PLAYS FROM ITS LADDER STEP UP; ABOVE THE INTENSITY IT IS DIMMED AND SILENT.</p>
    <template #actions>
      <button type="button" class="px-btn" @click="emit('close')">OK</button>
    </template>
  </DialogFrame>
</template>

<script setup lang="ts">
/** The keys and a few words on the grid. The example of the dialog convention (see useDialogs). */
import DialogFrame from '~/components/dialogs/DialogFrame.vue'

const emit = defineEmits<{ close: [] }>()

const KEYS: Array<[string, string]> = [
  ['SPACE', 'PLAY / STOP'],
  ['ENTER', 'RECORD'],
  ['[  ]', 'INTENSITY DOWN / UP'],
  ['TAB', 'NEXT INSTRUMENT (SHIFT: BACK)'],
  ['CTRL Z', 'UNDO (SHIFT: REDO)'],
  ['CTRL C  V', 'COPY / PASTE THE SELECTED BARS'],
  ['DELETE', 'EMPTY THE SELECTED BARS'],
  ['ESC', 'LET GO OF THE SELECTION'],
  ['?', 'THIS HELP'],
]

/** The active instrument's keys (the physical positions of a US layout; other layouts follow position). */
const INSTRUMENT_KEYS: Array<[string, string]> = [
  ['PIANO', 'A W S E D F T G Y H U J K O L P ; \' PLAY C TO F · Z X OCTAVE · SHIFT ACCENTS'],
  ['GUITAR', '1–7 PICK A CHORD · J STRUM DOWN · K STRUM UP'],
  ['BASS', 'THE PIANO KEYS, AN OCTAVE LOWER'],
  ['DRUMS', 'Q W E R / A S D F / Z X C V, THE PADS AS LAID OUT'],
  ['TOUCH', 'A S D F G H J K L PLAY SCALE STEPS 1–9'],
]
</script>

<style scoped>
.hd__lead { margin: 0 0 12px; color: var(--muted); }
.hd__keys { display: grid; grid-template-columns: max-content 1fr; gap: 6px 20px; margin: 0 0 14px; }
.hd__keys dt { color: var(--cyan); }
.hd__keys dd { margin: 0; color: var(--ink); }
</style>
