import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import { isLoopbackHostname } from './mcp-http-security.js'
import { ensureLocalProjectIdentity } from './project-identity.js'

export type CoordinatorOptions = {
  cwd: string
  baseUrl: string
  coordinatorId: string
}

export type TargetProjectRegistrationInput =
  { path: string; displayName?: string; initializeGit?: boolean } | { url: string; displayName?: string }

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
    durableState: z.enum(['authorization_request_committed', 'execution_consent_request_committed']).optional(),
    targetOutcome: z.literal('not_evaluated'),
    authorization: z
      .object({
        executionRequestId: z.string().uuid(),
        expectedRequestHash: z.string().startsWith('sha256:'),
        expiresAt: z.string().datetime(),
        authorizationRequestCreated: z.literal(true),
        nextAction: z
          .object({
            tool: z.literal('assessment_prepare_run'),
            reason: z.string().trim().min(1).max(1_000),
          })
          .strict(),
      })
      .strict()
      .optional(),
    executionConsent: z
      .object({
        assessmentId: z.string().trim().min(1),
        consentId: z.string().uuid(),
        expectedExecutionManifestHash: z.string().startsWith('sha256:'),
        consentRequestCreated: z.literal(true),
        nextAction: z
          .object({
            tool: z.literal('execution_consent_decide'),
            arguments: z
              .object({
                assessmentId: z.string().trim().min(1),
                consentId: z.string().uuid(),
                expectedExecutionManifestHash: z.string().startsWith('sha256:'),
              })
              .strict(),
            reason: z.string().trim().min(1).max(1_000),
          })
          .strict(),
      })
      .strict()
      .optional(),
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

type ParsedResponseBody = { body: unknown; isJson: boolean }

async function readResponseBody(response: Response): Promise<ParsedResponseBody> {
  const source = await response.text()
  if (!source) return { body: undefined, isJson: false }
  try {
    return { body: JSON.parse(source) as unknown, isJson: true }
  } catch (error) {
    throw new Error('Coordinator returned malformed JSON.', { cause: error })
  }
}

export function createLocalCoordinatorFailure(
  operation: string,
  classification: CoordinatorErrorEnvelope['classification'],
  message: string,
  httpStatus = 0,
  options?: { code?: string; recoveryReason?: string },
) {
  return coordinatorErrorEnvelopeSchema.parse({
    schema: 'appraise.error/v1',
    errorId: randomUUID(),
    occurredAt: new Date().toISOString(),
    classification,
    code: options?.code ?? classification,
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
            ? (options?.recoveryReason ??
              'Start the local application, verify the endpoint, then reconnect the MCP client.')
            : 'Read the current state and report this error ID to the Appraise operator.',
      },
    },
    details: { source: 'client_transport' },
  })
}

function coordinatorEndpointMismatch(operation: string, httpStatus: number) {
  return createLocalCoordinatorFailure(
    operation,
    'infrastructure_failure',
    'The configured coordinator endpoint is not an AppraiseJS hub.',
    httpStatus,
    {
      code: 'coordinator_endpoint_mismatch',
      recoveryReason: 'Verify --base-url points to the AppraiseJS hub, then reconnect the MCP client.',
    },
  )
}

function localCoordinatorBaseUrl(value: string): { baseUrl: string } | { message: string } {
  try {
    const parsed = new URL(value)
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      parsed.username ||
      parsed.password ||
      !isLoopbackHostname(parsed.hostname)
    ) {
      return { message: 'Coordinator --base-url must use credential-free HTTP(S) on a loopback AppraiseJS hub.' }
    }
    return { baseUrl: parsed.toString().replace(/\/$/, '') }
  } catch {
    return { message: 'Coordinator --base-url must be a valid credential-free loopback AppraiseJS hub URL.' }
  }
}

function untrustedCoordinatorEndpoint(operation: string) {
  return createLocalCoordinatorFailure(
    operation,
    'infrastructure_failure',
    'The configured coordinator endpoint is not a trusted local AppraiseJS hub.',
    0,
    {
      code: 'coordinator_endpoint_untrusted',
      recoveryReason:
        'Use a credential-free HTTP(S) loopback AppraiseJS hub URL for --base-url, then reconnect the MCP client.',
    },
  )
}

export async function createCoordinatorClient(options: CoordinatorOptions) {
  const local = await ensureLocalProjectIdentity(path.resolve(options.cwd))
  const identity = local.identity
  const request = async (operation: string, init?: RequestInit) => {
    const localBaseUrl = localCoordinatorBaseUrl(options.baseUrl)
    if (!('baseUrl' in localBaseUrl)) {
      throw new CoordinatorRequestError(0, undefined, untrustedCoordinatorEndpoint(operation), {
        cause: new Error(localBaseUrl.message),
      })
    }
    const endpoint = `${localBaseUrl.baseUrl}/api/internal/coordinator/${operation}`
    let response: Response
    try {
      response = await fetch(endpoint, {
        ...init,
        headers: {
          authorization: `Bearer ${identity.token}`,
          'content-type': 'application/json',
          'x-appraise-project': identity.projectFingerprint,
          'x-appraise-base-url': localBaseUrl.baseUrl,
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
    let responseBody: ParsedResponseBody
    try {
      responseBody = await readResponseBody(response)
    } catch (error) {
      throw new CoordinatorRequestError(
        response.status,
        undefined,
        response.status === 404 || response.status === 405
          ? coordinatorEndpointMismatch(operation, response.status)
          : createLocalCoordinatorFailure(
              operation,
              'appraise_runtime_defect',
              'Coordinator returned malformed JSON.',
              response.status,
            ),
        { cause: error },
      )
    }
    if (!response.ok) {
      if (!responseBody.isJson && (response.status === 404 || response.status === 405)) {
        throw new CoordinatorRequestError(
          response.status,
          responseBody.body,
          coordinatorEndpointMismatch(operation, response.status),
        )
      }
      const parsed = coordinatorErrorEnvelopeSchema.safeParse(responseBody.body)
      const envelope = parsed.success
        ? parsed.data
        : createLocalCoordinatorFailure(
            operation,
            'appraise_runtime_defect',
            'Coordinator returned an invalid error response.',
            response.status,
          )
      throw new CoordinatorRequestError(response.status, responseBody.body, envelope)
    }
    return responseBody.body
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
    addTargetProject: (input: TargetProjectRegistrationInput) =>
      post('target-projects', {
        ...input,
        ...(input.displayName ? { displayName: input.displayName } : {}),
        ...('path' in input && input.initializeGit ? { initializeGit: true } : {}),
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
