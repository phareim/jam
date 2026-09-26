import { requireAllowedUser } from '~/server/utils/readerSession'
import { paramId, radioFetch } from '~/server/utils/radioApi'
import { asListener } from '~/server/utils/listener'
import { PIECE_ID, jsonBody } from '~/server/utils/jam'

/** Save a piece (radio-api validates it and answers 400 with the validator's messages). */
export default defineEventHandler(async (event) => {
  const user = await requireAllowedUser(event)
  const id = paramId(event, PIECE_ID)
  const body = await jsonBody(event)
  return radioFetch(event, `/jam/pieces/${id}`, { method: 'PUT', body, headers: asListener(user.email.toLowerCase()) })
})
