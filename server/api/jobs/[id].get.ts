import { requireMember } from '~/server/utils/member'
import { paramId, radioFetch } from '~/server/utils/radioApi'
import { asListener } from '~/server/utils/listener'

// radio-api answers a job only to the member who started it.
export default defineEventHandler(async (event) => {
  const user = await requireMember(event)
  const id = paramId(event, /^\d{1,10}$/)
  return radioFetch(event, `/jobs/${id}`, { headers: asListener(user.email.toLowerCase()) })
})
