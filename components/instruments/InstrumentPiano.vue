<template>
  <div class="inst">
    <InstrumentHeader instrument="piano">
      <div class="oct" role="group" aria-label="Octave">
        <button type="button" class="px-btn px-btn--dim oct__b" title="OCTAVE DOWN [Z]" aria-label="Octave down" :disabled="octave <= MIN_OCT" @click="shift(-1)">◀</button>
        <span class="oct__v">C{{ octave }}</span>
        <button type="button" class="px-btn px-btn--dim oct__b" title="OCTAVE UP [X]" aria-label="Octave up" :disabled="octave >= MAX_OCT" @click="shift(1)">▶</button>
      </div>
    </InstrumentHeader>
    <div
      ref="surface"
      class="inst-surface pn"
      role="group"
      aria-label="Piano keys"
      @pointerdown="p.down"
      @pointermove="p.move"
      @pointerup="p.up"
      @pointercancel="p.up"
      @lostpointercapture="p.up"
      @contextmenu.prevent
    >
      <div
        v-for="k in keys.whites"
        :key="k.midi"
        class="pn__w"
        :class="{ scale: s.scaleSet.value.has(k.midi % 12), chord: s.chordSet.value.has(k.midi % 12), down: isDown(k.midi) }"
        :style="{ left: `${k.left}%`, width: `${k.width}%` }"
      >
        <span v-if="s.labels.value && k.code" class="inst-key pn__code">{{ k.code }}</span>
        <span class="pn__mark" />
        <span v-if="k.midi % 12 === 0" class="pn__c">C{{ Math.floor(k.midi / 12) - 1 }}</span>
      </div>
      <div
        v-for="k in keys.blacks"
        :key="k.midi"
        class="pn__b"
        :class="{ scale: s.scaleSet.value.has(k.midi % 12), chord: s.chordSet.value.has(k.midi % 12), down: isDown(k.midi) }"
        :style="{ left: `${k.left}%`, width: `${k.width}%` }"
      >
        <span v-if="s.labels.value && k.code" class="inst-key pn__code">{{ k.code }}</span>
        <span class="pn__mark" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * PIANO: 8 to 15 white keys (as many as fit at 56 px or more, so a phone
 * gets about an octave, an iPad or desktop two), from the C of the chosen
 * octave. Every finger is its own note; sliding along the keys plays each
 * key it reaches. Velocity from where on the key you press (the front edge
 * is loudest). Scale tones carry a small mark, the sounding chord's tones
 * are lit cyan, keys held down pink.
 * Keys: A W S E D F T G Y H U J K O L P ; ' play C to F from the lowest C
 * shown (Shift: accent), Z / X move an octave.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { LiveNote } from '~/radio/engine/types.ts'
import { OCTAVE_DOWN, OCTAVE_UP, PIANO_CODES, keyLabel, pianoOffset } from '~/utils/keymaps.ts'
import { load, save } from '~/composables/storage'

const MIN_OCT = 1
const MAX_OCT = 6
const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11]
const BLACK_AFTER = new Set([0, 2, 5, 7, 9])
const BLACK_H = 0.6
const BLACK_W = 0.62

const rec = useRecorder()
const s = useSounding()
const keysApi = useKeys()
const surface = ref<HTMLElement | null>(null)
const { w } = useSize(surface)

const octave = ref(Math.max(MIN_OCT, Math.min(MAX_OCT, Number(load<number>('jam.piano.octave', 3)) || 3)))
const base = computed(() => (octave.value + 1) * 12)
const whiteCount = computed(() => Math.max(8, Math.min(15, Math.floor((w.value || 400) / 56))))

interface Key { midi: number; left: number; width: number; code: string }
const keys = computed(() => {
  const n = whiteCount.value
  const ww = 100 / n
  const whites: Key[] = []
  const blacks: Key[] = []
  const codeOf = (midi: number) => {
    const off = midi - base.value
    return s.labels.value && off >= 0 && off < PIANO_CODES.length ? keyLabel(PIANO_CODES[off]!) : ''
  }
  for (let i = 0; i < n; i++) {
    const midi = base.value + Math.floor(i / 7) * 12 + WHITE_PCS[i % 7]!
    whites.push({ midi, left: i * ww, width: ww, code: codeOf(midi) })
    if (i < n - 1 && BLACK_AFTER.has(midi % 12)) blacks.push({ midi: midi + 1, left: (i + 1) * ww - (ww * BLACK_W) / 2, width: ww * BLACK_W, code: codeOf(midi + 1) })
  }
  return { whites, blacks }
})

/** The key under a point of the surface, and a velocity from how far down the key it is. */
function keyAt(x: number, y: number, rect: DOMRect): { midi: number; vel: number } | null {
  const n = whiteCount.value
  const ww = rect.width / n
  const fy = Math.max(0, Math.min(1, y / rect.height))
  if (fy < BLACK_H) {
    const b = Math.round(x / ww)
    if (b > 0 && b < n && Math.abs(x - b * ww) < (ww * BLACK_W) / 2) {
      const left = keys.value.whites[b - 1]!
      if (BLACK_AFTER.has(left.midi % 12)) return { midi: left.midi + 1, vel: 0.3 + 0.7 * (fy / BLACK_H) }
    }
  }
  const i = Math.max(0, Math.min(n - 1, Math.floor(x / ww)))
  return { midi: keys.value.whites[i]!.midi, vel: 0.3 + 0.7 * fy }
}

// ---- held notes: fingers and computer keys ----------------------------------------------------

const held = reactive(new Map<number, number>())
function isDown(midi: number): boolean { return (held.get(midi) ?? 0) > 0 }

interface Held { midi: number; note: LiveNote }
function start(midi: number, vel: number): Held {
  held.set(midi, (held.get(midi) ?? 0) + 1)
  return { midi, note: rec.play('piano', { midi }, vel) }
}
function end(h: Held): void {
  h.note.release()
  const c = (held.get(h.midi) ?? 1) - 1
  if (c > 0) held.set(h.midi, c)
  else held.delete(h.midi)
}

const p = usePointers<Held>({
  start(e, r) {
    const k = keyAt(e.clientX - r.left, e.clientY - r.top, r)
    return k ? start(k.midi, k.vel) : null
  },
  move(e, r, h) {
    const k = keyAt(e.clientX - r.left, e.clientY - r.top, r)
    if (!k || k.midi === h.midi) return
    const n = start(k.midi, k.vel)
    end(h)
    return n
  },
  end,
})

const byCode = new Map<string, Held>()
function shift(d: number): void {
  octave.value = Math.max(MIN_OCT, Math.min(MAX_OCT, octave.value + d))
  save('jam.piano.octave', octave.value)
}

function keyDown(e: KeyboardEvent): boolean {
  if (e.code === OCTAVE_DOWN || e.code === OCTAVE_UP) {
    if (!e.repeat) shift(e.code === OCTAVE_UP ? 1 : -1)
    return true
  }
  const off = pianoOffset(e.code)
  if (off === null) return false
  if (e.repeat || byCode.has(e.code)) return true
  byCode.set(e.code, start(base.value + off, e.shiftKey ? 1 : 0.78))
  return true
}
function keyUp(e: KeyboardEvent): void {
  const h = byCode.get(e.code)
  if (!h) return
  byCode.delete(e.code)
  end(h)
}
function releaseAll(): void {
  p.endAll()
  for (const h of byCode.values()) end(h)
  byCode.clear()
}

let off = () => {}
onMounted(() => { off = keysApi.register({ id: 'piano', down: keyDown, up: keyUp, blur: releaseAll }) })
onBeforeUnmount(() => { off(); releaseAll() })
</script>

<style scoped>
.oct { display: inline-flex; align-items: center; gap: 6px; }
.oct__b { width: var(--hit); padding: 0; }
.oct__v { min-width: 28px; text-align: center; color: var(--muted); }

.pn { background: var(--bg); container-type: size; }
.pn__w, .pn__b {
  position: absolute;
  top: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  padding-bottom: 8px;
  pointer-events: none;
}
.pn__w {
  bottom: 0;
  background: #d9cfee;
  box-shadow: inset -2px 0 0 0 #8f80b3, inset 0 -6px 0 0 #b4a6d6;
}
.pn__b {
  height: 60%;
  z-index: 2;
  background: #20163a;
  box-shadow: inset 2px 0 0 0 #3a2d5e, inset -2px 0 0 0 #0b0616, inset 0 -6px 0 0 #3a2d5e;
}
.pn__w.chord { background: #c3eef7; box-shadow: inset -2px 0 0 0 #8f80b3, inset 0 -6px 0 0 var(--cyan); }
.pn__b.chord { background: #1a5d70; box-shadow: inset 2px 0 0 0 var(--cyan), inset -2px 0 0 0 #0b0616, inset 0 -6px 0 0 var(--cyan); }
.pn__w.down, .pn__w.down.chord { background: var(--pink); box-shadow: inset -2px 0 0 0 #8f80b3, inset 0 -2px 0 0 #b3006a; }
.pn__b.down, .pn__b.down.chord { background: var(--pink); box-shadow: inset 0 -2px 0 0 #b3006a; }

/* A scale tone: a small square near the front of the key. */
.pn__mark { width: 6px; height: 6px; background: transparent; }
.pn__w.scale .pn__mark { background: #8f80b3; }
.pn__b.scale .pn__mark { background: #6a5a96; }
.pn__w.chord .pn__mark { background: #0b6f80; }
.pn__b.chord .pn__mark { background: var(--cyan); }
.down .pn__mark { background: var(--bg) !important; }

.pn__c { color: #6a5a96; font-size: 16px; line-height: 16px; }
.pn__w.down .pn__c { color: var(--bg); }
.pn__code { position: absolute; top: 6px; }
.pn__w .pn__code { top: calc(60% + 6px); color: #6a5a96; text-shadow: none; }
.pn__w.down .pn__code, .pn__b.down .pn__code { color: var(--bg); }

/* Short keys (a phone on its side): the key names give way to the computer keys. */
@container (max-height: 120px) {
  .pn__c { display: none; }
  .pn__w, .pn__b { padding-bottom: 4px; }
  .pn__w .pn__code { top: auto; bottom: 12px; }
}
</style>
