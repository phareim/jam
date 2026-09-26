import { requireAllowedUser } from '~/server/utils/readerSession'
import { radioFetch } from '~/server/utils/radioApi'
import { asListener } from '~/server/utils/listener'
import { jsonBody } from '~/server/utils/jam'

/** One turn of the feel conversation: { piece, messages } → 202 { job } (jam-feel). */
export default defineEventHandler(async (event) => {
  const user = await requireAllowedUser(event)
  const body = await jsonBody(event)
  return radioFetch(event, '/jam/feel', { method: 'POST', body, headers: asListener(user.email.toLowerCase()) })
})
