<template>
  <div class="arr-wrap">
    <div
      ref="scroller"
      class="arr"
      :style="vars"
      @scroll.passive="onScroll"
    >
      <div
        ref="inner"
        class="arr__inner"
        @pointerdown="down"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="cancel"
      >
        <div class="arr__head">
          <div ref="corner" class="arr__corner">
            <span class="px-label">{{ piece.tracks.length }} TRACK{{ piece.tracks.length === 1 ? '' : 'S' }}</span>
            <span class="arr__loop">{{ piece.phrases * 8 }} BARS</span>
          </div>
          <div class="arr__bars">
            <div v-for="p in piece.phrases" :key="p" class="arr__phrase">
              <button
                v-for="i in 8"
                :key="i"
                type="button"
                class="arr__bar"
                :class="{
                  now: position.bar === bar(p, i),
                  cursor: !playing && cursor === bar(p, i),
                  first: i === 1,
                  sel: !!selection && bar(p, i) >= selection.from && bar(p, i) <= selection.to,
                }"
                data-track="*"
                :data-bar="bar(p, i)"
                :title="`BAR ${bar(p, i) + 1}: TAP TO PLAY FROM HERE`"
              >
                <span class="arr__num">{{ i === 1 ? `P${p}` : bar(p, i) + 1 }}</span>
                <span class="arr__chords"><PxText v-for="(s, k) in chordMarks[bar(p, i)]" :key="k" :text="s" /></span>
              </button>
            </div>
          </div>
        </div>

        <TrackRow
          v-for="t in piece.tracks"
          :key="t.id"
          :track="t"
          :phrases="piece.phrases"
          :intensity="piece.intensity"
          :soloing="soloing"
          :sel-from="selFor(t.id) ? selection!.from : null"
          :sel-to="selFor(t.id) ? selection!.to : null"
        />

        <div class="arr__add">
          <div class="arr__addbox">
            <p v-if="!piece.tracks.length" class="arr__hint">NO TRACKS YET. ADD ONE, GROW THE LADDER, OR PICK AN INSTRUMENT BELOW AND PRESS REC.</p>
            <div class="arr__addrow">
              <span class="px-label">ADD</span>
              <button
                v-for="i in INSTRUMENTS"
                :key="i"
                type="button"
                class="px-btn px-btn--dim arr__addbtn"
                :title="`A NEW ${i.toUpperCase()} TRACK`"
                @click="add(i)"
              ><PxGlyph :name="i" /><span class="arr__addname">{{ i.toUpperCase() }}</span></button>
              <button type="button" class="px-btn arr__addbtn" title="PATTERNS FROM THE RADIO AND YOUR SNIPPETS" @click="dialogs.open('library')">LIBRARY</button>
              <button type="button" class="px-btn px-btn--gold arr__addbtn" title="ASK OPUS FOR A TRACK" @click="dialogs.open('opus')">OPUS</button>
            </div>
          </div>
        </div>
        <div class="arr__rest" @pointerdown="jam.setSelection(null)" />

        <Playhead :head-w="headW" :bar-w="barW" :gap="PHRASE_GAP" />
      </div>
    </div>

    <SelectionBar v-if="selection" class="arr__selbar" />
  </div>
</template>

<script setup lang="ts">
/**
 * The arrangement: tracks × bars, bars grouped by phrase, the chords over
 * each bar, the playhead. Tap a bar header to play from there. Select bars
 * by dragging with a mouse, or on touch by tapping a bar (one bar) or
 * pressing on it for a moment and then dragging; starting on a header
 * selects every track. The selection gets its toolbar (SelectionBar).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { phraseSpans } from '~/radio/engine/piece/chords.ts'
import type { Instrument } from '~/radio/engine/piece/types.ts'
import { INSTRUMENTS } from '~/composables/useJam'

const jam = useJam()
const { piece, position, playing, cursor, selection } = jam
const dialogs = useDialogs()

const PHRASE_GAP = 6
const ROW_H = 44

const scroller = ref<HTMLElement | null>(null)
const inner = ref<HTMLElement | null>(null)
const corner = ref<HTMLElement | null>(null)
const headW = ref(300)
const barW = ref(96)

const bar = (p: number, i: number) => (p - 1) * 8 + i - 1
const soloing = computed(() => piece.value.tracks.some(t => t.solo))
const vars = computed(() => ({ '--bar-w': `${barW.value}px`, '--phrase-gap': `${PHRASE_GAP}px`, '--row-h': `${ROW_H}px` }))

function selFor(id: string): boolean {
  return !!selection.value && selection.value.trackIds.includes(id)
}

/** Chord symbols over each bar, printed where the chord changes (and at every phrase start). */
const chordMarks = computed(() => {
  const spans = phraseSpans(piece.value)
  let prev = ''
  return spans.map((bs, b) => {
    const out: string[] = []
    bs.forEach((s) => {
      const sym = s.chord.symbol
      if (sym !== prev || (b % 8 === 0 && s.from === 0)) out.push(sym)
      prev = sym
    })
    return out
  })
})

// ---- sizes: bars share the width, never narrower than a finger -------------------------------

let ro: ResizeObserver | null = null
function measure(): void {
  const el = scroller.value
  if (!el) return
  headW.value = corner.value?.offsetWidth ?? headW.value
  const n = piece.value.phrases * 8
  const avail = el.clientWidth - headW.value - PHRASE_GAP * (piece.value.phrases + 1) - 4
  barW.value = Math.max(44, Math.min(160, Math.floor(avail / n)))
}
watch(() => piece.value.phrases, () => requestAnimationFrame(measure))

// ---- follow the playhead ---------------------------------------------------------------

let userScrollAt = 0
let autoScrolling = false
function onScroll(): void {
  if (autoScrolling) { autoScrolling = false; return }
  userScrollAt = performance.now()
}
watch(() => position.bar, (b) => {
  const el = scroller.value
  if (!el || b < 0 || performance.now() - userScrollAt < 4000) return
  const x = PHRASE_GAP * (Math.floor(b / 8) + 1) + b * barW.value
  const view = el.clientWidth - headW.value
  if (x < el.scrollLeft || x + barW.value > el.scrollLeft + view) {
    autoScrolling = true
    el.scrollLeft = Math.max(0, x - PHRASE_GAP)
  }
})

// ---- adding tracks ------------------------------------------------------------------------

function add(i: Instrument): void {
  const id = jam.addTrack({ instrument: i })
  if (!id) return
  if (!jam.armed.value) jam.arm(id)
  jam.setInstrument(i)
}

// ---- selecting bars ------------------------------------------------------------------------

interface Hit { t: string; b: number }
interface Drag {
  id: number
  touch: boolean
  x: number
  y: number
  anchor: Hit
  last: Hit
  active: boolean
  moved: boolean
  wasOnly: boolean
  timer: ReturnType<typeof setTimeout> | null
}
let drag: Drag | null = null

function hitOf(el: Element | null): Hit | null {
  const c = el?.closest('[data-bar]') as HTMLElement | null
  if (!c || !inner.value?.contains(c)) return null
  return { t: c.dataset.track ?? '*', b: Number(c.dataset.bar) }
}

function select(a: Hit, h: Hit): void {
  const ids = piece.value.tracks.map(t => t.id)
  let trackIds: string[]
  if (a.t === '*' || h.t === '*') trackIds = ids
  else {
    const i = ids.indexOf(a.t)
    const j = ids.indexOf(h.t)
    trackIds = ids.slice(Math.min(i, j), Math.max(i, j) + 1)
  }
  jam.setSelection({ trackIds, from: a.b, to: h.b })
}

function activate(e?: PointerEvent): void {
  if (!drag) return
  drag.active = true
  drag.timer = null
  try { inner.value?.setPointerCapture(drag.id) } catch { /* pointer gone */ }
  if (drag.anchor.t !== '*') select(drag.anchor, drag.anchor)
  if (drag.touch) {
    if (drag.anchor.t === '*') select(drag.anchor, drag.anchor)
    try { navigator.vibrate?.(8) } catch { /* no vibration */ }
  }
  void e
}

function down(e: PointerEvent): void {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const h = hitOf(e.target as Element)
  if (!h) return
  const s = selection.value
  drag = {
    id: e.pointerId,
    touch: e.pointerType !== 'mouse',
    x: e.clientX,
    y: e.clientY,
    anchor: h,
    last: h,
    active: false,
    moved: false,
    wasOnly: !!s && h.t !== '*' && s.from === h.b && s.to === h.b && s.trackIds.length === 1 && s.trackIds[0] === h.t,
    timer: null,
  }
  if (drag.touch) drag.timer = setTimeout(() => activate(), 320)
  else activate(e)
}

function move(e: PointerEvent): void {
  if (!drag || e.pointerId !== drag.id) return
  if (!drag.active) {
    // A touch that moves before the long press is a scroll: let the browser have it.
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) cancel()
    return
  }
  const h = hitOf(document.elementFromPoint(e.clientX, e.clientY))
  if (!h || (h.t === drag.last.t && h.b === drag.last.b)) return
  drag.last = h
  drag.moved = true
  select(drag.anchor, h)
}

function up(e: PointerEvent): void {
  if (!drag || e.pointerId !== drag.id) return
  const d = drag
  if (d.timer) clearTimeout(d.timer)
  drag = null
  if (d.moved) return
  // A tap: a header plays from its bar, a bar selects itself (or lets go when it was the selection).
  if (d.anchor.t === '*') { jam.seek(d.anchor.b); return }
  if (d.wasOnly) jam.setSelection(null)
  else select(d.anchor, d.anchor)
}

function cancel(): void {
  if (drag?.timer) clearTimeout(drag.timer)
  drag = null
}

// While a touch selection is on, the finger drags the selection, not the page.
function onTouchMove(e: TouchEvent): void {
  if (drag?.active && e.cancelable) e.preventDefault()
}

onMounted(() => {
  measure()
  ro = new ResizeObserver(measure)
  if (scroller.value) ro.observe(scroller.value)
  inner.value?.addEventListener('touchmove', onTouchMove, { passive: false })
})
onBeforeUnmount(() => {
  ro?.disconnect()
  inner.value?.removeEventListener('touchmove', onTouchMove)
  cancel()
})
</script>

<style scoped>
.arr-wrap { position: relative; min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr); }
.arr {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  background: var(--bg);
  --head-w: 330px;
}
.arr__inner { position: relative; width: max-content; min-width: 100%; min-height: 100%; display: flex; flex-direction: column; }

.arr__head {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  height: var(--row-h);
  background: var(--bg);
  box-shadow: 0 2px 0 0 var(--edge-dim);
}
.arr__corner {
  position: sticky;
  left: 0;
  z-index: 6;
  flex: none;
  width: var(--head-w);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px 0 calc(10px + var(--safe-l));
  margin-left: calc(-1 * var(--safe-l));
  background: var(--bg);
  box-shadow: 2px 0 0 0 var(--edge-dim);
}
.arr__loop { color: var(--subtle); }

.arr__bars { display: flex; gap: var(--phrase-gap); padding-left: var(--phrase-gap); }
.arr__phrase { display: flex; }
.arr__bar {
  position: relative;
  flex: none;
  width: var(--bar-w);
  height: var(--row-h);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-start;
  padding: 4px 4px 3px;
  border: 0;
  background: transparent;
  color: var(--subtle);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  box-shadow: inset 1px 0 0 var(--bg-3);
  -webkit-tap-highlight-color: transparent;
}
.arr__bar.first { box-shadow: inset 2px 0 0 var(--edge-dim); }
.arr__bar.first .arr__num { color: var(--cyan); }
.arr__bar:hover { background: var(--bg-2); }
.arr__bar.sel { background: color-mix(in srgb, var(--cyan) 12%, var(--bg)); }
.arr__bar.cursor { box-shadow: inset 0 -3px 0 var(--cyan); }
.arr__bar.now { background: color-mix(in srgb, var(--pink) 22%, var(--bg)); color: var(--ink); }
.arr__num { font-size: 8px; line-height: 8px; }
.arr__chords { display: flex; gap: 6px; color: var(--ink); white-space: nowrap; line-height: 16px; }

.arr__add {
  display: flex;
  padding: 10px 0 12px;
}
.arr__addbox {
  position: sticky;
  left: 0;
  display: grid;
  gap: 8px;
  padding: 0 calc(12px + var(--safe-r)) 0 calc(12px + var(--safe-l));
  max-width: 100vw;
}
.arr__addrow { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.arr__addbtn { display: inline-flex; align-items: center; gap: 8px; }
.arr__hint { margin: 0; color: var(--muted); text-shadow: 2px 2px 0 var(--bg); max-width: 640px; }
.arr__rest { flex: 1; min-height: 24px; }

.arr__selbar {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  z-index: 20;
  max-width: calc(100% - 24px);
}

@media (max-width: 899px) {
  .arr { --head-w: 250px; }
}
@media (max-width: 599px) {
  .arr { --head-w: 150px; }
  .arr__loop { display: none; }
  .arr__addname { display: none; }
}
</style>
