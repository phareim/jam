<template>
  <div class="inst">
    <InstrumentHeader instrument="drums" />
    <div
      class="inst-surface dr"
      role="group"
      aria-label="Drum pads"
      @pointerdown="p.down"
      @pointerup="p.up"
      @pointercancel="p.up"
      @lostpointercapture="p.up"
      @contextmenu.prevent
    >
      <div
        v-for="(pad, i) in DRUM_PADS"
        :key="pad.hit"
        class="dr__pad"
        :class="[`dr__pad--${group(pad.hit)}`, { hit: flash[i]! > 0 }]"
        :style="{ '--n': flash[i] }"
      >
        <span class="dr__name">{{ pad.name }}</span>
        <span v-if="labels" class="inst-key dr__key">{{ keyLabel(pad.code) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * DRUMS: twelve pads in three rows of four, laid out like the keys that
 * play them (Q W E R: TOM M, TOM H, CRASH, RISE; A S D F: OPEN, RIDE, PERC,
 * TOM L; Z X C V: KICK, SNARE, CLAP, HAT). The kit is the armed drum
 * track's, or the one the header picks for a new track. Velocity from
 * where you hit: the middle of a pad is loudest. RISE lasts as long as it
 * is held (when recorded).
 */
import { onBeforeUnmount, onMounted, reactive } from 'vue'
import type { DrumHit, LiveNote } from '~/radio/engine/types.ts'
import { DRUM_PADS, drumPadFor, keyLabel } from '~/utils/keymaps.ts'

const rec = useRecorder()
const keysApi = useKeys()
const labels = keysApi.keyboardUsed

/** A counter per pad, bumped on each hit, so the flash restarts. */
const flash = reactive<number[]>(DRUM_PADS.map(() => 0))
const timers: Array<ReturnType<typeof setTimeout> | null> = DRUM_PADS.map(() => null)

function group(h: DrumHit): string {
  if (h === 'k' || h === 's' || h === 'c') return 'core'
  if (h === 'h' || h === 'o' || h === 'r' || h === 'x') return 'metal'
  if (h === 'z') return 'fx'
  return 'skin'
}

interface Held { note: LiveNote }
function hit(i: number, vel: number): Held {
  const pad = DRUM_PADS[i]!
  const note = rec.play('drums', { hit: pad.hit }, vel)
  flash[i] = (flash[i] ?? 0) + 1
  if (timers[i]) clearTimeout(timers[i]!)
  timers[i] = setTimeout(() => { flash[i] = 0; timers[i] = null }, 140)
  return { note }
}

const p = usePointers<Held>({
  start(e, r) {
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    const col = Math.max(0, Math.min(3, Math.floor((x / r.width) * 4)))
    const row = Math.max(0, Math.min(2, Math.floor((y / r.height) * 3)))
    // Distance from the pad's middle, 0 (middle) .. 1 (corner).
    const cx = ((x / r.width) * 4 - col - 0.5) * 2
    const cy = ((y / r.height) * 3 - row - 0.5) * 2
    const d = Math.min(1, Math.hypot(cx, cy) / Math.SQRT2)
    return hit(row * 4 + col, 1 - 0.6 * d)
  },
  end(h) { h.note.release() },
})

const byCode = new Map<string, Held>()
function keyDown(e: KeyboardEvent): boolean {
  const pad = drumPadFor(e.code)
  if (!pad) return false
  if (e.repeat || byCode.has(e.code)) return true
  byCode.set(e.code, hit(DRUM_PADS.indexOf(pad), e.shiftKey ? 1 : 0.8))
  return true
}
function keyUp(e: KeyboardEvent): void {
  const h = byCode.get(e.code)
  if (!h) return
  byCode.delete(e.code)
  h.note.release()
}
function releaseAll(): void {
  p.endAll()
  for (const h of byCode.values()) h.note.release()
  byCode.clear()
}

let off = () => {}
onMounted(() => { off = keysApi.register({ id: 'drums', down: keyDown, up: keyUp, blur: releaseAll }) })
onBeforeUnmount(() => {
  off()
  releaseAll()
  for (const t of timers) if (t) clearTimeout(t)
})
</script>

<style scoped>
.dr {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
  gap: 6px;
  background: var(--bg-2);
}
.dr__pad {
  --pc: var(--edge-dim);
  position: relative;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 4px;
  min-height: 0;
  background: var(--bg-3);
  color: var(--muted);
  box-shadow: inset 0 0 0 2px var(--pc), inset 0 -6px 0 0 color-mix(in srgb, var(--pc) 45%, transparent);
  pointer-events: none;
}
.dr__pad--core { --pc: #6a5a96; }
.dr__pad--metal { --pc: #1a7f8c; }
.dr__pad--skin { --pc: #7a4a8a; }
.dr__pad--fx { --pc: #8c7a1a; }
.dr__pad.hit { background: var(--pink); color: var(--bg); box-shadow: inset 0 0 0 2px var(--pink), 0 0 14px color-mix(in srgb, var(--pink) 55%, transparent); }
.dr__name { white-space: nowrap; }
.dr__key { position: absolute; top: 6px; left: 8px; }
.dr__pad.hit .dr__key { color: var(--bg); text-shadow: none; }
</style>
