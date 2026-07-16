import { createHash, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

export const DEFAULT_HTTP_MCP_BODY_LIMIT_BYTES = 1024 * 1024
export const DEFAULT_HTTP_MCP_MAX_CONCURRENCY = 16

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

export class HttpMcpRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number,
  ) {
    super(message)
    this.name = 'HttpMcpRequestError'
  }
}

function normalizedHostname(value: string) {
  return value.replace(/^\[|\]$/g, '').toLowerCase()
}

export function isLoopbackHostname(value: string) {
  return LOOPBACK_HOSTS.has(normalizedHostname(value))
}

export function assertLoopbackMcpHost(host: string) {
  if (!isLoopbackHostname(host)) {
    throw new Error(
      `Appraise 0.5 HTTP MCP is local-only. --host must be 127.0.0.1; received "${host}". Remote exposure is unsupported.`,
    )
  }
}

function hostHeaderIsAllowed(value: string | undefined, port: number) {
  if (!value) return false
  try {
    const url = new URL(`http://${value}`)
    return isLoopbackHostname(url.hostname) && (!url.port || url.port === String(port))
  } catch {
    return false
  }
}

function peerIsLoopback(remoteAddress: string | undefined) {
  if (!remoteAddress) return false
  const normalized = remoteAddress.replace(/^::ffff:/, '')
  return isLoopbackHostname(normalized)
}

function secureTokenEquals(actual: string, expected: string) {
  const actualHash = createHash('sha256').update(actual).digest()
  const expectedHash = createHash('sha256').update(expected).digest()
  return timingSafeEqual(actualHash, expectedHash)
}

function bearerToken(value: string | undefined) {
  const match = /^Bearer\s+(.+)$/i.exec(value ?? '')
  return match?.[1]
}

function originIsAllowed(value: string | undefined, allowedOrigins: ReadonlySet<string>) {
  if (!value) return true
  try {
    return allowedOrigins.has(new URL(value).origin)
  } catch {
    return false
  }
}

export function validateHttpMcpRequest(input: {
  authorization: string | undefined
  expectedToken: string
  host: string | undefined
  port: number
  origin: string | undefined
  allowedOrigins: ReadonlySet<string>
  remoteAddress: string | undefined
}) {
  validateHttpMcpLocality(input)
  const token = bearerToken(input.authorization)
  if (!token || !secureTokenEquals(token, input.expectedToken)) {
    throw new HttpMcpRequestError('Missing or invalid MCP bearer credentials.', 401, -32001)
  }
}

export function validateHttpMcpLocality(input: {
  host: string | undefined
  port: number
  origin: string | undefined
  allowedOrigins: ReadonlySet<string>
  remoteAddress: string | undefined
}) {
  if (!peerIsLoopback(input.remoteAddress)) {
    throw new HttpMcpRequestError('Non-loopback MCP peers are rejected.', 403, -32001)
  }
  if (!hostHeaderIsAllowed(input.host, input.port)) {
    throw new HttpMcpRequestError('Invalid local MCP Host header.', 403, -32001)
  }
  if (!originIsAllowed(input.origin, input.allowedOrigins)) {
    throw new HttpMcpRequestError('Disallowed MCP Origin header.', 403, -32001)
  }
}

export async function readBoundedJsonBody(
  request: IncomingMessage,
  limit = DEFAULT_HTTP_MCP_BODY_LIMIT_BYTES,
): Promise<unknown> {
  const declaredLength = Number(request.headers['content-length'] ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new HttpMcpRequestError(`MCP request body exceeds ${limit} bytes.`, 413, -32002)
  }

  const chunks: Buffer[] = []
  let received = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    received += buffer.length
    if (received > limit) throw new HttpMcpRequestError(`MCP request body exceeds ${limit} bytes.`, 413, -32002)
    chunks.push(buffer)
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new HttpMcpRequestError('Invalid JSON request body.', 400, -32700)
  }
}
