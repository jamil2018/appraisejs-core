import path from 'node:path'

import { ensureLocalProjectIdentity } from './project-identity.js'
import type {
  CustomExtensionPolicy,
  DelegatedAuthorizationReceipt,
  ValidationAstExtensionReviewResult,
  ValidationAstSubmission,
} from './phase1-contracts.js'

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

export function coordinatorRequestErrorEnvelope(error: CoordinatorRequestError) {
  return {
    code: error.code ?? 'coordinator-request-failed',
    message: error.message,
    status: error.status,
    ...(error.path ? { path: error.path } : {}),
    recovery:
      error.recovery ??
      'Run appraisejs doctor --json, then check plan status, plan events, sync-plans output, and the direct review URL.',
    ...(error.details ? { details: error.details } : {}),
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
        typeof envelope?.recovery === 'string'
          ? envelope.recovery
          : 'Run appraisejs doctor --json, then inspect plan status, plan events, sync-plans output, and the direct review URL.',
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
    diagnoseTestRun: (runId: string) =>
      request(`test-runs/${encodeURIComponent(runId)}/diagnose`, {
        headers: { 'x-appraise-target-project': local.details.projectFingerprint },
      }),
    readTestRun: (runId: string) =>
      request(`test-runs/${encodeURIComponent(runId)}`, {
        headers: { 'x-appraise-target-project': local.details.projectFingerprint },
      }),
    listActionCategories: (parentCategoryId?: string, knownCatalogHash?: string) => {
      const query = new URLSearchParams()
      if (parentCategoryId) query.set('parentCategoryId', parentCategoryId)
      if (knownCatalogHash) query.set('knownCatalogHash', knownCatalogHash)
      return request(`actions/categories?${query}`)
    },
    listActions: (input: Record<string, string | number | boolean | undefined> = {}) => {
      const query = new URLSearchParams()
      for (const [key, value] of Object.entries(input)) if (value !== undefined) query.set(key, String(value))
      return request(`actions?${query}`)
    },
    readActions: (refs: Array<{ id: string; version?: string }>) =>
      request(`actions/read?refs=${encodeURIComponent(JSON.stringify(refs))}`),
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
    addTargetProject: (projectPath: string, displayName?: string) =>
      post('target-projects', { path: projectPath, ...(displayName ? { displayName } : {}) }),
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
    previewValidationAst: (planId: string, submission: ValidationAstSubmission) =>
      post(`plans/${planId}/validations/ast/preview`, { submission }),
    compileValidationAst: (planId: string, submission: ValidationAstSubmission, expectedReceiptHash: string) =>
      post(`plans/${planId}/validations/ast/compile`, { submission, expectedReceiptHash }),
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
    submitValidationFeedback: (planId: string, feedback: unknown) =>
      post(`plans/${planId}/validations/feedback`, feedback),
    submitValidation: (planId: string, binding: { operationHash?: string; extensionArtifactHashes?: string[] } = {}) =>
      post(`plans/${planId}/validations/submit`, binding),
    startBaseline: (planId: string) => post(`plans/${planId}/baseline/start`, {}),
    reconcileBaseline: (planId: string) => post(`plans/${planId}/baseline/reconcile`, {}),
    cancelBaseline: (planId: string) => post(`plans/${planId}/baseline/cancel`, {}),
    acceptBaseline: (planId: string) => post(`plans/${planId}/baseline/accept`, {}),
    acknowledgeBaselineFailure: (planId: string, attemptId: string, acknowledgedBy: string) =>
      post(`plans/${planId}/baseline/failures/${attemptId}/acknowledge`, { acknowledgedBy }),
    justifyBaselineRegression: (planId: string, attemptId: string, justification: string) =>
      post(`plans/${planId}/baseline/regressions/${attemptId}/justify`, { justification }),
    startImplementation: (planId: string) => post(`plans/${planId}/implementation/start`, {}),
    approveImplementationGroups: (planId: string, groupIds: string[]) =>
      post(`plans/${planId}/implementation/groups`, { groupIds }),
    recordImplementationValidation: (planId: string, run: unknown) =>
      post(`plans/${planId}/implementation/validations`, { run }),
    startImplementationValidation: (planId: string, input: { validationIds?: string[]; commitHash?: string } = {}) =>
      post(`plans/${planId}/implementation/validations/start`, input),
    reconcileImplementationValidation: (
      planId: string,
      input: { runIds?: string[]; verifyTaskIds?: string[]; idempotencyKey?: string } = {},
    ) => post(`plans/${planId}/implementation/validations/reconcile`, input),
    completionReview: (planId: string) => request(`plans/${planId}/completion`),
  }
}
