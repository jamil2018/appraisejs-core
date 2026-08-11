import { timingSafeEqual } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { deriveCoordinatorProjectIdentity } from '@/lib/coordinator-api/project-identity'
import { ServiceError } from '@/services/shared/errors'

const COORDINATOR_MAX_REQUEST_BYTES = 1_048_576

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

class CoordinatorProjectMismatchError extends Error {
  constructor(
    readonly requestedFingerprint: string,
    readonly serverFingerprint: string,
    readonly serverProjectPath: string,
  ) {
    super('Coordinator is bound to a different project.')
    this.name = 'CoordinatorProjectMismatchError'
  }
}

function assertLoopbackUrl(value: string, label: string): void {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ServiceError(`Invalid ${label}.`, 'VALIDATION')
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new ServiceError(`${label} must use a loopback host.`, 'UNAUTHORIZED')
  }
}

async function readCoordinatorToken(canonicalProjectPath: string, projectFingerprint: string): Promise<string> {
  const credentialPath = path.join(canonicalProjectPath, '.appraisejs', 'coordinator.json')
  try {
    const value = JSON.parse(await fs.readFile(credentialPath, 'utf8')) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Credential must be an object.')
    const credential = value as { projectFingerprint?: unknown; token?: unknown }
    if (
      credential.projectFingerprint !== projectFingerprint ||
      typeof credential.token !== 'string' ||
      !credential.token
    )
      throw new Error('Credential does not match this project.')
    return credential.token
  } catch {
    throw new ServiceError('Coordinator credentials are unavailable for this project.', 'UNAUTHORIZED')
  }
}

function tokensMatch(expected: string, received: string): boolean {
  const expectedBytes = Buffer.from(expected)
  const receivedBytes = Buffer.from(received)
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
}

export async function guardCoordinatorRequest(request: Request): Promise<void> {
  assertLoopbackUrl(request.url, 'request URL')
  const host = request.headers.get('host')
  if (!host) throw new ServiceError('Host header is required.', 'UNAUTHORIZED')
  assertLoopbackUrl(`http://${host}`, 'Host header')
  const origin = request.headers.get('origin')
  if (origin) assertLoopbackUrl(origin, 'Origin header')

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (!Number.isFinite(contentLength) || contentLength > COORDINATOR_MAX_REQUEST_BYTES) {
    throw new ServiceError('Request body is too large.', 'VALIDATION', 413)
  }

  const projectFingerprint = request.headers.get('x-appraise-project')
  const authorization = request.headers.get('authorization')
  if (!projectFingerprint || !authorization?.startsWith('Bearer ')) {
    throw new ServiceError('Project credentials are required.', 'UNAUTHORIZED')
  }
  const serverIdentity = await deriveCoordinatorProjectIdentity(process.cwd())
  if (serverIdentity.projectFingerprint !== projectFingerprint) {
    throw new CoordinatorProjectMismatchError(
      projectFingerprint,
      serverIdentity.projectFingerprint,
      serverIdentity.canonicalProjectPath,
    )
  }
  const token = await readCoordinatorToken(serverIdentity.canonicalProjectPath, serverIdentity.projectFingerprint)
  if (!tokensMatch(token, authorization.slice('Bearer '.length)))
    throw new ServiceError('Coordinator credentials are invalid.', 'UNAUTHORIZED')
}

export async function readCoordinatorJson(request: Request): Promise<unknown> {
  const body = await request.text()
  if (Buffer.byteLength(body) > COORDINATOR_MAX_REQUEST_BYTES) {
    throw new ServiceError('Request body is too large.', 'VALIDATION', 413)
  }
  if (!body) return {}
  try {
    return JSON.parse(body)
  } catch {
    throw new ServiceError('Request body must be valid JSON.', 'VALIDATION')
  }
}
