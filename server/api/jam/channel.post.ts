import { requireAllowedUser } from '~/server/utils/readerSession'
import { radioFetch } from '~/server/utils/radioApi'
import { asListener } from '~/server/utils/listener'
import { jsonBody } from '~/server/utils/jam'

/** Make a radio channel from the piece: { piece } → 202 { job } (jam-channel). */
export default defineEventHandler(async (event) => {
  const user = await requireAllowedUser(event)
  const body = await jsonBody(event)
  return radioFetch(event, '/jam/channel', { method: 'POST', body, headers: asListener(user.email.toLowerCase()) })
})
