import { requireMember } from '~/server/utils/member'
import { radioFetch } from '~/server/utils/radioApi'
import { asListener } from '~/server/utils/listener'
import { jsonBody } from '~/server/utils/jam'

/** Make a radio channel from the piece: { piece, written? } → 202 { job } (jam-channel). */
export default defineEventHandler(async (event) => {
  const user = await requireMember(event)
  const body = await jsonBody(event)
  return radioFetch(event, '/jam/channel', { method: 'POST', body, headers: asListener(user.email.toLowerCase()) })
})
