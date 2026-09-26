import { requireMember } from '~/server/utils/member'
import { paramId, radioFetch } from '~/server/utils/radioApi'
import { asListener } from '~/server/utils/listener'
import { PIECE_ID } from '~/server/utils/jam'

export default defineEventHandler(async (event) => {
  const user = await requireMember(event)
  const id = paramId(event, PIECE_ID)
  return radioFetch(event, `/jam/pieces/${id}`, { headers: asListener(user.email.toLowerCase()) })
})
