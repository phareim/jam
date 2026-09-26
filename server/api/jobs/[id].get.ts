import { requireMember } from '~/server/utils/member'
import { paramId, radioFetch } from '~/server/utils/radioApi'

export default defineEventHandler(async (event) => {
  await requireMember(event)
  const id = paramId(event, /^\d{1,10}$/)
  return radioFetch(event, `/jobs/${id}`)
})
