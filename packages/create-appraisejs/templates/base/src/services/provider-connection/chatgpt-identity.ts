import { constants, createPublicKey, timingSafeEqual, verify } from 'node:crypto'

const ISSUER = 'https://auth.openai.com'
const PLAN_SCOPE = 'chatgpt.tokens.use.direct'
const MAX_TOKEN_LENGTH = 16_384

export type ChatGptCredentials = {
  email?: string
  issuer: typeof ISSUER
  subject: string
  client_id: string
  ext_agent_host_id: string
  id_token: string
  access_token: string
  refresh_token: string
  token_type: 'Bearer'
  expires_in: number
  scopes: string[]
  saved_at: string
}

type ObjectValue = Record<string, unknown>

function object(value: unknown, label: string): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ChatGPT ${label}`)
  }
  return value as ObjectValue
}

function bounded(value: unknown, label: string, limit: number): string {
  if (typeof value !== 'string' || !value || value.length > limit || value !== value.trim()) {
    throw new Error(`Invalid ChatGPT ${label}`)
  }
  return value
}

function decodeSegment(value: string, label: string): ObjectValue {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 16_384) {
    throw new Error(`Invalid ChatGPT ${label}`)
  }
  try {
    return object(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')), label)
  } catch {
    throw new Error(`Invalid ChatGPT ${label}`)
  }
}

function equal(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** The caller supplies a bounded, trusted OpenAI discovery JWKS snapshot. This function performs no I/O. */
function verifiedClaims(token: string, jwks: unknown): ObjectValue {
  const parts = token.split('.')
  if (parts.length !== 3 || token.length > MAX_TOKEN_LENGTH) throw new Error('Invalid ChatGPT ID token')
  const [encodedHeader, encodedClaims, signature] = parts
  const header = decodeSegment(encodedHeader, 'ID token header')
  const claims = decodeSegment(encodedClaims, 'ID token claims')
  const keyId = bounded(header.kid, 'ID token key ID', 256)
  const algorithm = header.alg
  if (algorithm !== 'RS256' && algorithm !== 'PS256' && algorithm !== 'ES256') {
    throw new Error('Unsupported ChatGPT ID token algorithm')
  }
  if (header.crit !== undefined || header.jku !== undefined || header.x5u !== undefined) {
    throw new Error('Invalid ChatGPT ID token header')
  }
  const set = object(jwks, 'key set')
  if (!Array.isArray(set.keys) || set.keys.length > 64) throw new Error('Invalid ChatGPT key set')
  const matches = set.keys.filter((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
    const key = entry as ObjectValue
    return key.kid === keyId && (key.alg === undefined || key.alg === algorithm)
  })
  if (matches.length !== 1) throw new Error('ChatGPT ID token signing key is unavailable')
  const key = object(matches[0], 'signing key')
  if (key.use !== undefined && key.use !== 'sig') throw new Error('Invalid ChatGPT signing key')
  if (key.key_ops !== undefined && (!Array.isArray(key.key_ops) || !key.key_ops.includes('verify'))) {
    throw new Error('Invalid ChatGPT signing key')
  }
  if (
    (algorithm === 'ES256' && (key.kty !== 'EC' || key.crv !== 'P-256')) ||
    (algorithm !== 'ES256' && key.kty !== 'RSA')
  ) {
    throw new Error('Invalid ChatGPT signing key')
  }
  // Only public JWK fields are accepted. Node never receives a key carrying private material.
  const publicJwk =
    algorithm === 'ES256'
      ? { kty: 'EC' as const, crv: 'P-256' as const, x: key.x as string, y: key.y as string }
      : { kty: 'RSA' as const, n: key.n as string, e: key.e as string }
  let valid = false
  try {
    const publicKey = createPublicKey({ key: publicJwk, format: 'jwk' })
    if (algorithm !== 'ES256' && (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) {
      throw new Error('weak key')
    }
    const options =
      algorithm === 'PS256'
        ? { key: publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }
        : algorithm === 'ES256'
          ? { key: publicKey, dsaEncoding: 'ieee-p1363' as const }
          : publicKey
    valid = verify(
      'sha256',
      Buffer.from(`${encodedHeader}.${encodedClaims}`),
      options,
      Buffer.from(signature, 'base64url'),
    )
  } catch {
    throw new Error('Invalid ChatGPT signing key')
  }
  if (!valid) throw new Error('Invalid ChatGPT ID token signature')
  return claims
}

export function validateChatGptTokenResponse(
  raw: unknown,
  context: {
    clientId: string
    hostId: string
    nonce: string
    jwks: unknown
    expectedSubject?: string
    now?: Date
  },
): ChatGptCredentials {
  const clientId = bounded(context.clientId, 'issued client ID', 512)
  if (clientId === 'dynamic_agent_client') throw new Error('ChatGPT client ID was not issued')
  const hostId = bounded(context.hostId, 'host ID', 256)
  const nonce = bounded(context.nonce, 'nonce', 256)
  const response = object(raw, 'token response')
  const idToken = bounded(response.id_token, 'ID token', MAX_TOKEN_LENGTH)
  const accessToken = bounded(response.access_token, 'access token', MAX_TOKEN_LENGTH)
  const refreshToken = bounded(response.refresh_token, 'refresh token', MAX_TOKEN_LENGTH)
  if (response.token_type !== 'Bearer') throw new Error('Invalid ChatGPT token type')
  const expiresIn = response.expires_in
  if (!Number.isSafeInteger(expiresIn) || (expiresIn as number) < 1 || (expiresIn as number) > 86_400) {
    throw new Error('Invalid ChatGPT token lifetime')
  }
  const rawScopes = bounded(response.scope, 'granted scopes', 4096)
  const scopes = [...new Set(rawScopes.split(' ').filter(Boolean))]
  if (!scopes.length || scopes.length > 64 || scopes.some(scope => !/^[\w.:-]{1,128}$/.test(scope))) {
    throw new Error('Invalid ChatGPT granted scopes')
  }
  const claims = verifiedClaims(idToken, context.jwks)
  const now = context.now ?? new Date()
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid ChatGPT validation time')
  const nowSeconds = now.getTime() / 1000
  if (claims.iss !== ISSUER) throw new Error('Invalid ChatGPT ID token issuer')
  if (
    claims.aud !== clientId &&
    (!Array.isArray(claims.aud) || !claims.aud.includes(clientId) || (claims.aud.length > 1 && claims.azp !== clientId))
  ) {
    throw new Error('Invalid ChatGPT ID token audience')
  }
  if (
    !Number.isSafeInteger(claims.exp) ||
    (claims.exp as number) <= nowSeconds - 5 ||
    !Number.isSafeInteger(claims.iat) ||
    (claims.iat as number) > nowSeconds + 5 ||
    (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || (claims.nbf as number) > nowSeconds + 5))
  ) {
    throw new Error('Invalid ChatGPT ID token lifetime')
  }
  if (claims.nonce !== nonce || !equal(claims.nonce, nonce)) {
    throw new Error('Invalid ChatGPT ID token nonce')
  }
  const subject = bounded(claims.sub, 'ID token subject', 512)
  if (context.expectedSubject !== undefined && !equal(subject, context.expectedSubject)) {
    throw new Error('ChatGPT account did not match the selected account')
  }
  const email =
    claims.email_verified === true &&
    typeof claims.email === 'string' &&
    claims.email.length <= 320 &&
    claims.email.trim() === claims.email &&
    claims.email
      ? claims.email
      : undefined
  return {
    ...(email ? { email } : {}),
    issuer: ISSUER,
    subject,
    client_id: clientId,
    ext_agent_host_id: hostId,
    id_token: idToken,
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'Bearer',
    expires_in: expiresIn as number,
    scopes,
    saved_at: now.toISOString(),
  }
}

/** Safe to include in a project-independent UI response; never includes tokens or opaque IDs. */
export function chatGptConnectionStatus(
  record?: ChatGptCredentials,
  now = new Date(),
): {
  state: 'disconnected' | 'connected' | 'expired' | 'plan-permission-required'
  account?: string
} {
  if (!record) return { state: 'disconnected' }
  const account = record.email ? { account: record.email } : {}
  if (!record.scopes.includes(PLAN_SCOPE)) return { state: 'plan-permission-required', ...account }
  if (new Date(record.saved_at).getTime() + record.expires_in * 1000 <= now.getTime()) {
    return { state: 'expired', ...account }
  }
  return { state: 'connected', ...account }
}
