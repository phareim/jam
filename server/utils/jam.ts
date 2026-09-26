/** Shared bits of the /api/jam proxies. */
import type { H3Event } from 'h3'
import { createError, readBody } from 'h3'

/** A piece id as radio-api takes it. */
export const PIECE_ID = /^[A-Za-z0-9_-]{1,40}$/

/** radio-api takes bodies up to 256 KB; refuse bigger ones here. */
const MAX_BODY = 256 * 1024

/** The request's JSON object, re-serialised for radio-api (400 when it is not an object or too big). */
export async function jsonBody(event: H3Event): Promise<string> {
  const body = await readBody(event)
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw createError({ statusCode: 400, statusMessage: 'JSON object required' })
  }
  const text = JSON.stringify(body)
  if (text.length > MAX_BODY) throw createError({ statusCode: 413, statusMessage: 'Body too large' })
  return text
}
