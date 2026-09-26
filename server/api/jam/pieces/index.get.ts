import { requireAllowedUser } from '~/server/utils/readerSession'
import { radioFetch } from '~/server/utils/radioApi'
import { asListener } from '~/server/utils/listener'

/** The member's saved pieces: { pieces: [{ id, name, updatedAt, channel? }] }. */
export default defineEventHandler(async (event) => {
  const user = await requireAllowedUser(event)
  return radioFetch(event, '/jam/pieces', { headers: asListener(user.email.toLowerCase()) })
})
