import { createHash, timingSafeEqual } from 'node:crypto'

/** Offline request construction only. The host owns entropy, the listener, browser, and credentials. */
export type ChatGptSignInClient =
  | { kind: 'initial'; hostId: string; agentName: string }
  | {
      kind: 'returning'
      hostId: string
      clientId: string
      idTokenHint?: string
      loginHint?: string
      requestConsent?: boolean
    }

export type ChatGptSignInEntropy = {
  /** Three independent, cryptographically random 32-byte values supplied by the host. */
  verifier: Uint8Array
  state: Uint8Array
  nonce: Uint8Array
}

export type ChatGptSignInAttempt = {
  authorizationUrl: string
  redirectUri: string
  client: ChatGptSignInClient
  state: string
  nonce: string
  codeVerifier: string
}

export type ChatGptTokenExchangeRequest = {
  url: 'https://auth.openai.com/api/accounts/oauth/token'
  method: 'POST'
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  body: string
}

export type ChatGptSignInCallbackResult =
  | { status: 'authorized'; clientId: string; exchange: ChatGptTokenExchangeRequest }
  | { status: 'denied' }
  | { status: 'provider_error'; errorCode: string }

const AUTHORIZATION_URL = 'https://auth.openai.com/api/accounts/authorize'
const TOKEN_URL = 'https://auth.openai.com/api/accounts/oauth/token'
const RESOURCE = 'https://api.openai.com/v1'
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
const DYNAMIC_CLIENT_ID = 'dynamic_agent_client'

function required(value: string, field: string): string {
  if (!value || value !== value.trim()) throw new Error(`${field} must be a nonempty, trimmed value`)
  return value
}

function randomParameter(bytes: Uint8Array, field: string): string {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 32) {
    throw new Error(`${field} must contain 32 random bytes`)
  }
  return Buffer.from(bytes).toString('base64url')
}

function sameValue(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

/**
 * Construct one PKCE/OIDC authorization attempt after the host has reserved and started
 * its 127.0.0.1 callback listener. The host must keep the attempt private and discard it
 * after one callback or cancellation; this pure module cannot enforce one-time custody.
 */
export function createChatGptSignInAttempt(input: {
  client: ChatGptSignInClient
  callbackPort: number
  entropy: ChatGptSignInEntropy
}): ChatGptSignInAttempt {
  const { client, callbackPort, entropy } = input
  if (!Number.isInteger(callbackPort) || callbackPort < 1 || callbackPort > 65535) {
    throw new Error('callbackPort must be an available TCP port')
  }
  required(client.hostId, 'hostId')
  if (client.kind === 'initial') required(client.agentName, 'agentName')
  else {
    required(client.clientId, 'clientId')
    if (client.clientId === DYNAMIC_CLIENT_ID) throw new Error('Returning sign-in requires an issued client ID')
    if (client.idTokenHint !== undefined) required(client.idTokenHint, 'idTokenHint')
    if (client.loginHint !== undefined) required(client.loginHint, 'loginHint')
  }

  const codeVerifier = randomParameter(entropy.verifier, 'verifier')
  const state = randomParameter(entropy.state, 'state')
  const nonce = randomParameter(entropy.nonce, 'nonce')
  if (codeVerifier === state || codeVerifier === nonce || state === nonce) {
    throw new Error('verifier, state, and nonce must be independent values')
  }
  const redirectUri = `http://127.0.0.1:${callbackPort}/auth/callback`
  const url = new URL(AUTHORIZATION_URL)
  url.searchParams.set('client_id', client.kind === 'initial' ? DYNAMIC_CLIENT_ID : client.clientId)
  if (client.kind === 'initial') url.searchParams.set('agent_name_hint', client.agentName)
  url.searchParams.set('ext_agent_host_id', client.hostId)
  if (client.kind === 'returning') {
    if (client.idTokenHint) url.searchParams.set('id_token_hint', client.idTokenHint)
    if (client.loginHint) url.searchParams.set('login_hint', client.loginHint)
    if (client.requestConsent) url.searchParams.set('prompt', 'consent')
  }
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', SCOPES)
  url.searchParams.set('resource', RESOURCE)
  url.searchParams.set('state', state)
  url.searchParams.set('nonce', nonce)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('code_challenge', createHash('sha256').update(codeVerifier).digest('base64url'))

  return { authorizationUrl: url.toString(), redirectUri, client, state, nonce, codeVerifier }
}

/** Validate a callback and form the exchange request. Caller removes the pending attempt first. */
export function consumeChatGptSignInCallback(
  attempt: ChatGptSignInAttempt,
  callbackUrl: string,
): ChatGptSignInCallbackResult {
  let callback: URL
  try {
    callback = new URL(callbackUrl)
  } catch {
    throw new Error('Invalid ChatGPT callback URL')
  }
  const expected = new URL(attempt.redirectUri)
  if (
    callback.origin !== expected.origin ||
    callback.pathname !== expected.pathname ||
    callback.username ||
    callback.password ||
    callback.hash
  ) {
    throw new Error('ChatGPT callback URI does not match the pending attempt')
  }
  for (const key of ['state', 'code', 'error', 'client_id']) {
    if (callback.searchParams.getAll(key).length > 1) {
      throw new Error(`Duplicate ChatGPT callback parameter: ${key}`)
    }
  }
  const callbackState = callback.searchParams.get('state')
  if (!callbackState || !sameValue(callbackState, attempt.state)) {
    throw new Error('ChatGPT callback state does not match the pending attempt')
  }
  const error = callback.searchParams.get('error')
  const code = callback.searchParams.get('code')
  if (error !== null) {
    if (!error || code !== null) throw new Error('Invalid ChatGPT callback result')
    return error === 'access_denied' ? { status: 'denied' } : { status: 'provider_error', errorCode: error }
  }
  if (!code) throw new Error('ChatGPT callback is missing an authorization code')

  const callbackClientId = callback.searchParams.get('client_id')
  let clientId: string
  if (attempt.client.kind === 'initial') {
    if (!callbackClientId || callbackClientId === DYNAMIC_CLIENT_ID) {
      throw new Error('ChatGPT registration did not return an issued client ID')
    }
    clientId = callbackClientId
  } else {
    clientId = attempt.client.clientId
    if (callbackClientId !== null && callbackClientId !== clientId) {
      throw new Error('ChatGPT callback client ID does not match the selected account')
    }
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    code_verifier: attempt.codeVerifier,
    redirect_uri: attempt.redirectUri,
    resource: RESOURCE,
  })
  return {
    status: 'authorized',
    clientId,
    exchange: {
      url: TOKEN_URL,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
  }
}
