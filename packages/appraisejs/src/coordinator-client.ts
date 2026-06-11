import { createHash, randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export type CoordinatorOptions = {
  cwd: string
  baseUrl: string
  coordinatorId: string
}

type ProjectIdentity = {
  projectFingerprint: string
  token: string
}

export class CoordinatorRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message)
  }
}

async function readIdentity(cwd: string): Promise<ProjectIdentity> {
  const identityPath = path.join(cwd, '.appraisejs', 'coordinator.json')
  try {
    return JSON.parse(await fs.readFile(identityPath, 'utf8')) as ProjectIdentity
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const packageJson = JSON.parse(await fs.readFile(path.join(cwd, 'package.json'), 'utf8')) as { name?: string }
  const canonical = `${await fs.realpath(cwd)}\0${packageJson.name ?? 'appraisejs'}`
  const identity = {
    projectFingerprint: `sha256:${createHash('sha256').update(canonical).digest('hex')}`,
    token: randomBytes(32).toString('base64url'),
  }
  await fs.mkdir(path.dirname(identityPath), { recursive: true, mode: 0o700 })
  await fs.writeFile(identityPath, `${JSON.stringify(identity, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  return identity
}

export async function createCoordinatorClient(options: CoordinatorOptions) {
  const identity = await readIdentity(path.resolve(options.cwd))
  const request = async (operation: string, init?: RequestInit) => {
    const response = await fetch(`${options.baseUrl.replace(/\/$/, '')}/api/internal/coordinator/${operation}`, {
      ...init,
      headers: {
        authorization: `Bearer ${identity.token}`,
        'content-type': 'application/json',
        'x-appraise-project': identity.projectFingerprint,
        ...init?.headers,
      },
    })
    const body = (await response.json()) as unknown
    if (!response.ok) {
      const message =
        typeof body === 'object' && body && 'error' in body
          ? String((body as { error: unknown }).error)
          : response.statusText
      throw new CoordinatorRequestError(message, response.status, body)
    }
    return body
  }

  const post = (operation: string, body: unknown) => request(operation, { method: 'POST', body: JSON.stringify(body) })

  return {
    identity,
    request,
    readPlan: (planId: string) => request(`plans/${planId}`),
    revisePlan: (planId: string, body: { expectedHash: string; plan: unknown }) =>
      request(`plans/${planId}`, { method: 'PUT', body: JSON.stringify(body) }),
    readEvents: (planId: string, afterSequence = 0) => request(`plans/${planId}/events?after=${afterSequence}`),
    acknowledgeEvent: (planId: string, sequence: number) =>
      post(`plans/${planId}/events/ack`, { sequence, coordinatorId: options.coordinatorId }),
    register: (planId: string, takeoverApproved = false) =>
      post('register', {
        planId,
        coordinatorId: options.coordinatorId,
        ...(takeoverApproved ? { takeoverApproved: true } : {}),
      }),
    reconnect: async (planId: string, reconnectConnectionId: string, afterSequence = 0) => {
      const eventResult = (await request(`plans/${planId}/events?after=${afterSequence}`)) as {
        events?: Array<{ sequence: number; type: string }>
      }
      const pendingEvents = eventResult.events ?? []
      const lease = await post('register', {
        planId,
        coordinatorId: options.coordinatorId,
        reconnectConnectionId,
      })
      return {
        lease,
        pendingEvents,
        cancelled: pendingEvents.some(event => event.type === 'plan_cancelled'),
        warning: pendingEvents.length ? 'Pending events must be handled before work resumes.' : undefined,
      }
    },
    createPlan: (plan: unknown) => post('plans', { plan }),
    startPlan: (planId: string) => post(`plans/${planId}/start`, {}),
    publishValidation: (planId: string, validation: unknown) =>
      post(`plans/${planId}/validations/publish`, { validation }),
    submitValidation: (planId: string) => post(`plans/${planId}/validations/submit`, {}),
    completionReview: (planId: string) => request(`plans/${planId}/completion`),
  }
}
