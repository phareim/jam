/**
 * Hear a few bars on their own, now, without the transport: the dialogs'
 * ▶ buttons (a library pattern, a snippet, the bar in the step editor).
 * The bars are played note by note through useJam().live() on a timer at
 * the piece's tempo and swing. One audition at a time; `current` is the key
 * of the one sounding (for the buttons), null when quiet.
 */
import { ref } from 'vue'
import type { DrumHit, KitId, Layer, LiveNote, LiveSound, VoiceId } from '~/radio/engine/types.ts'
import { grooveOf, notesOf } from '~/radio/engine/piece/conductor.ts'

export interface AuditionSource { layer: Layer; voice?: VoiceId; kit?: KitId; gain?: number }

const DRUM_VEL: Record<string, number> = { X: 1, x: 0.8, g: 0.35 }
const LEAD_MS = 60

const current = ref<string | null>(null)
let timers: Array<ReturnType<typeof setTimeout>> = []
let held: LiveNote[] = []

function stop(): void {
  for (const t of timers) clearTimeout(t)
  timers = []
  for (const n of held) n.release()
  held = []
  current.value = null
}

/** Play `bars` of one track (kit → drum bars, voice → note bars) once; `key` names it for `current`. */
function play(key: string, src: AuditionSource, bars: string[]): void {
  stop()
  const jam = useJam()
  const { bpm, swing } = jam.piece.value
  const stepMs = 60_000 / bpm / 4
  const gain = src.gain ?? 1
  const at = (bar: number, step: number) => LEAD_MS + (bar * 16 + step + (Math.floor(step) % 2 === 1 ? swing : 0)) * stepMs
  const later = (ms: number, fn: () => void) => { timers.push(setTimeout(fn, ms)) }
  let end = 0
  bars.forEach((b, i) => {
    if (!b.trim()) return
    if (src.kit) {
      for (const [hit, row] of Object.entries(grooveOf(b))) {
        if (!row) continue
        for (let s = 0; s < 16; s++) {
          const vel = DRUM_VEL[row[s]!]
          if (!vel) continue
          const sound: LiveSound = { kit: src.kit, hit: hit as DrumHit }
          later(at(i, s), () => { jam.live(src.layer, sound, vel * gain) })
        }
      }
    } else if (src.voice) {
      for (const n of notesOf(b)) {
        const sound: LiveSound = { voice: src.voice, midi: n.midi }
        const t = at(i, n.step)
        const dur = Math.max(40, n.len * stepMs - 10)
        later(t, () => {
          const h = jam.live(src.layer, sound, n.vel * gain)
          held.push(h)
          later(dur, () => { h.release(); held = held.filter(x => x !== h) })
        })
        end = Math.max(end, t + dur)
      }
    }
  })
  end = Math.max(end, at(bars.length, 0))
  current.value = key
  later(end + 200, stop)
}

export function useAudition() {
  return {
    current,
    play,
    stop,
    /** Play, or stop when this key is the one sounding. */
    toggle(key: string, src: AuditionSource, bars: string[]): void {
      if (current.value === key) stop()
      else play(key, src, bars)
    },
  }
}
