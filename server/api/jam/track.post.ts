import { requireMember } from '~/server/utils/member'
import { radioFetch } from '~/server/utils/radioApi'
import { asListener } from '~/server/utils/listener'
import { jsonBody } from '~/server/utils/jam'

/** Opus writes new tracks for the piece: { piece, request, layer?, phrases? } → 202 { job } (jam-track). */
export default defineEventHandler(async (event) => {
  const user = await requireMember(event)
  const body = await jsonBody(event)
  return radioFetch(event, '/jam/track', { method: 'POST', body, headers: asListener(user.email.toLowerCase()) })
})
