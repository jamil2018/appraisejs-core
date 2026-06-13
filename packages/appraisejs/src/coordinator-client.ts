import path from 'node:path'

import { ensureLocalProjectIdentity } from './project-identity.js'

export type CoordinatorOptions = {
  cwd: string
  baseUrl: string
  coordinatorId: string
}

export class CoordinatorRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
    readonly code?: string,
    readonly path?: string,
    readonly recovery?: string,
    readonly details?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'CoordinatorRequestError'
  }
}

async function readResponseBody(response: Response): Promise<unknown> {
  const source = await response.text()
  if (!source) return undefined
  try {
    return JSON.parse(source) as unknown
  } catch {
    return { error: source, code: 'invalid-http-response' }
  }
}

export async function createCoordinatorClient(options: CoordinatorOptions) {
  const local = await ensureLocalProjectIdentity(path.resolve(options.cwd))
  const identity = local.identity
  const request = async (operation: string, init?: RequestInit) => {
    const endpoint = `${options.baseUrl.replace(/\/$/, '')}/api/internal/coordinator/${operation}`
    let response: Response
    try {
      response = await fetch(endpoint, {
        ...init,
        headers: {
          authorization: `Bearer ${identity.token}`,
          'content-type': 'application/json',
          'x-appraise-project': identity.projectFingerprint,
          'x-appraise-base-url': options.baseUrl.replace(/\/$/, ''),
          ...init?.headers,
        },
      })
    } catch (error) {
      throw new CoordinatorRequestError(
        `Coordinator transport failed for ${endpoint}.`,
        0,
        undefined,
        'transport-failed',
        undefined,
        'Start the local application, verify the configured endpoint, then reconnect the MCP client.',
        { endpoint, cause: error instanceof Error ? error.message : String(error) },
        { cause: error },
      )
    }
    const body = await readResponseBody(response)
    if (!response.ok) {
      const message =
        typeof body === 'object' && body && 'error' in body
          ? String((body as { error: unknown }).error)
          : response.statusText
      const envelope =
        typeof body === 'object' && body
          ? (body as { code?: unknown; path?: unknown; recovery?: unknown; details?: unknown })
          : undefined
      throw new CoordinatorRequestError(
        message,
        response.status,
        body,
        typeof envelope?.code === 'string' ? envelope.code : undefined,
        typeof envelope?.path === 'string' ? envelope.path : undefined,
        typeof envelope?.recovery === 'string' ? envelope.recovery : undefined,
        envelope?.details && typeof envelope.details === 'object'
          ? (envelope.details as Record<string, unknown>)
          : { endpoint },
      )
    }
    return body
  }

  const post = (operation: string, body: unknown) => request(operation, { method: 'POST', body: JSON.stringify(body) })

  return {
    identity,
    project: local.details,
    options: { ...options, cwd: local.details.canonicalProjectPath },
    request,
    diagnose: () => request('diagnostic'),
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
    createPlan: (plan: unknown, source?: { path: string; external: boolean; warning?: string }) =>
      post('plans', { plan, source }),
    startPlan: (planId: string) => post(`plans/${planId}/start`, {}),
    publishValidation: (planId: string, validation: unknown) =>
      post(`plans/${planId}/validations/publish`, { validation }),
    submitValidation: (planId: string) => post(`plans/${planId}/validations/submit`, {}),
    completionReview: (planId: string) => request(`plans/${planId}/completion`),
  }
}
