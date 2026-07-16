const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

export type LocalRequestBoundaryInput = {
  method: string
  host: string | null
  origin: string | null
  forwardedFor: string | null
}

export type LocalRequestBoundaryResult = { allowed: true } | { allowed: false; code: string; message: string }

function parseHost(value: string | null) {
  if (!value) return undefined
  try {
    return new URL(`http://${value}`).hostname
  } catch {
    return undefined
  }
}

function isLoopbackHost(value: string | undefined) {
  return Boolean(value && LOOPBACK_HOSTS.has(value.replace(/^\[|\]$/g, '').toLowerCase()))
}

function forwardedPeersAreLocal(value: string | null) {
  if (!value) return true
  return value.split(',').every(peer => isLoopbackHost(peer.trim()))
}

function sameOriginHost(origin: string, host: string) {
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase()
  } catch {
    return false
  }
}

export function evaluateLocalRequestBoundary(input: LocalRequestBoundaryInput): LocalRequestBoundaryResult {
  if (!isLoopbackHost(parseHost(input.host))) {
    return { allowed: false, code: 'invalid-local-host', message: 'Appraise 0.5 accepts only loopback Host values.' }
  }
  if (!forwardedPeersAreLocal(input.forwardedFor)) {
    return { allowed: false, code: 'non-local-peer', message: 'Appraise 0.5 rejects non-loopback forwarded peers.' }
  }
  if (MUTATION_METHODS.has(input.method.toUpperCase()) && input.origin && !sameOriginHost(input.origin, input.host!)) {
    return { allowed: false, code: 'cross-origin-mutation', message: 'Cross-origin mutation requests are rejected.' }
  }
  return { allowed: true }
}
