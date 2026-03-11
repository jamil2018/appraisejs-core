export type ActionResponse = {
  status: number
  data?: Record<string, unknown> | Record<string, unknown>[] | unknown[] | unknown
  message?: string
  error?: string
}
