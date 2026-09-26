/**
 * What the instruments light up: the chord sounding now (stopped: the
 * chord at the cursor) and the piece's scale, as pitch-class sets. The
 * chord is re-read every frame the playhead moves but only changes (and
 * re-renders) when the chord does. Also the surface width, for instruments
 * that size their keys to it, and whether to print computer keys.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import type { Chord } from '~/radio/engine/types.ts'
import { chordPcs } from '~/radio/engine/theory.ts'
import { loadKeyLayout } from '~/utils/keymaps.ts'

export function useSounding() {
  const jam = useJam()
  let last: Chord | null = null
  const chordKey = computed(() => {
    const c = jam.currentChord()
    last = c
    return `${c.root}|${c.bass}|${c.tones.join(',')}|${c.symbol}`
  })
  const chord = computed<Chord>(() => { void chordKey.value; return last! })
  const chordSet = computed(() => new Set(chordPcs(chord.value)))
  const scaleSet = computed(() => new Set(jam.scale()))
  const tonic = computed(() => jam.piece.value.tonic)
  const keys = useKeys()
  onMounted(loadKeyLayout)
  return { chord, chordSet, scaleSet, tonic, labels: keys.keyboardUsed }
}

/** The width and height of an element, kept up to date. */
export function useSize(el: Ref<HTMLElement | null>) {
  const w = ref(0)
  const h = ref(0)
  let ro: ResizeObserver | null = null
  onMounted(() => {
    if (!el.value) return
    const r = el.value.getBoundingClientRect()
    w.value = r.width
    h.value = r.height
    ro = new ResizeObserver(([e]) => {
      if (!e) return
      w.value = e.contentRect.width
      h.value = e.contentRect.height
    })
    ro.observe(el.value)
  })
  onBeforeUnmount(() => ro?.disconnect())
  return { w, h }
}
