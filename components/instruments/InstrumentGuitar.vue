<template>
  <div class="inst">
    <InstrumentHeader instrument="guitar">
      <div class="gt__modes" role="radiogroup" aria-label="Guitar mode">
        <button type="button" role="radio" class="px-btn px-btn--dim" :class="{ on: mode === 'notes' }" :aria-checked="mode === 'notes'" title="PLAY FRETS" @click="setMode('notes')">NOTES</button>
        <button type="button" role="radio" class="px-btn px-btn--dim" :class="{ on: mode === 'strum' }" :aria-checked="mode === 'strum'" title="STRUM CHORDS" @click="setMode('strum')">STRUM</button>
      </div>
      <button type="button" class="px-btn px-btn--dim" :class="{ on: muted }" :aria-pressed="muted" title="PALM MUTE (THE GUITAR.MUTE VOICE)" @click="toggleMute">MUTE</button>
      <div v-if="mode === 'notes'" class="pos" role="group" aria-label="Fret position">
        <button type="button" class="px-btn px-btn--dim pos__b" aria-label="Toward the nut" :disabled="first <= 0" @click="first = Math.max(0, first - 1)">◀</button>
        <span class="pos__v">FR {{ first }}</span>
        <button type="button" class="px-btn px-btn--dim pos__b" aria-label="Up the neck" :disabled="first + count > MAX_FRET" @click="first = Math.min(MAX_FRET + 1 - count, first + 1)">▶</button>
      </div>
    </InstrumentHeader>

    <Fretboard v-if="mode === 'notes'" ref="board" instrument="guitar" :tuning="GUITAR_TUNING" :first="first" @count="count = $event" />

    <div v-else class="gt">
      <div class="gt__chips" role="radiogroup" aria-label="Chord" @pointerdown.stop>
        <button type="button" role="radio" class="gt__chip" :class="{ on: chosen === null }" :aria-checked="chosen === null" title="THE CHORD THE LOOP PLAYS NOW" @click="chosen = null">
          <span class="gt__deg">NOW</span><PxText :text="s.chord.value.symbol" />
        </button>
        <button
          v-for="(c, i) in chips"
          :key="c.token"
          type="button"
          role="radio"
          class="gt__chip"
          :class="{ on: chosen === i }"
          :aria-checked="chosen === i"
          :title="`${c.chord.degree} [${i + 1}]`"
          @click="chosen = chosen === i ? null : i"
        ><span v-if="s.labels.value" class="gt__deg">{{ keyLabel(`Digit${i + 1}`) }}</span><PxText :text="c.chord.symbol" /></button>
      </div>
      <div
        class="inst-surface gt__strings"
        role="group"
        :aria-label="`Strum ${chord.symbol}`"
        @pointerdown="p.down"
        @pointermove="p.move"
        @pointerup="p.up"
        @pointercancel="p.up"
        @lostpointercapture="p.up"
        @contextmenu.prevent
      >
        <div v-for="(m, i) in notes" :key="i" class="gt__string" :class="{ muted: m === null, ring: ringing[i] }" :style="{ '--thick': `${i < 2 ? 4 : i < 4 ? 3 : 2}px` }">
          <span class="gt__note"><PxText :text="m === null ? 'X' : name(m)" /></span>
        </div>
        <span class="gt__big"><PxText :text="chord.symbol" /></span>
        <span v-if="s.labels.value" class="inst-key gt__keys">{{ keyLabel(STRUM_DOWN) }} ↓ {{ keyLabel(STRUM_UP) }} ↑</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * GUITAR, two ways:
 *   NOTES  the fretboard (Fretboard.vue): six strings E2 A2 D3 G3 B3 E4.
 *   STRUM  a chord (the one the loop plays now, or chips 1-7: the scale's
 *          chords) in an open-position shape (utils/voicings.ts), and six
 *          strings to swipe across: each string sounds as the finger
 *          crosses it, so the swipe's speed spaces the strings and its
 *          direction strums down or up; a tap plucks one string. Strummed
 *          strings ring until struck again (or 2.5 s).
 * MUTE switches the voice to guitar.mute (and back).
 * Keys: 1-7 pick a chord (again: back to NOW), J strums down, K up.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { LiveNote, VoiceId } from '~/radio/engine/types.ts'
import { diatonicChords } from '~/radio/engine/piece/chords.ts'
import { midiName } from '~/radio/engine/theory.ts'
import { GUITAR_TUNING, MAX_FRET, guitarVoicing, shapeNotes } from '~/utils/voicings.ts'
import { STRUM_DOWN, STRUM_UP, guitarChordKey, keyLabel } from '~/utils/keymaps.ts'
import { load, save } from '~/composables/storage'

const RING_MS = 2500
const STRUM_GAP_MS = 14

const jam = useJam()
const rec = useRecorder()
const s = useSounding()
const keysApi = useKeys()

const mode = ref<'notes' | 'strum'>(load<string>('jam.guitar.mode', 'strum') === 'notes' ? 'notes' : 'strum')
function setMode(m: 'notes' | 'strum'): void { mode.value = m; save('jam.guitar.mode', m) }
const first = ref(0)
const count = ref(7)
const board = ref<{ releaseAll(): void } | null>(null)

// ---- MUTE: the guitar.mute voice ------------------------------------------------------------------

const muted = computed(() => rec.target('guitar').voice === 'guitar.mute')
function toggleMute(): void {
  const now = rec.target('guitar').voice
  if (now === 'guitar.mute') rec.setSound('guitar', load<string>('jam.guitar.open', 'guitar.nylon'))
  else {
    if (now) save('jam.guitar.open', now)
    rec.setSound('guitar', 'guitar.mute' satisfies VoiceId)
  }
}

// ---- the chord and its shape --------------------------------------------------------------------

const chips = computed(() => diatonicChords(jam.piece.value.tonic, jam.piece.value.mode).slice(0, 7))
const chosen = ref<number | null>(null)
const chord = computed(() => (chosen.value === null ? s.chord.value : chips.value[chosen.value]?.chord ?? s.chord.value))
const notes = computed(() => shapeNotes(guitarVoicing(chord.value), GUITAR_TUNING))
function name(m: number): string { return midiName(m, jam.key()) }

// ---- ringing strings ------------------------------------------------------------------------------

const ringing = reactive<boolean[]>([false, false, false, false, false, false])
const rings: Array<{ note: LiveNote; timer: ReturnType<typeof setTimeout> } | null> = [null, null, null, null, null, null]

function damp(i: number): void {
  const r = rings[i]
  if (!r) return
  clearTimeout(r.timer)
  r.note.release()
  rings[i] = null
  ringing[i] = false
}

function pluck(i: number, vel: number): void {
  const m = notes.value[i]
  if (m === null || m === undefined) return
  const note = rec.play('guitar', { midi: m }, vel)
  damp(i)
  rings[i] = { note, timer: setTimeout(() => damp(i), RING_MS) }
  ringing[i] = true
}

/** Strum every string, low to high (down) or high to low (up). */
function strum(down: boolean, vel = 0.8): void {
  const order = down ? [0, 1, 2, 3, 4, 5] : [5, 4, 3, 2, 1, 0]
  order.forEach((i, k) => {
    if (k === 0) pluck(i, vel)
    else setTimeout(() => pluck(i, vel * (down ? 1 : 0.92)), k * STRUM_GAP_MS)
  })
}

// ---- swiping across the strings --------------------------------------------------------------------

interface Swipe { y: number; t: number; last: number }
const p = usePointers<Swipe>({
  start(e, r) {
    const y = e.clientY - r.top
    const i = Math.max(0, Math.min(5, Math.floor(y / (r.height / 6))))
    pluck(i, 0.72)
    return { y, t: e.timeStamp, last: i }
  },
  move(e, r, sw) {
    const y = e.clientY - r.top
    const rowH = r.height / 6
    const dy = y - sw.y
    if (Math.abs(dy) < 1) return
    const speed = Math.abs(dy) / Math.max(1, e.timeStamp - sw.t)
    const vel = Math.max(0.4, Math.min(1, 0.45 + speed * 0.35))
    const crossed: number[] = []
    for (let i = 0; i < 6; i++) {
      const line = (i + 0.5) * rowH
      if ((sw.y < line && line <= y) || (y <= line && line < sw.y)) crossed.push(i)
    }
    if (dy < 0) crossed.reverse()
    let last = sw.last
    for (const i of crossed) {
      if (i === last) continue
      pluck(i, vel)
      last = i
    }
    return { y, t: e.timeStamp, last }
  },
  end() { /* strings ring on */ },
})

// ---- keys ---------------------------------------------------------------------------------------------

function keyDown(e: KeyboardEvent): boolean {
  const c = guitarChordKey(e.code)
  if (c !== null) {
    if (!e.repeat) chosen.value = chosen.value === c ? null : c
    return true
  }
  if (e.code === STRUM_DOWN || e.code === STRUM_UP) {
    if (!e.repeat) strum(e.code === STRUM_DOWN, e.shiftKey ? 1 : 0.8)
    return true
  }
  return false
}

function releaseAll(): void {
  p.endAll()
  board.value?.releaseAll()
  for (let i = 0; i < 6; i++) damp(i)
}

let off = () => {}
onMounted(() => { off = keysApi.register({ id: 'guitar', down: keyDown, blur: releaseAll }) })
onBeforeUnmount(() => { off(); releaseAll() })
</script>

<style scoped>
.gt__modes { display: inline-flex; gap: 6px; }
.gt__modes .px-btn { padding: 0 10px; }
.pos { display: inline-flex; align-items: center; gap: 6px; }
.pos__b { width: var(--hit); padding: 0; }
.pos__v { min-width: 44px; text-align: center; color: var(--muted); }

.gt { display: flex; gap: 8px; flex: 1 1 0; min-height: 0; }
/* The chords: a column of chips beside the strings, two across. */
.gt__chips {
  display: grid;
  grid-template-columns: repeat(2, 84px);
  grid-auto-rows: minmax(0, 1fr);
  gap: 4px;
  flex: none;
}
.gt__chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 0;
  padding: 0 4px;
  border: 0;
  background: var(--bg-3);
  color: var(--muted);
  cursor: pointer;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
  --pxt-shadow: none;
}
.gt__chip.on { background: var(--cyan); color: var(--bg); }
.gt__deg { color: var(--subtle); }
.gt__chip.on .gt__deg { color: #0b6f80; }

.gt__strings {
  flex: 1 1 0;
  display: grid;
  grid-template-rows: repeat(6, minmax(0, 1fr));
  background: #1a1030;
}
.gt__string { position: relative; display: flex; align-items: center; pointer-events: none; }
.gt__string::before {
  content: '';
  position: absolute;
  left: 44px;
  right: 0;
  top: calc(50% - var(--thick) / 2);
  height: var(--thick);
  background: #8f80b3;
}
.gt__string.ring::before { background: var(--pink); box-shadow: 0 0 8px var(--pink); }
.gt__string.muted::before { background: #3a2d5e; }
.gt__note { width: 40px; padding-left: 4px; color: var(--muted); font-size: 16px; line-height: 16px; text-transform: none; }
.gt__string.muted .gt__note { color: var(--subtle); }
.gt__big {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 32px;
  line-height: 32px;
  color: var(--cyan);
  text-shadow: 2px 2px 0 var(--bg);
  text-transform: none;
  pointer-events: none;
  opacity: 0.85;
}
.gt__keys { position: absolute; right: 16px; bottom: 4px; }
</style>
