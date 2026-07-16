import { describe, expect, it } from 'vitest'

import { evaluateLocalRequestBoundary } from './local-request-boundary'

const request = (overrides: Partial<Parameters<typeof evaluateLocalRequestBoundary>[0]> = {}) =>
  evaluateLocalRequestBoundary({
    method: 'POST',
    host: '127.0.0.1:3000',
    origin: 'http://127.0.0.1:3000',
    forwardedFor: null,
    ...overrides,
  })

describe('local request boundary', () => {
  it.each(['attacker.test', '127.0.0.1.attacker.test', '0.0.0.0:3000'])('rejects DNS-rebinding Host %s', host => {
    expect(request({ host })).toMatchObject({ allowed: false, code: 'invalid-local-host' })
  })

  it('rejects forged origins before mutation routing', () => {
    expect(request({ origin: 'https://attacker.test' })).toMatchObject({
      allowed: false,
      code: 'cross-origin-mutation',
    })
  })

  it('allows absent Origin for local non-browser clients', () => {
    expect(request({ origin: null })).toEqual({ allowed: true })
  })

  it('allows valid local reads and mutations', () => {
    expect(request()).toEqual({ allowed: true })
    expect(request({ method: 'GET', origin: 'https://attacker.test' })).toEqual({ allowed: true })
  })

  it('rejects forwarded non-loopback peers', () => {
    expect(request({ forwardedFor: '203.0.113.7' })).toMatchObject({ allowed: false, code: 'non-local-peer' })
  })
})
