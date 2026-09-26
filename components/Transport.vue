<template>
  <div class="tp" :class="{ 'tp--more': more }">
    <PxPop class="i-menu" title="NEW, PIECES, LIBRARY, OPUS, FEEL, CHANNEL, HELP" tone="dim" :width="220">
      <template #button><span class="tp__logo">JAM</span><span class="tp__caret">▼</span></template>
      <template #default="{ close }">
        <div class="menu">
          <button v-for="m in MENU" :key="m.name" type="button" class="menu__item" :class="`menu__item--${m.tone}`" @click="close(); dialogs.open(m.name)">
            {{ m.label }}<span v-if="m.key" class="menu__key">{{ m.key }}</span>
          </button>
          <a v-if="!allowed" class="menu__item menu__item--dim" :href="loginUrl()">SIGN IN</a>
        </div>
      </template>
    </PxPop>
    <input
      class="px-field i-name"
      :value="piece.name"
      maxlength="60"
      aria-label="Piece name"
      spellcheck="false"
      @input="setName(($event.target as HTMLInputElement).value)"
      @keydown.enter="($event.target as HTMLInputElement).blur()"
    >
    <span class="i-kept" :class="{ pending: localPending }" :title="localPending ? 'SAVING IN THIS BROWSER' : 'SAVED IN THIS BROWSER'">{{ localPending ? '...' : 'KEPT' }}</span>
    <button
      v-if="allowed"
      type="button"
      class="px-btn i-save"
      :class="{ 'px-btn--dim': !remoteDirty && saveState.remote === 'saved', 'px-blink': saveState.remote === 'saving' }"
      :disabled="saveState.remote === 'saving'"
      :title="saveState.remote === 'error' ? `SAVE FAILED: ${saveState.error}` : 'SAVE TO YOUR PIECES'"
      @click="saveRemote()"
    >{{ saveLabel }}</button>
    <span class="i-fill" />
    <button type="button" class="px-btn px-btn--dim i-undo" :disabled="!canUndo" title="UNDO [CTRL+Z]" aria-label="Undo" @click="doUndo">UNDO</button>
    <button type="button" class="px-btn px-btn--dim i-redo" :disabled="!canRedo" title="REDO [CTRL+SHIFT+Z]" aria-label="Redo" @click="doRedo">REDO</button>
    <span class="br br1" />

    <button
      type="button"
      class="px-btn px-btn--pink i-play"
      :class="{ on: playing }"
      :title="playing ? 'STOP [SPACE]' : 'PLAY [SPACE]'"
      :aria-label="playing ? 'Stop' : 'Play'"
      @click="toggle()"
    >{{ playing ? '■ STOP' : '▶ PLAY' }}</button>
    <button
      type="button"
      class="px-btn px-btn--pink i-rec"
      :class="{ on: recording, 'px-blink': recording && position.count }"
      :aria-pressed="recording"
      title="RECORD INTO THE ARMED TRACK [ENTER]"
      @click="toggleRecord()"
    ><span class="px-dot" /> REC</button>
    <button type="button" class="px-btn px-btn--dim i-click" :class="{ on: click }" :aria-pressed="click" title="METRONOME" @click="setClick(!click)">CLICK</button>
    <button type="button" class="px-btn px-btn--dim i-count" :class="{ on: countIn }" :aria-pressed="countIn" title="A BAR OF CLICKS BEFORE RECORDING" @click="setCountIn(!countIn)">COUNT</button>
    <BpmControl class="i-bpm" />
    <PxSlider
      class="i-swing"
      :model-value="piece.swing"
      label="SWING"
      :max="0.5"
      :step="0.05"
      :segments="10"
      compact
      color="#b9a8d9"
      :format="(v: number) => `${Math.round(v * 200)}%`"
      @update:model-value="setSwing($event)"
    />
    <span class="br br2" />

    <div class="i-phrases" role="radiogroup" aria-label="Phrases in the loop">
      <span class="px-label">PHRASES</span>
      <button
        v-for="n in 4"
        :key="n"
        type="button"
        role="radio"
        class="px-btn px-btn--dim tp__ph"
        :class="{ on: piece.phrases === n }"
        :aria-checked="piece.phrases === n"
        :title="`${n} PHRASE${n === 1 ? '' : 'S'} OF 8 BARS`"
        @click="setPhrases(n)"
      >{{ n }}</button>
    </div>
    <IntensityBar class="i-int" />
    <button type="button" class="px-btn px-btn--gold i-grow" title="GROW THE LAYERS NO TRACK PLAYS YET, WITH THE RADIO'S COMPOSER" @click="grow()">
      <PxGlyph name="grow" /> GROW
    </button>
    <PxSlider class="i-space" :model-value="controls.space" label="SPACE" compact @update:model-value="setSpace($event)" />
    <PxSlider class="i-grit" :model-value="controls.grit" label="GRIT" compact color="#ff8a3d" @update:model-value="setGrit($event)" />
    <button type="button" class="px-btn px-btn--dim i-more" :class="{ on: more }" :aria-expanded="more" title="MORE CONTROLS" @click="more = !more">{{ more ? 'LESS' : 'MORE' }}</button>
  </div>
</template>

<script setup lang="ts">
/**
 * The transport bar: the piece (menu, name, saving, undo), playing (play,
 * record, click, count-in, tempo, swing), the loop length and the mix
 * (intensity, grow, space, grit). One flat list of controls that CSS lays
 * out in two rows on wide screens, three on tablets in portrait, and on
 * phones two rows of essentials with the rest behind MORE.
 */
import { computed, ref } from 'vue'

const jam = useJam()
const {
  piece, playing, recording, click, countIn, controls, position, saveState, remoteDirty, canUndo, canRedo,
  toggle, toggleRecord, setClick, setCountIn, setName, setSwing, setPhrases, setSpace, setGrit, grow, saveRemote,
} = jam
const { allowed, loginUrl } = useAuth()
const dialogs = useDialogs()
const more = ref(false)

const MENU = [
  { name: 'new', label: 'NEW PIECE', tone: 'cyan', key: '' },
  { name: 'pieces', label: 'PIECES', tone: 'cyan', key: '' },
  { name: 'library', label: 'LIBRARY', tone: 'cyan', key: '' },
  { name: 'opus', label: 'ASK OPUS', tone: 'gold', key: '' },
  { name: 'feel', label: 'FEEL', tone: 'gold', key: '' },
  { name: 'channel', label: 'MAKE A CHANNEL', tone: 'gold', key: '' },
  { name: 'help', label: 'HELP', tone: 'dim', key: '?' },
] as const

const localPending = computed(() => saveState.localRev !== saveState.rev)
const saveLabel = computed(() => {
  if (saveState.remote === 'saving') return 'SAVING'
  if (saveState.remote === 'error') return 'SAVE!'
  return remoteDirty.value || saveState.remote !== 'saved' ? 'SAVE' : 'SAVED'
})

function doUndo(): void { const l = jam.undo(); if (l) jam.say(`UNDO ${l.toUpperCase()}`) }
function doRedo(): void { const l = jam.redo(); if (l) jam.say(`REDO ${l.toUpperCase()}`) }
</script>

<style scoped>
.tp {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  padding: calc(8px + var(--safe-t)) calc(16px + var(--safe-r)) 10px calc(16px + var(--safe-l));
  background: var(--bg);
  --pxs-label-w: auto;
}
.tp > * { flex: none; }
.br { flex-basis: 100%; height: 0; }
.i-fill { flex: 1 1 0; }

.tp__logo { color: var(--pink); text-shadow: 2px 2px 0 var(--bg); }
.tp__caret { font-size: 8px; line-height: 8px; }

.i-name { width: 180px; min-width: 0; flex: 0 1 180px; }
.i-kept { color: var(--subtle); }
.i-kept.pending { color: var(--muted); }
.i-save { min-width: 72px; }

.i-play { min-width: 104px; }
.i-play.on, .i-play.on:hover { color: var(--bg); background: var(--pink); box-shadow: 0 -2px 0 0 var(--pink), 0 2px 0 0 var(--pink), -2px 0 0 0 var(--pink), 2px 0 0 0 var(--pink), 0 0 14px color-mix(in srgb, var(--pink) 55%, transparent); }
.i-rec { display: inline-flex; align-items: center; gap: 6px; }

.i-swing { width: 176px; margin-right: 8px; }
.i-phrases { display: flex; align-items: center; gap: 6px; }
.tp__ph { width: var(--hit); padding: 0; }
.i-grow { display: inline-flex; align-items: center; gap: 8px; }
.i-space, .i-grit { width: 176px; }
.i-more { display: none; }

.menu { display: grid; gap: 2px; }
.menu__item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: var(--hit);
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--cyan);
  text-align: left;
  text-decoration: none;
  text-shadow: 2px 2px 0 var(--bg);
  cursor: pointer;
}
.menu__item--gold { color: var(--gold); }
.menu__item--dim { color: var(--muted); }
.menu__item:hover, .menu__item:focus-visible { outline: none; background: var(--bg-3); }
.menu__key { color: var(--subtle); }

/*
 * Order of the controls:
 * wide     JAM NAME KEPT SAVE PLAY REC CLICK COUNT BPM ··· UNDO REDO | SWING PHRASES INTENSITY GROW SPACE GRIT
 * tablet   JAM NAME KEPT SAVE ··· UNDO REDO | PLAY REC CLICK COUNT BPM SWING | PHRASES INTENSITY GROW SPACE GRIT
 * phone    JAM NAME ··· UNDO REDO | PLAY REC INTENSITY MORE | (MORE:) KEPT SAVE CLICK COUNT BPM SWING PHRASES GROW SPACE GRIT
 */
.i-menu { order: 1; } .i-name { order: 2; } .i-kept { order: 3; } .i-save { order: 4; }
.i-play { order: 5; } .i-rec { order: 6; } .i-click { order: 7; } .i-count { order: 8; } .i-bpm { order: 9; }
.i-fill { order: 10; } .i-undo { order: 11; } .i-redo { order: 12; } .br1 { order: 13; }
.i-swing { order: 14; } .i-phrases { order: 15; } .i-int { order: 16; } .i-grow { order: 17; } .i-space { order: 18; } .i-grit { order: 19; }
.br2 { display: none; }

@media (max-width: 1099px) {
  .i-fill { order: 5; } .i-undo { order: 6; } .i-redo { order: 7; } .br1 { order: 8; }
  .i-play { order: 9; } .i-rec { order: 10; } .i-click { order: 11; } .i-count { order: 12; } .i-bpm { order: 13; } .i-swing { order: 14; }
  .br2 { display: block; order: 15; }
  .i-phrases { order: 16; } .i-int { order: 17; } .i-grow { order: 18; } .i-space { order: 19; } .i-grit { order: 20; }
  .i-int :deep(.ib__name) { display: none; }
  .i-space, .i-grit { width: auto; flex: 1 1 130px; max-width: 220px; }
}

@media (max-width: 700px), (max-height: 500px) {
  .tp { padding: calc(6px + var(--safe-t)) calc(12px + var(--safe-r)) 8px calc(12px + var(--safe-l)); gap: 8px; }
  .i-menu { order: 1; } .i-name { order: 2; flex: 1 1 60px; width: auto; }
  .i-fill { order: 3; flex: 0 0 0; } .i-undo { order: 4; } .i-redo { order: 5; } .br1 { order: 6; }
  .i-play { order: 7; flex: 1 1 auto; min-width: 0; } .i-rec { order: 8; } .i-int { order: 9; } .i-more { display: block; order: 10; }
  .br2 { display: block; order: 11; }
  .i-kept { order: 12; } .i-save { order: 13; } .i-click { order: 14; } .i-count { order: 15; } .i-bpm { order: 16; }
  .i-swing { order: 17; } .i-phrases { order: 18; } .i-grow { order: 19; } .i-space { order: 20; } .i-grit { order: 21; }
  .i-int :deep(.ib__name) { display: none; }
  .i-undo, .i-redo { padding: 0 6px; }
  .i-kept, .i-save, .i-click, .i-count, .i-bpm, .i-swing, .i-phrases, .i-grow, .i-space, .i-grit, .br2 { display: none; }
  .tp--more .i-kept, .tp--more .i-save, .tp--more .i-click, .tp--more .i-count, .tp--more .i-grow { display: inline-flex; align-items: center; }
  .tp--more .i-bpm, .tp--more .i-phrases, .tp--more .br2 { display: flex; }
  .tp--more .i-swing, .tp--more .i-space, .tp--more .i-grit { display: grid; flex: 1 1 150px; width: auto; max-width: none; }
}

/* Phones on their side: one row of essentials. */
@media (max-height: 500px) and (min-width: 701px) {
  .i-name { order: 2; flex: 1 1 60px; }
  .i-play { order: 3; flex: none; } .i-rec { order: 4; } .i-int { order: 5; } .i-more { order: 6; }
  .i-fill { order: 7; flex: 1 1 0; } .i-undo { order: 8; } .i-redo { order: 9; }
  .br1 { display: none; }
}
</style>
