import { describe, expect, it, vi } from 'vitest'

const {
  ensureTargetLocator,
  queryLocatorGraph,
  readQualityRequirementGraph,
  resolveTargetProject,
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
  resolveTargetProject: vi.fn(async (fingerprint: string) => ({
    id: fingerprint === `sha256:${'f'.repeat(64)}` ? 'target-foreign' : 'target-login',
    fingerprint,
  })),
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
