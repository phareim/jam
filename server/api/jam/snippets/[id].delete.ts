import { requireAllowedUser } from '~/server/utils/readerSession'
import { paramId, radioFetch } from '~/server/utils/radioApi'
import { asListener } from '~/server/utils/listener'

export default defineEventHandler(async (event) => {
  const user = await requireAllowedUser(event)
  const id = paramId(event, /^\d{1,10}$/)
  return radioFetch(event, `/jam/snippets/${id}`, { method: 'DELETE', headers: asListener(user.email.toLowerCase()) })
})
