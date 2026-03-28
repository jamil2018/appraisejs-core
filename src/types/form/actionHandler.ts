export type ActionResponse = {
  status: number
  /** Present on responses from refactored actions; omitted on legacy responses. */
  success?: boolean
  data?: Record<string, unknown> | Record<string, unknown>[] | unknown[] | unknown
  message?: string
  error?: string
}
