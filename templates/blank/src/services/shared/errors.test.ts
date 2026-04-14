import { describe, expect, it, vi } from 'vitest'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from './errors'

describe('ServiceError', () => {
  it('uses explicit statusCode when provided', () => {
    const e = new ServiceError('missing', 'NOT_FOUND', 404)
    expect(e.statusCode).toBe(404)
    expect(e.code).toBe('NOT_FOUND')
  })

  it('defaults status from code when omitted', () => {
    expect(new ServiceError('bad', 'VALIDATION').statusCode).toBe(400)
    expect(new ServiceError('gone', 'NOT_FOUND').statusCode).toBe(404)
  })
})

describe('serviceErrorToActionResponse', () => {
  it('maps to ActionResponse shape', () => {
    const r = serviceErrorToActionResponse(new ServiceError('nope', 'VALIDATION', 400))
    expect(r).toEqual({ status: 400, success: false, error: 'nope' })
  })
})

describe('unknownErrorToActionResponse', () => {
  it('uses Error.message', () => {
    const r = unknownErrorToActionResponse(new Error('db down'))
    expect(r.status).toBe(500)
    expect(r.success).toBe(false)
    expect(r.error).toContain('db down')
  })

  it('logs when logPrefix is set', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    unknownErrorToActionResponse(new Error('x'), '[test]')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
