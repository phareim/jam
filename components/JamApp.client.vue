<template>
  <div class="app">
    <Transport class="app__transport" />
    <Harmony class="app__harmony" />
    <Arrangement class="app__grid" />
    <InstrumentDock class="app__dock" />
    <DialogHost />
    <p v-if="toast" :key="toast.n" class="app__toast px-box" :class="`app__toast--${toast.tone}`" role="status">{{ toast.text }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * The whole jam page, client-only: transport on top, the harmony strip, the
 * arrangement grid, the instrument dock at the bottom, and the dialogs. It
 * owns the page's keys (useKeys) and signs in.
 */
import { onBeforeUnmount, onMounted } from 'vue'
import { INSTRUMENTS } from '~/composables/useJam'

const jam = useJam()
const { toast } = jam
const keys = useKeys()
const dialogs = useDialogs()
const { fetchSession } = useAuth()

function stepInstrument(d: number): void {
  const i = INSTRUMENTS.indexOf(jam.instrument.value)
  jam.setInstrument(INSTRUMENTS[(i + d + INSTRUMENTS.length) % INSTRUMENTS.length]!)
}

/** The transport keys; the instruments get what these leave (see useKeys). */
function globalKey(e: KeyboardEvent): boolean {
  const mod = e.metaKey || e.ctrlKey
  const k = e.key
  if (mod && !e.altKey) {
    const l = k.toLowerCase()
    if (l === 'z') {
      const label = e.shiftKey ? jam.redo() : jam.undo()
      if (label) jam.say(`${e.shiftKey ? 'REDO' : 'UNDO'} ${label.toUpperCase()}`)
      return true
    }
    if (l === 'y') { const label = jam.redo(); if (label) jam.say(`REDO ${label.toUpperCase()}`); return true }
    if (l === 'c' && jam.selection.value) { if (jam.copy()) jam.say('COPIED'); return true }
    if (l === 'v' && jam.selection.value && jam.clipboard.value) { jam.paste(); return true }
    return false
  }
  if (e.altKey) return false
  if (k === ' ' || e.code === 'Space') { if (!e.repeat) jam.toggle(); return true }
  if (k === 'Enter') { if (!e.repeat) jam.toggleRecord(); return true }
  if (k === '[') { jam.setIntensity(jam.piece.value.intensity - 1); return true }
  if (k === ']') { jam.setIntensity(jam.piece.value.intensity + 1); return true }
  if (k === 'Tab') { stepInstrument(e.shiftKey ? -1 : 1); return true }
  if ((k === 'Delete' || k === 'Backspace') && jam.selection.value) { jam.clearBars(); return true }
  if (k === '?') { dialogs.open('help'); return true }
  if (k === 'Escape') {
    if (jam.selection.value) { jam.setSelection(null); return true }
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    return false
  }
  return false
}

let detach: () => void = () => {}

onMounted(() => {
  if (import.meta.dev) (window as unknown as Record<string, unknown>).__jam = jam
  keys.setGlobal({ id: 'transport', down: globalKey })
  detach = keys.install()
  void fetchSession().then((ok) => { if (ok) void jam.refreshLandscapes() })
})

onBeforeUnmount(() => {
  keys.setGlobal(null)
  detach()
})
</script>

<style scoped>
.app {
  position: relative;
  height: var(--app-height);
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  grid-template-areas: "transport" "harmony" "grid" "dock";
  overflow: hidden;
  background: var(--bg);
  text-transform: uppercase;
  --dock-h: clamp(200px, 32vh, 320px);
}

.app__transport { grid-area: transport; }
.app__harmony { grid-area: harmony; }
.app__grid { grid-area: grid; min-height: 0; }
.app__dock { grid-area: dock; }

.app__toast {
  --px-edge: var(--cyan);
  position: absolute;
  z-index: 70;
  left: 50%;
  top: 30%;
  transform: translate(-50%, -50%);
  margin: 0;
  padding: 10px 16px;
  max-width: calc(100% - 32px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: var(--bg);
  color: var(--cyan);
  text-shadow: 2px 2px 0 var(--bg);
  pointer-events: none;
  animation: toast-in 0.12s steps(2);
}
.app__toast--warn { --px-edge: var(--pink); color: var(--pink); }
.app__toast--gold { --px-edge: var(--gold); color: var(--gold); }
@keyframes toast-in { from { opacity: 0; } }

/* Phones and short windows: a smaller dock. */
@media (max-height: 700px) {
  .app { --dock-h: clamp(170px, 34vh, 240px); }
}
@media (orientation: landscape) and (max-height: 500px) {
  /* A phone on its side is for playing: the instrument gets over half the screen. */
  .app { --dock-h: 56vh; }
  .app__harmony { display: none; }
}
</style>
