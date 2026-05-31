import type { ActionResponse } from '@/types/form/actionHandler'

export type ServiceErrorCode = 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'INTERNAL'

export class ServiceError extends Error {
  readonly code: ServiceErrorCode
  readonly statusCode: number

  constructor(message: string, code: ServiceErrorCode = 'INTERNAL', statusCode?: number) {
    super(message)
    this.name = 'ServiceError'
    this.code = code
    this.statusCode =
      statusCode ?? (code === 'NOT_FOUND' ? 404 : code === 'VALIDATION' ? 400 : code === 'CONFLICT' ? 409 : 500)
  }
}

/**
 * Maps a thrown ServiceError to the app's ActionResponse shape for Server Actions.
 */
export function serviceErrorToActionResponse(error: ServiceError): ActionResponse {
  return {
    status: error.statusCode,
    success: false,
    error: error.message,
  }
}

/**
 * Maps unknown errors to a 500 ActionResponse.
 */
export function unknownErrorToActionResponse(error: unknown, logPrefix?: string): ActionResponse {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error'
  if (logPrefix) {
    console.error(`${logPrefix}`, error)
  }
  return {
    status: 500,
    success: false,
    error: `Server error occurred: ${message}`,
  }
}
