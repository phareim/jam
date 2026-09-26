/**
 * The gate for jam's API routes: an allowlisted Reader member, or in
 * `nuxt dev` on localhost a stand-in member so the proxies reach a local
 * radio-api. `import.meta.dev` is false in the Worker build, which drops the
 * stand-in. readerSession.ts stays byte-identical to the other apps' copies.
 */
import type { H3Event } from 'h3'
import { getRequestHost } from 'h3'
import { requireAllowedUser, type ReaderUser } from '~/server/utils/readerSession'

export function devUser(event: H3Event): ReaderUser | null {
  if (!import.meta.dev) return null
  const host = getRequestHost(event).replace(/:\d+$/, '')
  if (host !== 'localhost' && host !== '127.0.0.1') return null
  return { id: 'dev', email: 'dev@localhost', name: 'Dev' }
}

/** 401 without a session, 403 outside the allowlist; the dev stand-in on localhost. */
export async function requireMember(event: H3Event): Promise<ReaderUser> {
  return devUser(event) ?? requireAllowedUser(event)
}
