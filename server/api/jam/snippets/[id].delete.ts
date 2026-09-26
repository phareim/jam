import { requireMember } from '~/server/utils/member'
import { paramId, radioFetch } from '~/server/utils/radioApi'
import { asListener } from '~/server/utils/listener'

export default defineEventHandler(async (event) => {
  const user = await requireMember(event)
  const id = paramId(event, /^\d{1,10}$/)
  return radioFetch(event, `/jam/snippets/${id}`, { method: 'DELETE', headers: asListener(user.email.toLowerCase()) })
})
