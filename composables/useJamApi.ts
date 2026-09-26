/**
 * jam's calls to radio-api through the Worker's /api/jam proxies (members
 * only; every call throws on 401/403). Pieces and snippets are the
 * member's own; track/feel/channel start Opus jobs (202 { job }) that
 * `waitJob` polls through /api/jobs/:id ({ job }) until done or error.
 */
import type { Piece, Track } from '~/radio/engine/piece/types.ts'

export interface PieceSummary { id: string; name: string; updatedAt: string; channel?: string }
export interface Snippet { id: number; name: string; kind: string; track: Partial<Track> & { bars: string[] }; createdAt?: string }
export interface Job<R = unknown> {
  id: number
  kind: string
  status: 'queued' | 'running' | 'done' | 'error'
  result: R | null
  error: string | null
  createdAt: string
  finishedAt: string | null
}

const json = (body: unknown) => ({ body: body as Record<string, unknown> })

export function useJamApi() {
  return {
    listPieces: () => $fetch<{ pieces: PieceSummary[] }>('/api/jam/pieces'),
    getPiece: (id: string) => $fetch<{ piece: Piece; updatedAt: string }>(`/api/jam/pieces/${encodeURIComponent(id)}`),
    putPiece: (p: Piece) => $fetch<{ piece: Piece; updatedAt: string }>(`/api/jam/pieces/${encodeURIComponent(p.id)}`, { method: 'PUT', ...json(p) }),
    deletePiece: (id: string) => $fetch(`/api/jam/pieces/${encodeURIComponent(id)}`, { method: 'DELETE' }),

    listSnippets: () => $fetch<{ snippets: Snippet[] }>('/api/jam/snippets'),
    postSnippet: (s: { name: string; kind: string; track: Partial<Track> & { bars: string[] } }) =>
      $fetch<{ snippet: Snippet }>('/api/jam/snippets', { method: 'POST', ...json(s) }),
    deleteSnippet: (id: number) => $fetch(`/api/jam/snippets/${id}`, { method: 'DELETE' }),

    /** Opus writes new tracks: result { tracks, note }. */
    askTrack: (b: { piece: Piece; request: string; layer?: string; phrases?: number[] }) =>
      $fetch<{ job: Job<{ tracks: Track[]; note: string }> }>('/api/jam/track', { method: 'POST', ...json(b) }),
    /** The feel conversation: result { reply, brief }. */
    askFeel: (b: { piece: Piece; messages: Array<{ role: 'petter' | 'opus'; text: string }> }) =>
      $fetch<{ job: Job<{ reply: string; brief: string }> }>('/api/jam/feel', { method: 'POST', ...json(b) }),
    /** Make a radio channel: result { landscape, painting }. */
    makeChannel: (b: { piece: Piece; written?: boolean }) => $fetch<{ job: Job<{ landscape: Record<string, unknown>; painting?: unknown }> }>('/api/jam/channel', { method: 'POST', ...json(b) }),

    getJob: async <R>(id: number) => (await $fetch<{ job: Job<R> }>(`/api/jobs/${id}`)).job,
    /** Poll a job every `everyMs` until done or error (or `signal` aborts); `onStatus` sees each poll. */
    async waitJob<R>(id: number, opts: { everyMs?: number; signal?: AbortSignal; onStatus?: (j: Job<R>) => void } = {}): Promise<Job<R>> {
      const every = opts.everyMs ?? 3000
      for (;;) {
        if (opts.signal?.aborted) throw new Error('aborted')
        const j = (await $fetch<{ job: Job<R> }>(`/api/jobs/${id}`)).job
        opts.onStatus?.(j)
        if (j.status === 'done' || j.status === 'error') return j
        await new Promise(r => setTimeout(r, every))
      }
    },
  }
}
