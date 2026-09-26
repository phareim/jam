import { requireAllowedUser } from '~/server/utils/readerSession'
import { radioFetch } from '~/server/utils/radioApi'
import { asListener } from '~/server/utils/listener'
import { jsonBody } from '~/server/utils/jam'

/** Store a snippet { name, kind, track } (201 { snippet }). */
export default defineEventHandler(async (event) => {
  const user = await requireAllowedUser(event)
  const body = await jsonBody(event)
  return radioFetch(event, '/jam/snippets', { method: 'POST', body, headers: asListener(user.email.toLowerCase()) })
})
