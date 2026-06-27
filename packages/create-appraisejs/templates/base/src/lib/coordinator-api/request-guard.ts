import {
  COORDINATOR_MAX_REQUEST_BYTES,
  authenticateProject,
  ensureProjectIdentity,
} from '@/services/coordinator/coordinator-service'
import { ServiceError } from '@/services/shared/errors'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export class CoordinatorProjectMismatchError extends Error {
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
  const serverIdentity = await ensureProjectIdentity()
  if (serverIdentity.projectFingerprint !== projectFingerprint) {
    throw new CoordinatorProjectMismatchError(
      projectFingerprint,
      serverIdentity.projectFingerprint,
      serverIdentity.canonicalProjectPath,
    )
  }
  await authenticateProject(projectFingerprint, authorization.slice('Bearer '.length))
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
