import { describe, expect, it, vi } from 'vitest'

import { ServiceError } from '@/services/shared/errors'

const {
  ensureTargetLocator,
  queryLocatorGraph,
  readQualityRequirementGraph,
  prepareQualityAssessmentRun,
  preflightQualityAssessmentRun,
  readRemoteEvaluationScope,
  resolveTargetProject,
  runQualityAssessment,
  searchLocatorGraph,
} = vi.hoisted(() => ({
  ensureTargetLocator: vi.fn(async (value: Record<string, unknown>) => ({
    ...value,
    targetProjectId: 'target-login',
    targetFingerprint: `sha256:${'a'.repeat(64)}`,
    outcome: 'created',
    resources: {
      module: { id: 'module-auth', outcome: 'created' },
      locatorGroup: { id: 'group-login', outcome: 'created' },
      locator: { id: 'locator-email', outcome: 'created', contentHash: `sha256:${'b'.repeat(64)}` },
    },
    selectorVerification: 'pending_runtime',
    nextRecommendedAction: 'Use locator_search to bind this target-owned locator into the validation design.',
  })),
  queryLocatorGraph: vi.fn(async () => ({
    graphHash: `sha256:${'c'.repeat(64)}`,
    nodes: [],
    edges: [],
    nextCursor: null,
  })),
  searchLocatorGraph: vi.fn(async () => ({
    qualityPlanId: 'plan-login',
    targetProjectId: 'target-login',
    graphHash: `sha256:${'d'.repeat(64)}`,
    locators: [{ persistentId: 'locator-email', name: 'Email input', route: '/login' }],
    page: { cursor: null, limit: 25, maxLimit: 100, nextCursor: null },
  })),
  readQualityRequirementGraph: vi.fn(async () => ({ qualityPlan: { targetProjectId: 'target-login' } })),
  prepareQualityAssessmentRun: vi.fn(async (value: unknown) => ({ phase: 'STARTED', received: value })),
  preflightQualityAssessmentRun: vi.fn(async (value: unknown) => ({ ready: true, received: value })),
  readRemoteEvaluationScope: vi.fn(async (value: unknown) => ({ recovered: true, received: value })),
  resolveTargetProject: vi.fn(async (fingerprint: string) => ({
    id: fingerprint === `sha256:${'f'.repeat(64)}` ? 'target-foreign' : 'target-login',
    fingerprint,
  })),
  runQualityAssessment: vi.fn(),
}))

vi.mock('@/lib/coordinator-api/request-guard', () => ({
  guardCoordinatorRequest: vi.fn(async () => undefined),
  readCoordinatorJson: async (request: Request) => request.json(),
}))
vi.mock('@/services/coordinator/locator-ensure-service', () => ({ ensureTargetLocator }))
vi.mock('@/services/target-project/target-project-service', () => ({
  resolveTargetProject,
  initializeTargetGitRepository: vi.fn(),
  listTargetProjects: vi.fn(),
  registerTargetProject: vi.fn(),
  writeTargetProjectMarker: vi.fn(),
}))
vi.mock('@/services/locator-graph/locator-graph-service', () => ({
  buildLocatorGraph: vi.fn(),
  readLocatorGraphVisualProjection: vi.fn(),
  queryLocatorGraph,
  searchLocatorGraph,
}))
vi.mock('@/services/coordinator/quality-design-service', () => ({
  answerQualityRequirementQueries: vi.fn(),
  approveQualityRequirements: vi.fn(),
  approveQualityValidationDesign: vi.fn(),
  compileQualityValidations: vi.fn(),
  createQualityAssessment: vi.fn(),
  decideQualityAssessment: vi.fn(),
  publishQualityValidations: vi.fn(),
  proposeQualityValidationDesign: vi.fn(),
  readQualityAssessment: vi.fn(),
  readQualityRequirementGraph,
  submitQualityRequirementSource: vi.fn(),
}))
vi.mock('@/services/coordinator/assessment-execution-service', () => ({
  reconcileQualityAssessment: vi.fn(),
  runQualityAssessment,
  stopQualityAssessment: vi.fn(),
}))
vi.mock('@/services/coordinator/assessment-preparation-service', () => ({
  prepareQualityAssessmentRun,
  preflightQualityAssessmentRun,
}))
vi.mock('@/services/coordinator/remote-evaluation-scope-service', () => ({
  createRemoteEvaluationScope: vi.fn(),
  readRemoteEvaluationScope,
}))

import { GET, POST } from './route'

const targetFingerprint = `sha256:${'a'.repeat(64)}`

function request(body: unknown, target = targetFingerprint) {
  return new Request('http://127.0.0.1:3000/api/internal/coordinator/locators/ensure', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(target ? { 'x-appraise-target-project': target } : {}) },
    body: JSON.stringify(body),
  })
}

const body = {
  target: targetFingerprint,
  qualityPlanId: 'plan-login',
  allowCreate: true,
  group: { mode: 'ensure', name: 'Login', route: '/login', module: { mode: 'ensure', name: 'Auth' } },
  locator: { name: 'Email input', selector: '[data-testid="email"]' },
}

describe('coordinator locator_ensure route', () => {
  it('dispatches remote scope recovery as a read-only coordinator operation without an issuance key', async () => {
    const body = {
      target: 'target-login',
      qualityPlanId: 'plan-login',
      revisionId: 'revision-login',
      subjectRevisionId: 'subject-remote-login',
      expectedScopeHash: `sha256:${'a'.repeat(64)}`,
      responseMode: 'full',
    }
    const response = await POST(request(body, ''), {
      params: Promise.resolve({ operation: ['quality', 'evaluation-subjects', 'remote-scopes', 'read'] }),
    })

    expect(response.status).toBe(200)
    expect(readRemoteEvaluationScope).toHaveBeenCalledWith(body)
    await expect(response.json()).resolves.toStrictEqual({ recovered: true, received: body })
  })

  it('forwards a compact remote preflight request without retransmitting sealed bindings', async () => {
    const preflight = {
      ready: true,
      algorithmVersion: 'appraise.quality-assessment-preflight/v2',
      preflightHash: `sha256:${'c'.repeat(64)}`,
      expectedPreflight: {
        algorithmVersion: 'appraise.quality-assessment-preflight/v2',
        preflightHash: `sha256:${'c'.repeat(64)}`,
      },
      nextRecommendedAction: 'assessment_prepare_run',
    }
    preflightQualityAssessmentRun.mockResolvedValueOnce(preflight as never)
    const body = {
      target: 'target-login',
      qualityPlanId: 'plan-login',
      revisionId: 'revision-login',
      expectedDesignHash: `sha256:${'a'.repeat(64)}`,
      environment: { environmentId: 'environment-login' },
      subject: { subjectRevisionId: 'scope-login' },
      runtime: { browserEngine: 'CHROMIUM' },
    }

    const response = await POST(request(body, ''), {
      params: Promise.resolve({ operation: ['quality', 'assessment-preflights'] }),
    })

    expect(response.status).toBe(200)
    expect(preflightQualityAssessmentRun).toHaveBeenCalledWith(body)
    await expect(response.json()).resolves.toStrictEqual(preflight)
  })

  it('forwards the exact v2 expectedPreflight token without translating a legacy hash field', async () => {
    const body = {
      target: 'target-login',
      qualityPlanId: 'plan-login',
      revisionId: 'revision-login',
      expectedDesignHash: `sha256:${'a'.repeat(64)}`,
      validationBindings: [],
      environment: { environmentId: 'environment-login' },
      subject: { subjectRevisionId: 'scope-login' },
      runtime: { browserEngine: 'CHROMIUM' },
      expectedPreflight: {
        algorithmVersion: 'appraise.quality-assessment-preflight/v2',
        preflightHash: `sha256:${'b'.repeat(64)}`,
      },
      assessmentId: 'assessment-successor-login',
      idempotencyKey: 'v2-preflight-route',
    }
    const response = await POST(request(body, ''), {
      params: Promise.resolve({ operation: ['quality', 'assessment-prepare-runs'] }),
    })

    expect(response.status).toBe(202)
    expect(prepareQualityAssessmentRun).toHaveBeenCalledWith(body)
    expect(preflightQualityAssessmentRun).not.toHaveBeenCalled()
  })

  it('returns the durable authorization handoff from a resumable preparation as a 202 response', async () => {
    const executionRequestId = '5a9fb98f-8912-44a9-b843-30fb19dd6129'
    const expectedRequestHash = `sha256:${'e'.repeat(64)}`
    prepareQualityAssessmentRun.mockResolvedValueOnce({
      preparationId: 'preparation-login',
      phase: 'ASSESSMENT',
      durableState: 'authorization_request_committed',
      authorization: {
        executionRequestId,
        expectedRequestHash,
        expiresAt: '2026-08-24T12:00:00.000Z',
        authorizationRequestCreated: true,
        nextAction: {
          tool: 'assessment_prepare_run',
          reason:
            'The credential authorization request is committed. Issue a grant, then replay the original compact preparation request with this same idempotencyKey.',
        },
      },
      retry: { classification: 'authorization_required', safe: true },
      nextRecommendedAction: 'assessment_prepare_run',
      nextRequiredAgentBehavior: 'replay_same_idempotency_key_to_resume',
    } as never)
    const body = {
      target: 'target-login',
      qualityPlanId: 'plan-login',
      revisionId: 'revision-login',
      expectedDesignHash: `sha256:${'a'.repeat(64)}`,
      environment: { environmentId: 'environment-login' },
      subject: { subjectRevisionId: 'scope-login' },
      idempotencyKey: 'credential-retry-key',
    }

    const response = await POST(request(body, ''), {
      params: Promise.resolve({ operation: ['quality', 'assessment-prepare-runs'] }),
    })

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toMatchObject({
      durableState: 'authorization_request_committed',
      authorization: { executionRequestId, expectedRequestHash, authorizationRequestCreated: true },
      retry: { classification: 'authorization_required', safe: true },
      nextRecommendedAction: 'assessment_prepare_run',
    })
  })

  it('projects a committed credential authorization request as a same-key preparation handoff', async () => {
    const requestId = '5a9fb98f-8912-44a9-b843-30fb19dd6129'
    const requestHash = 'sha256:ef9b0d0aeaaf986a80f8c2f11ebee50b1e5600b14df7074dc65efc49ebb3a063'
    prepareQualityAssessmentRun.mockRejectedValueOnce(
      new ServiceError('AUTHORIZATION_REQUIRED', 'UNAUTHORIZED', 403, {
        requestId,
        requestHash,
        expiresAt: '2026-08-24T12:00:00.000Z',
        authorization: {
          executionRequestId: requestId,
          expectedRequestHash: requestHash,
          expiresAt: '2026-08-24T12:00:00.000Z',
          authorizationRequestCreated: true,
          nextAction: {
            tool: 'assessment_prepare_run',
            reason:
              'The credential authorization request is committed. Issue a grant, then replay the original compact preparation request with this same idempotencyKey.',
          },
        },
      }),
    )
    const body = {
      target: 'target-login',
      qualityPlanId: 'plan-login',
      revisionId: 'revision-login',
      expectedDesignHash: `sha256:${'a'.repeat(64)}`,
      environment: { environmentId: 'environment-login' },
      subject: { subjectRevisionId: 'scope-login' },
      idempotencyKey: 'credential-retry-key',
    }

    const response = await POST(request(body, ''), {
      params: Promise.resolve({ operation: ['quality', 'assessment-prepare-runs'] }),
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      code: 'AUTHORIZATION_REQUIRED',
      message: 'AUTHORIZATION_REQUIRED',
      operation: { name: 'quality/assessment-prepare-runs', idempotencyKey: 'credential-retry-key' },
      operationOutcome: 'committed',
      durableState: 'authorization_request_committed',
      targetOutcome: 'not_evaluated',
      retry: {
        safe: false,
        strategy: 'read_state_then_retry',
        nextAction: { tool: 'assessment_prepare_run' },
      },
      authorization: {
        executionRequestId: requestId,
        expectedRequestHash: requestHash,
        authorizationRequestCreated: true,
      },
      details: { requestId, requestHash },
    })
  })

  it('does not publish a contradictory MCP negotiation result from the coordinator diagnostic', async () => {
    const response = await GET(
      new Request(
        `http://127.0.0.1:3000/api/internal/coordinator/diagnostic?mcpSurfaceVersion=stale&mcpContractHash=${encodeURIComponent(`sha256:${'0'.repeat(64)}`)}`,
      ),
      { params: Promise.resolve({ operation: ['diagnostic'] }) },
    )

    expect(response.status).toBe(200)
    const payload = (await response.json()) as Record<string, unknown>
    expect(payload).not.toHaveProperty('mcpContractNegotiation')
    expect(payload).toHaveProperty('coordinatorContract')
  })

  it('dispatches the exact closed-world locator ensure contract', async () => {
    const response = await POST(request(body, ''), { params: Promise.resolve({ operation: ['locators', 'ensure'] }) })

    expect(response.status).toBe(200)
    expect(ensureTargetLocator).toHaveBeenCalledWith(body, { id: 'target-login', fingerprint: targetFingerprint })
    await expect(response.json()).resolves.toMatchObject({
      targetProjectId: 'target-login',
      selectorVerification: 'pending_runtime',
    })
  })

  it('rejects a caller-supplied target project identity before the service can write', async () => {
    const response = await POST(request({ ...body, targetProjectId: 'target-foreign' }), {
      params: Promise.resolve({ operation: ['locators', 'ensure'] }),
    })

    expect(response.status).toBe(400)
    expect(ensureTargetLocator).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({ classification: 'request_invalid', code: 'VALIDATION' })
  })

  it('rejects a missing explicit target before the service can write', async () => {
    const bodyWithoutTarget = Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'target'))
    const missingTarget = new Request('http://127.0.0.1:3000/api/internal/coordinator/locators/ensure', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(bodyWithoutTarget),
    })
    const response = await POST(missingTarget, { params: Promise.resolve({ operation: ['locators', 'ensure'] }) })

    expect(response.status).toBe(400)
    expect(ensureTargetLocator).not.toHaveBeenCalled()
  })

  it('rejects Assessment execution without exact Assessment ownership at the HTTP boundary', async () => {
    const missingAssessment = await POST(request({ idempotencyKey: 'assessment-run-missing-owner' }, ''), {
      params: Promise.resolve({ operation: ['quality', 'assessment-runs'] }),
    })
    expect(missingAssessment.status).toBe(400)

    const obsoleteStandaloneSubject = await POST(
      request(
        {
          assessmentId: 'assessment-1',
          subject: { subjectDigest: `sha256:${'1'.repeat(64)}` },
          idempotencyKey: 'assessment-run-obsolete-subject',
        },
        '',
      ),
      { params: Promise.resolve({ operation: ['quality', 'assessment-runs'] }) },
    )
    expect(obsoleteStandaloneSubject.status).toBe(400)
    await expect(obsoleteStandaloneSubject.json()).resolves.toMatchObject({
      classification: 'request_invalid',
      code: 'VALIDATION',
    })
  })

  it('turns direct terminal assessment_run history into executable fresh-preparation guidance', async () => {
    runQualityAssessment.mockRejectedValueOnce(
      new ServiceError(
        'Assessment execution has terminal TestRun history; resubmit the original compact assessment preparation with a new idempotency key.',
        'CONFLICT',
        409,
        {
          code: 'assessment_execution_terminal',
          assessmentId: 'assessment-terminal',
          nextRecommendedAction: 'assessment_prepare_run',
          nextRequiredAgentBehavior: 'start_fresh_assessment_preparation_with_a_new_idempotency_key',
        },
      ),
    )
    const response = await POST(
      request({ assessmentId: 'assessment-terminal', idempotencyKey: 'terminal-run-key' }, ''),
      { params: Promise.resolve({ operation: ['quality', 'assessment-runs'] }) },
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      details: {
        code: 'assessment_execution_terminal',
        nextRecommendedAction: 'assessment_prepare_run',
        nextRequiredAgentBehavior: 'start_fresh_assessment_preparation_with_a_new_idempotency_key',
      },
      retry: {
        safe: false,
        strategy: 'do_not_retry',
        nextAction: { tool: 'assessment_prepare_run' },
      },
    })
  })

  it('keeps direct partial assessment startup on reconcile/wait guidance', async () => {
    runQualityAssessment.mockRejectedValueOnce(
      new ServiceError('Assessment execution still has active or unsealed TestRun bindings.', 'CONFLICT', 409, {
        code: 'assessment_execution_incomplete',
        assessmentId: 'assessment-partial',
        nextRecommendedAction: 'assessment_reconcile',
        nextRequiredAgentBehavior: 'wait_for_active_assessment_execution_then_reconcile',
      }),
    )
    const response = await POST(
      request({ assessmentId: 'assessment-partial', idempotencyKey: 'partial-run-key' }, ''),
      { params: Promise.resolve({ operation: ['quality', 'assessment-runs'] }) },
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      details: {
        code: 'assessment_execution_incomplete',
        nextRecommendedAction: 'assessment_reconcile',
        nextRequiredAgentBehavior: 'wait_for_active_assessment_execution_then_reconcile',
      },
      retry: {
        safe: false,
        strategy: 'read_state_then_retry',
        nextAction: { tool: 'assessment_reconcile' },
      },
    })
  })

  it('requires a Quality Plan and derives locator graph scope from its target', async () => {
    const response = await GET(
      new Request(
        `http://127.0.0.1:3000/api/internal/coordinator/locator-graph?target=${encodeURIComponent(targetFingerprint)}&qualityPlanId=plan-login&fromId=surface`,
        {},
      ),
      { params: Promise.resolve({ operation: ['locator-graph'] }) },
    )

    expect(response.status).toBe(200)
    expect(readQualityRequirementGraph).toHaveBeenCalledWith({ qualityPlanId: 'plan-login' })
    expect(queryLocatorGraph).toHaveBeenCalledWith(
      expect.objectContaining({ fromId: 'surface' }),
      undefined,
      'target-login',
    )
  })

  it('rejects a locator graph request whose explicit target differs from its plan', async () => {
    const response = await GET(
      new Request(
        `http://127.0.0.1:3000/api/internal/coordinator/locator-graph?target=${encodeURIComponent(`sha256:${'f'.repeat(64)}`)}&qualityPlanId=plan-login&fromId=surface`,
        { headers: { 'x-appraise-target-project': `sha256:${'f'.repeat(64)}` } },
      ),
      { params: Promise.resolve({ operation: ['locator-graph'] }) },
    )

    expect(response.status).toBe(404)
    expect(queryLocatorGraph).not.toHaveBeenCalled()
  })

  it('returns a clear boundary error when locator graph traversal omits fromId', async () => {
    const response = await GET(
      new Request(
        `http://127.0.0.1:3000/api/internal/coordinator/locator-graph?target=${encodeURIComponent(targetFingerprint)}&qualityPlanId=plan-login`,
      ),
      { params: Promise.resolve({ operation: ['locator-graph'] }) },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      classification: 'request_invalid',
      message: 'locator_graph_query requires a non-empty fromId.',
    })
  })

  it('searches the Quality Plan target after locator ensure without exposing foreign target results', async () => {
    const response = await GET(
      new Request(
        `http://127.0.0.1:3000/api/internal/coordinator/quality/plans/plan-login/locators?target=${encodeURIComponent(targetFingerprint)}&query=login`,
      ),
      { params: Promise.resolve({ operation: ['quality', 'plans', 'plan-login', 'locators'] }) },
    )

    expect(response.status).toBe(200)
    expect(searchLocatorGraph).toHaveBeenCalledWith(
      expect.objectContaining({ qualityPlanId: 'plan-login', query: 'login', limit: 25 }),
      undefined,
      'target-login',
    )
    await expect(response.json()).resolves.toMatchObject({
      targetProjectId: 'target-login',
      locators: [expect.objectContaining({ persistentId: 'locator-email' })],
    })
  })

  it('allows filter-only bounded operation searches and rejects empty searches', async () => {
    const filterOnly = await GET(
      new Request('http://127.0.0.1:3000/api/internal/coordinator/operations/search?category=browser&limit=3'),
      { params: Promise.resolve({ operation: ['operations', 'search'] }) },
    )
    expect(filterOnly.status).toBe(200)
    await expect(filterOnly.json()).resolves.toMatchObject({ query: null, page: { limit: 3, maxLimit: 100 } })

    const empty = await GET(new Request('http://127.0.0.1:3000/api/internal/coordinator/operations/search'), {
      params: Promise.resolve({ operation: ['operations', 'search'] }),
    })
    expect(empty.status).toBe(400)
    await expect(empty.json()).resolves.toMatchObject({
      classification: 'request_invalid',
      message: 'operation_search requires a query or at least one filter.',
    })
  })
})
