/** Payload types for action `data` fields. */
export type ActionResponseData = Record<string, unknown> | Record<string, unknown>[] | unknown[] | unknown

/**
 * Server Action JSON return shape.
 * Refactored actions should set `success: true` with `data`, or `success: false` with `error`.
 * Callers often read `error` without narrowing; all fields stay optional for compatibility.
 */
export type ActionResponse = {
  status: number
  success?: boolean
  data?: ActionResponseData
  message?: string
  error?: string
}
