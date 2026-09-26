import { requireMember } from '~/server/utils/member'
import { radioFetch } from '~/server/utils/radioApi'
import { asListener } from '~/server/utils/listener'

export default defineEventHandler(async (event) => {
  const user = await requireMember(event)
  return radioFetch(event, '/jam/snippets', { headers: asListener(user.email.toLowerCase()) })
})
