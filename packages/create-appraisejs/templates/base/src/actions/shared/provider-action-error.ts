import { z } from 'zod'

import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import type { ActionResponse } from '@/types/form/actionHandler'

export function providerActionErrorResponse(error: unknown, errorPrefix: string): ActionResponse {
  if (error instanceof ServiceError) return serviceErrorToActionResponse(error)
  if (error instanceof z.ZodError) return { status: 400, success: false, error: error.issues[0]?.message }
  return unknownErrorToActionResponse(error, errorPrefix)
}
