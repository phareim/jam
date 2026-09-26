<template>
  <span class="pop">
    <button
      ref="btn"
      type="button"
      class="px-btn pop__btn"
      :class="[toneClass, { on: open && tone !== 'dim' }]"
      :aria-expanded="open"
      aria-haspopup="true"
      :title="title"
      @click="toggle"
    ><slot name="button">{{ label }}</slot></button>
    <Teleport to="body">
      <div v-if="open" ref="panel" class="pop__panel px-box" :class="panelClass" :style="style" role="menu" @keydown.esc.stop.prevent="close">
        <slot :close="close" />
      </div>
    </Teleport>
  </span>
</template>

<script setup lang="ts">
/**
 * A pixel button that opens a panel under it (a menu, a key picker). The
 * panel lives on <body>, stays inside the window (above the button when
 * there is no room below), and closes on a tap outside, Escape, or the
 * `close` its slot receives.
 */
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'

const props = withDefaults(defineProps<{
  label?: string
  title?: string
  tone?: 'cyan' | 'pink' | 'gold' | 'dim'
  /** Panel width in CSS px (default: its content). */
  width?: number
}>(), { label: '', title: '', tone: 'dim', width: 0 })

const open = ref(false)
const btn = ref<HTMLElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const pos = ref({ left: 0, top: 0, maxH: 400 })

const toneClass = computed(() => (props.tone === 'dim' ? 'px-btn--dim' : props.tone === 'cyan' ? '' : `px-btn--${props.tone}`))
const panelClass = computed(() => (props.tone === 'gold' ? 'px-box--gold' : props.tone === 'pink' ? 'px-box--pink' : ''))
const style = computed(() => ({
  left: `${pos.value.left}px`,
  top: `${pos.value.top}px`,
  maxHeight: `${pos.value.maxH}px`,
  width: props.width ? `${props.width}px` : undefined,
}))

function place(): void {
  const b = btn.value?.getBoundingClientRect()
  const p = panel.value
  if (!b || !p) return
  const vw = window.innerWidth
  const vh = window.innerHeight
  const pw = p.offsetWidth
  const below = vh - b.bottom - 16
  const above = b.top - 16
  const ph = p.scrollHeight
  const up = ph > below && above > below
  const maxH = Math.max(120, (up ? above : below) - 8)
  pos.value = {
    left: Math.max(8, Math.min(b.left, vw - pw - 8)),
    top: up ? Math.max(8, b.top - 8 - Math.min(ph, maxH)) : b.bottom + 8,
    maxH,
  }
}

function onOutside(e: PointerEvent): void {
  const t = e.target as Node
  if (panel.value?.contains(t) || btn.value?.contains(t)) return
  close()
}

function close(): void {
  if (!open.value) return
  open.value = false
  document.removeEventListener('pointerdown', onOutside, true)
  window.removeEventListener('resize', close)
}

function toggle(): void {
  if (open.value) { close(); return }
  open.value = true
  pos.value = { left: -9999, top: 0, maxH: 400 }
  void nextTick(() => {
    place()
    ;(panel.value?.querySelector('button, [tabindex]') as HTMLElement | null)?.focus({ preventScroll: true })
  })
  document.addEventListener('pointerdown', onOutside, true)
  window.addEventListener('resize', close)
}

onBeforeUnmount(close)
defineExpose({ close })
</script>

<style scoped>
.pop { position: relative; display: inline-flex; }
.pop__btn { display: inline-flex; align-items: center; gap: 8px; }
.pop__panel {
  position: fixed;
  z-index: 60;
  min-width: 160px;
  padding: 8px;
  overflow-y: auto;
  background: var(--bg);
  font-family: var(--font-pixel);
  font-size: 16px;
  line-height: 20px;
  text-transform: uppercase;
  color: var(--ink);
  overscroll-behavior: contain;
}
</style>
