import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import { ensureLocalProjectIdentity } from './project-identity.js'
import type {
  CustomExtensionPolicy,
  DelegatedAuthorizationReceipt,
  ValidationAstExtensionReviewResult,
  ValidationAstSubmission,
} from './managed-validation-contracts.js'

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
        planId: z.string().trim().min(1).max(300).optional(),
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
    diagnose: () => request('diagnostic'),
    diagnoseTestRun: async (runId: string, planId?: string) => {
      const targetProject = planId
        ? ((await request(`plans/${encodeURIComponent(planId)}`)) as { targetProjectId?: string }).targetProjectId
        : local.details.projectFingerprint
      return request(`test-runs/${encodeURIComponent(runId)}/diagnose`, {
        headers: { 'x-appraise-target-project': targetProject ?? local.details.projectFingerprint },
      })
    },
    readTestRun: async (runId: string, planId?: string) => {
      const targetProject = planId
        ? ((await request(`plans/${encodeURIComponent(planId)}`)) as { targetProjectId?: string }).targetProjectId
        : local.details.projectFingerprint
      return request(`test-runs/${encodeURIComponent(runId)}`, {
        headers: { 'x-appraise-target-project': targetProject ?? local.details.projectFingerprint },
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
    readPlan: (planId: string) => request(`plans/${planId}`),
    revisePlan: (planId: string, body: { expectedHash: string; plan: unknown }) =>
      request(`plans/${planId}`, { method: 'PUT', body: JSON.stringify(body) }),
    readEvents: (planId: string, afterSequence = 0) => request(`plans/${planId}/events?after=${afterSequence}`),
    acknowledgeEvent: (planId: string, sequence: number) =>
      post(`plans/${planId}/events/ack`, { sequence, coordinatorId: options.coordinatorId }),
    acknowledgeEventsThrough: (planId: string, acknowledgeThroughSequence: number) =>
      post(`plans/${planId}/events/ack`, { acknowledgeThroughSequence, coordinatorId: options.coordinatorId }),
    createLifecycleSnapshot: (planId: string, archiveThroughSequence?: number) =>
      post(`plans/${planId}/snapshot`, { archiveThroughSequence }),
    createContinuationPackage: (
      planId: string,
      input: { narrative: string; references?: string[]; objectiveReference?: string },
    ) => post(`plans/${planId}/continuation-package`, input),
    createObjective: (input: {
      objectiveId?: string
      title: string
      milestones: Array<{ id: string; title: string }>
      plans: Array<{ planId: string; milestoneId: string; dependsOn?: string[]; impactedPaths?: string[] }>
    }) => post('objectives', input),
    evaluateCoordinationSlo: (input: {
      phases: Array<{ phase: string; activeAppraiseMs: number; activeAgentMs: number; humanReviewMs: number }>
      responseBytes: number[]
      operations: number
      retries: number
      approvals: number
    }) => post('coordination-slo', input),
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
    createPlanForTarget: (
      plan: unknown,
      target: string,
      source?: { path: string; external: boolean; warning?: string },
    ) => post('plans', { plan, source, target }),
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
    submitDelegatedValidationAst: (submission: ValidationAstSubmission, receipt: DelegatedAuthorizationReceipt) =>
      post('delegated/validation-ast-submissions', { submission, receipt }),
    readValidationAstExtensionPolicy: (planId: string) =>
      post(`plans/${planId}/validations/ast/extension-policy`, {}) as Promise<CustomExtensionPolicy>,
    readValidationAstExtensionReviews: (planId: string, operationId?: string) =>
      post(`plans/${planId}/validations/ast/extension-reviews`, {
        operationId,
      }) as Promise<ValidationAstExtensionReviewResult>,
    checkValidationAst: (planId: string, submission: ValidationAstSubmission) =>
      post(`plans/${planId}/validations/ast/check`, { submission }),
    proposeValidationResources: (planId: string, proposal: unknown, idempotencyKey: string) =>
      post(`plans/${planId}/validations/resources/propose`, { proposal, idempotencyKey }),
    previewValidationAst: (planId: string, submission: ValidationAstSubmission) =>
      post(`plans/${planId}/validations/ast/preview`, { submission }),
    compileValidationAst: (
      planId: string,
      submission: ValidationAstSubmission,
      expectedReceiptHash: string,
      idempotencyKey: string,
    ) => post(`plans/${planId}/validations/ast/compile`, { submission, expectedReceiptHash, idempotencyKey }),
    listProviders: () => request('providers'),
    probeProvider: (providerKey: string) => post(`providers/${providerKey}/probe`, {}),
    updateProvider: (
      providerKey: string,
      input: {
        executablePath?: string | null
        defaultProfile?: string | null
        defaultModel?: string | null
        enabled?: boolean
        launchEnabled?: boolean
        settings?: Record<string, unknown> | null
      },
    ) => post(`providers/${providerKey}/update`, input),
    listProviderRuns: () => request('provider-runs'),
    readProviderRun: (runId: string) => request(`provider-runs/${runId}`),
    createProviderRun: (input: {
      targetProjectId: string
      planId?: string
      providerKey?: string
      providerProfile?: string
      launchPrompt: string
    }) => post('provider-runs', input),
    cancelProviderRun: (runId: string) => post(`provider-runs/${runId}/cancel`, {}),
    decideProviderPermission: (
      runId: string,
      input: {
        requestId: string
        decision: 'approved' | 'denied'
        riskTier: string
        requestedScope: string
        payload?: Record<string, unknown>
        reason?: string
        decidedBy: string
      },
    ) => post(`provider-runs/${runId}/permissions`, input),
    runTargetTests: (input: {
      target: string
      environmentId: string
      name?: string
      tagExpression?: string
      testWorkersCount?: number
      browserEngine?: string
      planId?: string
      validationId?: string
      implementationValidationRunId?: string
      featurePaths?: string[]
      importPaths?: string[]
      supportPaths?: string[]
      prepareWorkspace?: boolean
      expectedTestCases?: Array<{ testCaseId: string; testSuiteId?: string | null }>
    }) => post('test-runs', input),
    startPlan: (planId: string) => post(`plans/${planId}/start`, {}),
    submitValidationFeedback: (planId: string, feedback: unknown, idempotencyKey: string) =>
      post(`plans/${planId}/validations/feedback`, { ...(feedback as Record<string, unknown>), idempotencyKey }),
    submitValidation: (
      planId: string,
      binding: {
        operationHash?: string
        reviewStateHash?: string
        extensionArtifactHashes?: string[]
        idempotencyKey: string
      },
    ) => post(`plans/${planId}/validations/submit`, binding),
    reconcileValidationReview: (planId: string, idempotencyKey: string) =>
      post(`plans/${planId}/validations/reconcile`, { idempotencyKey }),
    startBaseline: (planId: string, idempotencyKey: string) =>
      post(`plans/${planId}/baseline/start`, { idempotencyKey }),
    reconcileBaseline: (planId: string, idempotencyKey: string) =>
      post(`plans/${planId}/baseline/reconcile`, { idempotencyKey }),
    cancelBaseline: (planId: string, idempotencyKey: string) =>
      post(`plans/${planId}/baseline/cancel`, { idempotencyKey }),
    acceptBaseline: (planId: string, idempotencyKey: string) =>
      post(`plans/${planId}/baseline/accept`, { idempotencyKey }),
    acknowledgeBaselineFailure: (planId: string, attemptId: string, acknowledgedBy: string, idempotencyKey: string) =>
      post(`plans/${planId}/baseline/failures/${attemptId}/acknowledge`, { acknowledgedBy, idempotencyKey }),
    justifyBaselineRegression: (planId: string, attemptId: string, justification: string, idempotencyKey: string) =>
      post(`plans/${planId}/baseline/regressions/${attemptId}/justify`, { justification, idempotencyKey }),
    startImplementation: (planId: string, idempotencyKey: string) =>
      post(`plans/${planId}/implementation/start`, { idempotencyKey }),
    approveImplementationGroups: (planId: string, groupIds: string[], idempotencyKey: string) =>
      post(`plans/${planId}/implementation/groups`, { groupIds, idempotencyKey }),
    recordImplementationValidation: (planId: string, run: unknown, idempotencyKey: string) =>
      post(`plans/${planId}/implementation/validations`, { run, idempotencyKey }),
    startImplementationValidation: (
      planId: string,
      input: { validationIds?: string[]; commitHash?: string; idempotencyKey: string },
    ) => post(`plans/${planId}/implementation/validations/start`, input),
    reconcileImplementationValidation: (
      planId: string,
      input: { runIds?: string[]; verifyTaskIds?: string[]; idempotencyKey: string },
    ) => post(`plans/${planId}/implementation/validations/reconcile`, input),
    completionReview: (planId: string) => request(`plans/${planId}/completion`),
  }
}
