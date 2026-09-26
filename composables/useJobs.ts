/**
 * Opus's jobs from the dialogs (jam-track, jam-feel, jam-channel), kept
 * while they run so a dialog can be closed and the result still lands: the
 * list lives here (and in localStorage 'jam.jobs', so a reload picks the
 * polling up again), each job is polled through useJamApi().waitJob, and a
 * gold toast says when Opus is done.
 *
 * What a result does when it lands:
 *   - jam-track: the tracks wait here as a proposal until OpusDialog keeps
 *     or drops them (`take`).
 *   - jam-feel: Petter's line and Opus's reply go into the piece's feel
 *     with the new brief, one undo step, then the job is forgotten.
 *   - jam-channel: the piece's `channel` is set (one undo step) and the
 *     composed channels are fetched again; the result waits for
 *     ChannelDialog to show it.
 * A result for a piece that is no longer open is kept (track, channel) or
 * dropped with a toast (feel).
 */
import { ref } from 'vue'
import type { Piece, Track } from '~/radio/engine/piece/types.ts'
import type { Job } from './useJamApi'
import { load, save } from './storage'

export type JamJobKind = 'jam-track' | 'jam-feel' | 'jam-channel'
type FeelMsg = { role: 'petter' | 'opus'; text: string; at?: string }

export interface TrackResult { tracks: Track[]; note: string; repaired?: boolean }
export interface FeelResult { reply: string; brief: string }
export interface ChannelResult { landscape: { id: string; name: string; blurb?: string; accent?: string; scene?: string }; repaired?: boolean; painting?: boolean }

export interface JamJob {
  id: number
  kind: JamJobKind
  pieceId: string
  pieceName: string
  status: Job['status']
  /** Date.now() when asked. */
  since: number
  error?: string
  /** jam-track: what was asked. jam-feel: Petter's line ('' when Opus opens). */
  request?: string
  result?: TrackResult | FeelResult | ChannelResult
}

const LS = 'jam.jobs'
const jobs = ref<JamJob[]>([])
const polling = new Set<number>()
let inited = false

function persist(): void {
  save(LS, jobs.value)
}

function patch(id: number, p: Partial<JamJob>): void {
  jobs.value = jobs.value.map(j => (j.id === id ? { ...j, ...p } : j))
  persist()
}

function forget(id: number): void {
  jobs.value = jobs.value.filter(j => j.id !== id)
  persist()
}

function errText(err: unknown): string {
  const e = err as { statusCode?: number; data?: { data?: string; message?: string }; message?: string }
  if (e.statusCode === 401 || e.statusCode === 403) return 'SIGN IN FIRST'
  return String(e.data?.data ?? e.data?.message ?? e.message ?? 'failed').slice(0, 300)
}

const LABEL: Record<JamJobKind, string> = { 'jam-track': 'THE TRACK', 'jam-feel': 'THE FEEL', 'jam-channel': 'THE CHANNEL' }

function landed(job: JamJob, j: Job): void {
  const jam = useJam()
  if (j.status === 'error') {
    patch(job.id, { status: 'error', error: String(j.error ?? 'Opus failed').slice(0, 400) })
    jam.say(`OPUS: ${LABEL[job.kind]} FAILED`, 'warn')
    return
  }
  const same = jam.piece.value.id === job.pieceId
  if (job.kind === 'jam-feel') {
    const r = j.result as FeelResult
    forget(job.id)
    if (!same) { jam.say('OPUS ANSWERED ABOUT ANOTHER PIECE', 'warn'); return }
    const at = new Date().toISOString()
    jam.transact('feel', (d) => {
      const msgs: FeelMsg[] = [...(d.feel?.messages ?? [])]
      if (job.request) msgs.push({ role: 'petter', text: job.request, at })
      if (r.reply) msgs.push({ role: 'opus', text: r.reply, at })
      d.feel = { messages: msgs, brief: r.brief || d.feel?.brief || '' }
    })
    jam.say('OPUS ANSWERED', 'gold')
    return
  }
  if (job.kind === 'jam-channel') {
    const r = j.result as ChannelResult
    patch(job.id, { status: 'done', result: r })
    if (same && r.landscape?.id) jam.transact('channel', (d) => { d.channel = r.landscape.id })
    void jam.refreshLandscapes()
    jam.say(`NEW CHANNEL: ${String(r.landscape?.name ?? '').toUpperCase()}`, 'gold')
    return
  }
  const r = j.result as TrackResult
  patch(job.id, { status: 'done', result: r })
  const n = r.tracks?.length ?? 0
  jam.say(`OPUS WROTE ${n} TRACK${n === 1 ? '' : 'S'}`, 'gold')
}

async function poll(job: JamJob): Promise<void> {
  if (polling.has(job.id)) return
  polling.add(job.id)
  const api = useJamApi()
  try {
    for (let tries = 0; ; tries++) {
      try {
        const j = await api.waitJob(job.id, {
          everyMs: 3000,
          onStatus: (s) => { if (s.status !== job.status && s.status !== 'done' && s.status !== 'error') patch(job.id, { status: s.status }) },
        })
        const cur = jobs.value.find(x => x.id === job.id)
        if (cur) landed(cur, j)
        return
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode
        if (code === 404 || code === 401 || code === 403 || tries > 20) {
          patch(job.id, { status: 'error', error: code === 404 ? 'THE JOB IS GONE' : errText(err) })
          return
        }
        // Offline or the backend restarting: try again in a while.
        await new Promise(r => setTimeout(r, 10_000))
      }
    }
  } finally {
    polling.delete(job.id)
  }
}

function init(): void {
  if (inited || typeof window === 'undefined') return
  inited = true
  const saved = load<JamJob[]>(LS, [])
  jobs.value = Array.isArray(saved) ? saved.filter(j => j && typeof j.id === 'number') : []
  for (const j of jobs.value) if (j.status === 'queued' || j.status === 'running') void poll(j)
}

/** Start an Opus job; returns it, or throws with a short reason. */
async function start(kind: 'jam-track', body: { piece: Piece; request: string; layer?: string; phrases?: number[] }): Promise<JamJob>
async function start(kind: 'jam-feel', body: { piece: Piece; messages: FeelMsg[]; line: string }): Promise<JamJob>
async function start(kind: 'jam-channel', body: { piece: Piece }): Promise<JamJob>
async function start(kind: JamJobKind, body: Record<string, unknown>): Promise<JamJob> {
  const api = useJamApi()
  const piece = body.piece as Piece
  let res: { job: Job }
  try {
    if (kind === 'jam-track') res = await api.askTrack(body as Parameters<typeof api.askTrack>[0])
    else if (kind === 'jam-feel') res = await api.askFeel({ piece, messages: (body.messages as FeelMsg[]).map(({ role, text }) => ({ role, text })) })
    else res = await api.makeChannel({ piece })
  } catch (err) {
    throw new Error(errText(err))
  }
  const job: JamJob = {
    id: res.job.id,
    kind,
    pieceId: piece.id,
    pieceName: piece.name,
    status: res.job.status,
    since: Date.now(),
    request: kind === 'jam-track' ? String(body.request) : kind === 'jam-feel' ? String(body.line ?? '') : undefined,
  }
  jobs.value = [...jobs.value.filter(j => j.id !== job.id), job]
  persist()
  void poll(job)
  return job
}

export function useJobs() {
  init()
  return {
    jobs,
    start,
    forget,
    /** The newest job of a kind (for this piece when `pieceId` is given). */
    latest(kind: JamJobKind, pieceId?: string): JamJob | null {
      const list = jobs.value.filter(j => j.kind === kind && (!pieceId || j.pieceId === pieceId))
      return list[list.length - 1] ?? null
    },
    /** Is a job of this kind still waiting for Opus? */
    busy(kind: JamJobKind): boolean {
      return jobs.value.some(j => j.kind === kind && (j.status === 'queued' || j.status === 'running'))
    },
    /** Drop some of a track proposal's tracks (after KEEP or DROP); the job goes when none are left. */
    take(id: number, indices: number[]): void {
      const j = jobs.value.find(x => x.id === id)
      const r = j?.result as TrackResult | undefined
      if (!j || !r) return
      const tracks = r.tracks.filter((_, i) => !indices.includes(i))
      if (!tracks.length) forget(id)
      else patch(id, { result: { ...r, tracks } })
    },
  }
}
