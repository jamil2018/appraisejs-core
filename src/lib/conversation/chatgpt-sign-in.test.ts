import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { consumeChatGptSignInCallback, createChatGptSignInAttempt } from './chatgpt-sign-in'

const entropy = {
  verifier: new Uint8Array(32).fill(1),
  state: new Uint8Array(32).fill(2),
  nonce: new Uint8Array(32).fill(3),
}

function callback(redirectUri: string, params: Record<string, string>): string {
  const url = new URL(redirectUri)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url.toString()
}

describe('ChatGPT sign-in protocol construction', () => {
  it('builds a first-time registration with exact loopback URI, scopes, and S256 challenge', () => {
    const attempt = createChatGptSignInAttempt({
      client: { kind: 'initial', hostId: 'urn:uuid:host-one', agentName: 'AppraiseJS' },
      callbackPort: 1455,
      entropy,
    })
    const url = new URL(attempt.authorizationUrl)
    expect(url.origin + url.pathname).toBe('https://auth.openai.com/api/accounts/authorize')
    expect(attempt.redirectUri).toBe('http://127.0.0.1:1455/auth/callback')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'dynamic_agent_client',
      agent_name_hint: 'AppraiseJS',
      ext_agent_host_id: 'urn:uuid:host-one',
      response_type: 'code',
      redirect_uri: attempt.redirectUri,
      resource: 'https://api.openai.com/v1',
      scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
      state: attempt.state,
      nonce: attempt.nonce,
      code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(attempt.codeVerifier).digest('base64url'),
    })
    expect(attempt.codeVerifier).toHaveLength(43)
    expect(attempt.state).toHaveLength(43)

    const result = consumeChatGptSignInCallback(
      attempt,
      callback(attempt.redirectUri, {
        code: 'code-one',
        state: attempt.state,
        client_id: 'oaiapp_issued-one',
      }),
    )
    expect(result.status).toBe('authorized')
    if (result.status !== 'authorized') throw new Error('Expected authorization')
    expect(result.clientId).toBe('oaiapp_issued-one')
    expect(result.exchange.url).toBe('https://auth.openai.com/api/accounts/oauth/token')
    expect(result.exchange.method).toBe('POST')
    expect(result.exchange.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' })
    expect(Object.fromEntries(new URLSearchParams(result.exchange.body))).toEqual({
      grant_type: 'authorization_code',
      client_id: 'oaiapp_issued-one',
      code: 'code-one',
      code_verifier: attempt.codeVerifier,
      redirect_uri: attempt.redirectUri,
      resource: 'https://api.openai.com/v1',
    })
  })

  it('uses the selected issued ID and account hints for returning sign-in', () => {
    const attempt = createChatGptSignInAttempt({
      client: {
        kind: 'returning',
        hostId: 'urn:uuid:host-one',
        clientId: 'oaiapp_saved',
        idTokenHint: 'prior-token',
        loginHint: 'person@example.com',
      },
      callbackPort: 54321,
      entropy,
    })
    const url = new URL(attempt.authorizationUrl)
    expect(url.searchParams.get('client_id')).toBe('oaiapp_saved')
    expect(url.searchParams.has('agent_name_hint')).toBe(false)
    expect(url.searchParams.get('id_token_hint')).toBe('prior-token')
    expect(url.searchParams.get('login_hint')).toBe('person@example.com')
    const result = consumeChatGptSignInCallback(
      attempt,
      callback(attempt.redirectUri, { code: 'code-two', state: attempt.state }),
    )
    expect(result.status).toBe('authorized')
    if (result.status !== 'authorized') throw new Error('Expected authorization')
    expect(result.clientId).toBe('oaiapp_saved')
    expect(new URLSearchParams(result.exchange.body).get('client_id')).toBe('oaiapp_saved')
  })

  it('rejects mismatched state, URI, and client binding before constructing an exchange', () => {
    const attempt = createChatGptSignInAttempt({
      client: { kind: 'returning', hostId: 'host-one', clientId: 'oaiapp_saved' },
      callbackPort: 1455,
      entropy,
    })
    expect(() =>
      consumeChatGptSignInCallback(attempt, callback(attempt.redirectUri, { code: 'x', state: 'wrong' })),
    ).toThrow('state')
    expect(() =>
      consumeChatGptSignInCallback(
        attempt,
        callback('http://localhost:1455/auth/callback', { code: 'x', state: attempt.state }),
      ),
    ).toThrow('URI')
    expect(() =>
      consumeChatGptSignInCallback(
        attempt,
        callback('http://127.0.0.1:1455/callback', { code: 'x', state: attempt.state }),
      ),
    ).toThrow('URI')
    expect(() =>
      consumeChatGptSignInCallback(
        attempt,
        callback(attempt.redirectUri, {
          code: 'x',
          state: attempt.state,
          client_id: 'oaiapp_other',
        }),
      ),
    ).toThrow('client ID')
    expect(() =>
      consumeChatGptSignInCallback(
        attempt,
        `${callback(attempt.redirectUri, { code: 'x', state: attempt.state })}&state=${attempt.state}`,
      ),
    ).toThrow('Duplicate')
  })

  it('stops on access denial after checking state and requires an issued ID on registration', () => {
    const attempt = createChatGptSignInAttempt({
      client: { kind: 'initial', hostId: 'host-one', agentName: 'AppraiseJS' },
      callbackPort: 1455,
      entropy,
    })
    expect(
      consumeChatGptSignInCallback(
        attempt,
        callback(attempt.redirectUri, { error: 'access_denied', state: attempt.state }),
      ),
    ).toEqual({ status: 'denied' })
    expect(() =>
      consumeChatGptSignInCallback(attempt, callback(attempt.redirectUri, { error: 'access_denied', state: 'wrong' })),
    ).toThrow('state')
    expect(() =>
      consumeChatGptSignInCallback(attempt, callback(attempt.redirectUri, { code: 'x', state: attempt.state })),
    ).toThrow('issued client ID')
  })

  it('rejects weak or reused entropy and dynamic IDs for returning requests', () => {
    expect(() =>
      createChatGptSignInAttempt({
        client: { kind: 'initial', hostId: 'host-one', agentName: 'AppraiseJS' },
        callbackPort: 1455,
        entropy: { ...entropy, state: new Uint8Array(4) },
      }),
    ).toThrow('32 random bytes')
    expect(() =>
      createChatGptSignInAttempt({
        client: { kind: 'initial', hostId: 'host-one', agentName: 'AppraiseJS' },
        callbackPort: 1455,
        entropy: { ...entropy, state: entropy.verifier },
      }),
    ).toThrow('independent')
    expect(() =>
      createChatGptSignInAttempt({
        client: { kind: 'returning', hostId: 'host-one', clientId: 'dynamic_agent_client' },
        callbackPort: 1455,
        entropy,
      }),
    ).toThrow('issued client ID')
  })
})
