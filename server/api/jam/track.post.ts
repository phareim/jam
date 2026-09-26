import { requireAllowedUser } from '~/server/utils/readerSession'
import { radioFetch } from '~/server/utils/radioApi'
import { asListener } from '~/server/utils/listener'
import { jsonBody } from '~/server/utils/jam'

/** Opus writes new tracks for the piece: { piece, request, layer?, phrases? } → 202 { job } (jam-track). */
export default defineEventHandler(async (event) => {
  const user = await requireAllowedUser(event)
  const body = await jsonBody(event)
  return radioFetch(event, '/jam/track', { method: 'POST', body, headers: asListener(user.email.toLowerCase()) })
})
