import { generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { chatGptConnectionStatus, validateChatGptTokenResponse } from './chatgpt-identity'

const now = new Date('2026-11-24T00:00:00.000Z')
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' }] }

function signedToken(overrides: Record<string, unknown> = {}, key = privateKey): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString('base64url')
  const claims = Buffer.from(
    JSON.stringify({
      iss: 'https://auth.openai.com',
      aud: 'oaiapp_test',
      exp: 1795482000,
      iat: 1795478400,
      nonce: 'nonce-test',
      sub: 'subject-one',
      email: 'verified@example.com',
      email_verified: true,
      ...overrides,
    }),
  ).toString('base64url')
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), key).toString('base64url')
  return `${header}.${claims}.${signature}`
}

function response(overrides: Record<string, unknown> = {}) {
  return {
    id_token: signedToken(),
    access_token: 'synthetic-access',
    refresh_token: 'synthetic-refresh',
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'openid offline_access chatgpt.tokens.use.direct',
    ...overrides,
  }
}

function context(overrides: Record<string, unknown> = {}) {
  return { clientId: 'oaiapp_test', hostId: 'urn:uuid:synthetic', nonce: 'nonce-test', jwks, now, ...overrides }
}

describe('ChatGPT signed identity acceptance', () => {
  it('accepts a signed account and projects only safe status', () => {
    const record = validateChatGptTokenResponse(response(), context())
    expect(record).toMatchObject({
      client_id: 'oaiapp_test',
      subject: 'subject-one',
      email: 'verified@example.com',
      scopes: ['openid', 'offline_access', 'chatgpt.tokens.use.direct'],
    })
    expect(chatGptConnectionStatus(record, now)).toEqual({ state: 'connected', account: 'verified@example.com' })
    expect(JSON.stringify(chatGptConnectionStatus(record, now))).not.toContain('synthetic-access')
    expect(chatGptConnectionStatus(record, new Date(now.getTime() + 3_600_000))).toMatchObject({ state: 'expired' })
  })

  it('retains identity but withholds plan status when the granted scope was declined', () => {
    const record = validateChatGptTokenResponse(response({ scope: 'openid email' }), context())
    expect(chatGptConnectionStatus(record, now)).toMatchObject({ state: 'plan-permission-required' })
  })

  it.each([
    ['issuer', { iss: 'https://other.example' }],
    ['audience', { aud: 'another-client' }],
    ['expiry', { exp: 1795478390 }],
    ['nonce', { nonce: 'other-nonce' }],
    ['missing subject', { sub: '' }],
    ['future issue', { iat: 1795478500 }],
  ])('rejects invalid %s claims', (_label, claims) => {
    expect(() => validateChatGptTokenResponse(response({ id_token: signedToken(claims) }), context())).toThrow()
  })

  it('rejects a valid signature for a different selected account', () => {
    expect(() => validateChatGptTokenResponse(response(), context({ expectedSubject: 'subject-two' }))).toThrow(
      /selected account/,
    )
  })

  it('rejects tampering, unknown signing keys, and unsigned JWTs', () => {
    const altered = signedToken().split('.')
    altered[1] = Buffer.from(JSON.stringify({ sub: 'attacker' })).toString('base64url')
    expect(() => validateChatGptTokenResponse(response({ id_token: altered.join('.') }), context())).toThrow()
    expect(() => validateChatGptTokenResponse(response(), context({ jwks: { keys: [] } }))).toThrow()
    expect(() => validateChatGptTokenResponse(response({ id_token: 'eyJhbGciOiJub25lIn0.e30.' }), context())).toThrow()
  })

  it('rejects oversized token material and missing rotating refresh token', () => {
    expect(() => validateChatGptTokenResponse(response({ access_token: 'x'.repeat(16_385) }), context())).toThrow()
    expect(() => validateChatGptTokenResponse(response({ refresh_token: undefined }), context())).toThrow()
  })
})
