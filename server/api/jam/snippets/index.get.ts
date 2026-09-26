import { requireAllowedUser } from '~/server/utils/readerSession'
import { radioFetch } from '~/server/utils/radioApi'
import { asListener } from '~/server/utils/listener'

export default defineEventHandler(async (event) => {
  const user = await requireAllowedUser(event)
  return radioFetch(event, '/jam/snippets', { headers: asListener(user.email.toLowerCase()) })
})
