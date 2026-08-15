import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import { ensureLocalProjectIdentity } from './project-identity.js'

export type CoordinatorOptions = {
  cwd: string
  baseUrl: string
  coordinatorId: string
}

const coordinatorErrorEnvelopeSchema = z
  .object({
    schema: z.literal('appraise.error/v1'),
    errorId: z.string().trim().min(1),
    occurredAt: z.string().datetime(),
    classification: z.enum([
      'request_invalid',
      'authorization_failure',
      'resource_missing',
      'state_conflict',
      'infrastructure_failure',
      'appraise_authoring_defect',
      'appraise_runtime_defect',
    ]),
    code: z.string().trim().min(1),
    message: z.string().trim().min(1).max(1_000),
    httpStatus: z.number(),
    operation: z
      .object({
        name: z.string().trim().min(1).max(300),
        qualityPlanId: z.string().trim().min(1).max(300).optional(),
        idempotencyKey: z.string().trim().min(1).max(1_000).optional(),
      })
      .strict(),
    operationOutcome: z.enum(['not_started', 'not_committed', 'committed', 'unknown']),
    targetOutcome: z.literal('not_evaluated'),
    retry: z
      .object({
        safe: z.boolean(),
        strategy: z.enum([
          'repair_input_then_retry',
          'wait_then_retry',
          'read_state_then_retry',
          'repair_appraise_then_resume',
          'do_not_retry',
        ]),
        nextAction: z
          .object({
            tool: z.string().trim().min(1),
            arguments: z.record(z.string(), z.unknown()).optional(),
            reason: z.string().trim().min(1).max(1_000),
          })
          .strict()
          .optional(),
      })
      .strict(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

export type CoordinatorErrorEnvelope = z.infer<typeof coordinatorErrorEnvelopeSchema>

export class CoordinatorRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly envelope: CoordinatorErrorEnvelope,
    options?: ErrorOptions,
  ) {
    super(envelope.message, options)
    this.name = 'CoordinatorRequestError'
  }
}

export function coordinatorRequestError(error: CoordinatorRequestError) {
  return error.envelope
}

async function readResponseBody(response: Response): Promise<unknown> {
  const source = await response.text()
  if (!source) return undefined
  try {
    return JSON.parse(source) as unknown
  } catch (error) {
    throw new Error('Coordinator returned malformed JSON.', { cause: error })
  }
}

export function createLocalCoordinatorFailure(
  operation: string,
  classification: CoordinatorErrorEnvelope['classification'],
  message: string,
  httpStatus = 0,
) {
  return coordinatorErrorEnvelopeSchema.parse({
    schema: 'appraise.error/v1',
    errorId: randomUUID(),
    occurredAt: new Date().toISOString(),
    classification,
    code: classification,
    message,
    httpStatus,
    operation: { name: operation },
    operationOutcome: 'not_started',
    targetOutcome: 'not_evaluated',
    retry: {
      safe: classification === 'infrastructure_failure',
      strategy: classification === 'infrastructure_failure' ? 'repair_appraise_then_resume' : 'do_not_retry',
      nextAction: {
        tool: 'coordinator_error_recovery',
        reason:
          classification === 'infrastructure_failure'
            ? 'Start the local application, verify the endpoint, then reconnect the MCP client.'
            : 'Read the current state and report this error ID to the Appraise operator.',
      },
    },
    details: { source: 'client_transport' },
  })
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
        0,
        undefined,
        createLocalCoordinatorFailure(
          operation,
          'infrastructure_failure',
          `Coordinator transport failed for ${endpoint}.`,
        ),
        { cause: error },
      )
    }
    let body: unknown
    try {
      body = await readResponseBody(response)
    } catch (error) {
      throw new CoordinatorRequestError(
        response.status,
        undefined,
        createLocalCoordinatorFailure(
          operation,
          'appraise_runtime_defect',
          'Coordinator returned malformed JSON.',
          response.status,
        ),
        { cause: error },
      )
    }
    if (!response.ok) {
      const parsed = coordinatorErrorEnvelopeSchema.safeParse(body)
      const envelope = parsed.success
        ? parsed.data
        : createLocalCoordinatorFailure(
            operation,
            'appraise_runtime_defect',
            'Coordinator returned an invalid error response.',
            response.status,
          )
      throw new CoordinatorRequestError(response.status, body, envelope)
    }
    return body
  }

  const post = (operation: string, body: unknown) => request(operation, { method: 'POST', body: JSON.stringify(body) })

  return {
    identity,
    project: local.details,
    options: { ...options, cwd: local.details.canonicalProjectPath },
    request,
    diagnose: (mcpContract?: { mcpSurfaceVersion: string; mcpContractHash: string }) => {
      const query = new URLSearchParams()
      if (mcpContract) {
        query.set('mcpSurfaceVersion', mcpContract.mcpSurfaceVersion)
        query.set('mcpContractHash', mcpContract.mcpContractHash)
      }
      return request(`diagnostic${query.size ? `?${query}` : ''}`)
    },
    diagnoseTestRun: async (runId: string, targetProject: string) => {
      return request(`test-runs/${encodeURIComponent(runId)}/diagnose`, {
        headers: { 'x-appraise-target-project': targetProject },
      })
    },
    readTestRun: async (runId: string, targetProject: string) => {
      return request(`test-runs/${encodeURIComponent(runId)}`, {
        headers: { 'x-appraise-target-project': targetProject },
      })
    },
    listOperationCategories: (knownManifestHash?: string) => {
      const query = new URLSearchParams()
      if (knownManifestHash) query.set('knownManifestHash', knownManifestHash)
      return request(`operations/categories?${query}`)
    },
    searchOperations: (input: Record<string, string | number | boolean | readonly string[] | undefined>) => {
      const query = new URLSearchParams()
      for (const [key, value] of Object.entries(input))
        if (value !== undefined) query.set(key, Array.isArray(value) ? value.join(',') : String(value))
      return request(`operations/search?${query}`)
    },
    readOperations: (refs: Array<{ id: string; version?: string }>) =>
      request(`operations/read?refs=${encodeURIComponent(JSON.stringify(refs))}`),
    addTargetProject: (projectPath: string, displayName?: string, initializeGit = false) =>
      post('target-projects', {
        path: projectPath,
        ...(displayName ? { displayName } : {}),
        ...(initializeGit ? { initializeGit: true } : {}),
      }),
    listTargetProjects: () => request('target-projects'),
    queryLocatorGraph: (query: Record<string, string | number | undefined>) => {
      const parameters = new URLSearchParams()
      for (const [key, value] of Object.entries(query)) if (value !== undefined) parameters.set(key, String(value))
      return request(`locator-graph?${parameters}`)
    },
    readLocatorGraphVisual: () => request('locator-graph/visual'),
  }
}
