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
  getQualityJourneyAnalysis,
  submitQualityJourneyAnalysisSuccessor,
  answerQualityJourneyAnalysisQuestion,
  publishQualityJourneyAnalysis,
  requestQualityJourneyAnalysisRevision,
  decideQualityJourneyAnalysis,
  getQualityJourneyDiscovery,
  submitQualityJourneyTargetObservation,
  submitQualityJourneyResourceResolution,
  retryQualityJourneyDiscovery,
  revalidateQualityJourneyDiscovery,
  getQualityJourneyScenarioPortfolio,
  startQualityJourneyScenarioDesign,
  submitQualityJourneyScenarioPortfolio,
  publishQualityJourneyScenarioPortfolio,
  decideQualityJourneyScenarios,
  commentQualityJourneyScenarioPortfolio,
  disposeQualityJourneyScenarioComment,
  requestQualityJourneyScenarioRevision,
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
  getQualityJourneyAnalysis: vi.fn(async (value: unknown) => ({ received: value })),
  submitQualityJourneyAnalysisSuccessor: vi.fn(async (value: unknown) => ({ received: value })),
  answerQualityJourneyAnalysisQuestion: vi.fn(async (value: unknown) => ({ received: value })),
  publishQualityJourneyAnalysis: vi.fn(async (value: unknown) => ({ received: value })),
  requestQualityJourneyAnalysisRevision: vi.fn(async (value: unknown) => ({ received: value })),
  decideQualityJourneyAnalysis: vi.fn(async (value: unknown) => ({ received: value })),
  getQualityJourneyDiscovery: vi.fn(async (value: unknown) => ({ received: value })),
  submitQualityJourneyTargetObservation: vi.fn(async (value: unknown) => ({ received: value })),
  submitQualityJourneyResourceResolution: vi.fn(async (value: unknown) => ({ received: value })),
  retryQualityJourneyDiscovery: vi.fn(async (value: unknown) => ({ received: value })),
  revalidateQualityJourneyDiscovery: vi.fn(async (value: unknown) => ({ received: value })),
  getQualityJourneyScenarioPortfolio: vi.fn(async (value: unknown) => ({ received: value })),
  startQualityJourneyScenarioDesign: vi.fn(async (value: unknown) => ({ received: value })),
  submitQualityJourneyScenarioPortfolio: vi.fn(async (value: unknown) => ({ received: value })),
  publishQualityJourneyScenarioPortfolio: vi.fn(async (value: unknown) => ({ received: value })),
  decideQualityJourneyScenarios: vi.fn(async (value: unknown) => ({ received: value })),
  commentQualityJourneyScenarioPortfolio: vi.fn(async (value: unknown) => ({ received: value })),
  disposeQualityJourneyScenarioComment: vi.fn(async (value: unknown) => ({ received: value })),
  requestQualityJourneyScenarioRevision: vi.fn(async (value: unknown) => ({ received: value })),
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
vi.mock('@/services/coordinator/quality-journey-analysis-service', () => ({
  getQualityJourneyAnalysis,
  submitQualityJourneyAnalysisSuccessor,
  answerQualityJourneyAnalysisQuestion,
  publishQualityJourneyAnalysis,
  requestQualityJourneyAnalysisRevision,
  decideQualityJourneyAnalysis,
}))
vi.mock('@/services/coordinator/quality-journey-discovery-service', () => ({
  getQualityJourneyDiscovery,
  submitQualityJourneyTargetObservation,
  submitQualityJourneyResourceResolution,
  retryQualityJourneyDiscovery,
  revalidateQualityJourneyDiscovery,
}))
vi.mock('@/services/coordinator/quality-journey-scenario-service', () => ({
  getQualityJourneyScenarioPortfolio,
  startQualityJourneyScenarioDesign,
  submitQualityJourneyScenarioPortfolio,
  publishQualityJourneyScenarioPortfolio,
  decideQualityJourneyScenarios,
  commentQualityJourneyScenarioPortfolio,
  disposeQualityJourneyScenarioComment,
  requestQualityJourneyScenarioRevision,
}))
vi.mock('@/services/step-definition/built-in-readiness-service', () => ({
  ensureBuiltInStepDefinitionReadiness: vi.fn(async () => ({ seeded: 0, repaired: 0, unchanged: 127, errors: [] })),
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

const discoveryHash = `sha256:${'d'.repeat(64)}`

function discoveryBundleBase() {
  return {
    bundleId: 'discovery-bundle-1',
    cycleId: 'cycle-1',
    analysisRevision: {
      artifactId: 'analysis-charter-1',
      revisionId: 'analysis-revision-1',
      contentHash: discoveryHash,
    },
    analysisApproval: { artifactId: 'analysis-approval-1', contentHash: discoveryHash },
    authorizationId: 'authorization-1',
    inputHash: discoveryHash,
    assignmentScopeHash: discoveryHash,
    approvedRequirementSetHash: discoveryHash,
    inputArtifacts: [
      {
        kind: 'ANALYSIS_CHARTER_REVISION',
        artifactId: 'analysis-charter-1',
        revisionId: 'analysis-revision-1',
        contentHash: discoveryHash,
      },
      { kind: 'JOURNEY_APPROVAL', artifactId: 'analysis-approval-1', contentHash: discoveryHash },
    ],
    evidenceReceipts: [{ artifactId: 'evidence-1', contentHash: discoveryHash }],
  }
}

function targetObservationBundle() {
  return {
    ...discoveryBundleBase(),
    observedAt: '2026-09-03T12:00:00.000Z',
    targetSnapshot: {
      snapshotId: 'target-snapshot-1',
      capturedAt: '2026-09-03T12:00:00.000Z',
      contentHash: discoveryHash,
    },
    observations: [
      {
        observationId: 'observation-1',
        snapshotId: 'target-snapshot-1',
        routeId: 'route-login',
        environmentId: 'environment-login',
        fact: 'The login route accepts an email address.',
        evidenceReceiptIds: ['evidence-1'],
        confidence: 'HIGH',
        confidenceRationale: 'Observed from the assigned target snapshot.',
        stability: 'CONDITIONAL',
        stabilityRationale: 'The behavior depends on the assigned environment.',
        revalidationPolicy: { triggers: ['environment-change'] },
      },
    ],
  }
}

function resourceResolutionBundle() {
  return {
    ...discoveryBundleBase(),
    resolvedAt: '2026-09-03T12:00:00.000Z',
    destinationModuleId: 'module-1',
    approvedRequirementIds: ['REQ-1'],
    reusable: [],
    incompatible: [],
    stale: [],
    crossTarget: [],
    missing: [
      {
        requirementId: 'REQ-1',
        capabilityId: 'capability-login',
        reasonCode: 'NOT_FOUND',
        explanation: 'No reusable resource was available in the frozen scope.',
        evidenceReceiptIds: ['evidence-1'],
      },
    ],
  }
}

describe('coordinator locator_ensure route', () => {
  it('maps the exact target-bound discovery read route to its specialized service', async () => {
    const response = await GET(
      new Request(
        `http://127.0.0.1:3000/api/internal/coordinator/quality/journeys/journey-discovery/discovery?target=${encodeURIComponent(targetFingerprint)}`,
      ),
      { params: Promise.resolve({ operation: ['quality', 'journeys', 'journey-discovery', 'discovery'] }) },
    )

    expect(response.status).toBe(200)
    expect(getQualityJourneyDiscovery).toHaveBeenCalledWith({
      journeyId: 'journey-discovery',
      targetProjectId: 'target-login',
    })
  })

  it('derives Target Observation and Resource Resolution submission scope from the route and rejects forged scope', async () => {
    const submission = {
      target: targetFingerprint,
      discoveryRevisionId: 'discovery-revision-1',
      workItemId: 'scout-work-1',
      attemptId: 'scout-attempt-1',
      leaseId: 'scout-lease-1',
      ownerToken: 'scout-owner-token',
      idempotencyKey: 'scout-submit-1',
      expectedInputHash: discoveryHash,
      expectedScopeHash: discoveryHash,
      bundle: targetObservationBundle(),
    }
    const observation = await POST(request(submission, ''), {
      params: Promise.resolve({
        operation: ['quality', 'journeys', 'journey-discovery', 'discovery', 'target-observations'],
      }),
    })
    expect(observation.status).toBe(201)
    expect(submitQualityJourneyTargetObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        journeyId: 'journey-discovery',
        targetProjectId: 'target-login',
        discoveryRevisionId: 'discovery-revision-1',
        expectedInputHash: discoveryHash,
        expectedScopeHash: discoveryHash,
        bundle: expect.objectContaining({
          schemaVersion: 'appraise.quality-journey/v1',
          journeyId: 'journey-discovery',
          targetProjectId: 'target-login',
          workItemId: 'scout-work-1',
          attemptId: 'scout-attempt-1',
        }),
      }),
    )

    const resolution = await POST(
      request(
        {
          ...submission,
          workItemId: 'resource-work-1',
          attemptId: 'resource-attempt-1',
          leaseId: 'resource-lease-1',
          idempotencyKey: 'resource-submit-1',
          expectedInputHash: `sha256:${'e'.repeat(64)}`,
          expectedScopeHash: `sha256:${'f'.repeat(64)}`,
          bundle: resourceResolutionBundle(),
        },
        '',
      ),
      {
        params: Promise.resolve({
          operation: ['quality', 'journeys', 'journey-discovery', 'discovery', 'resource-resolutions'],
        }),
      },
    )
    expect(resolution.status).toBe(201)
    expect(submitQualityJourneyResourceResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        workItemId: 'resource-work-1',
        attemptId: 'resource-attempt-1',
        expectedInputHash: `sha256:${'e'.repeat(64)}`,
        expectedScopeHash: `sha256:${'f'.repeat(64)}`,
      }),
    )

    const forged = await POST(request({ ...submission, journeyId: 'forged-journey' }, ''), {
      params: Promise.resolve({
        operation: ['quality', 'journeys', 'journey-discovery', 'discovery', 'target-observations'],
      }),
    })
    expect(forged.status).toBe(400)

    const forgedBundleScope = await POST(
      request({ ...submission, bundle: { ...targetObservationBundle(), journeyId: 'forged-journey' } }, ''),
      {
        params: Promise.resolve({
          operation: ['quality', 'journeys', 'journey-discovery', 'discovery', 'target-observations'],
        }),
      },
    )
    expect(forgedBundleScope.status).toBe(400)

    const missingExpectationBody = { ...submission }
    Reflect.deleteProperty(missingExpectationBody, 'expectedInputHash')
    const missingExpectation = await POST(request(missingExpectationBody, ''), {
      params: Promise.resolve({
        operation: ['quality', 'journeys', 'journey-discovery', 'discovery', 'target-observations'],
      }),
    })
    expect(missingExpectation.status).toBe(400)
  })

  it('uses only specialized retry and revalidation operations for an active discovery revision', async () => {
    const retry = await POST(
      request(
        {
          target: targetFingerprint,
          expectedActiveDiscoveryRevisionId: 'discovery-revision-1',
          idempotencyKey: 'discovery-retry-1',
          reason: 'The frozen environment registry changed.',
        },
        '',
      ),
      { params: Promise.resolve({ operation: ['quality', 'journeys', 'journey-discovery', 'discovery', 'retries'] }) },
    )
    expect(retry.status).toBe(201)
    expect(retryQualityJourneyDiscovery).toHaveBeenCalledWith({
      journeyId: 'journey-discovery',
      targetProjectId: 'target-login',
      expectedActiveDiscoveryRevisionId: 'discovery-revision-1',
      idempotencyKey: 'discovery-retry-1',
      reason: 'The frozen environment registry changed.',
    })

    const revalidation = await POST(
      request({ target: targetFingerprint, expectedActiveDiscoveryRevisionId: 'discovery-revision-1' }, ''),
      {
        params: Promise.resolve({
          operation: ['quality', 'journeys', 'journey-discovery', 'discovery', 'revalidations'],
        }),
      },
    )
    expect(revalidation.status).toBe(200)
    expect(revalidateQualityJourneyDiscovery).toHaveBeenCalledWith({
      journeyId: 'journey-discovery',
      targetProjectId: 'target-login',
      expectedActiveDiscoveryRevisionId: 'discovery-revision-1',
    })
  })

  it('maps the exact target-bound Analysis Charter read route to its specialized service', async () => {
    const response = await GET(
      new Request(
        `http://127.0.0.1:3000/api/internal/coordinator/quality/journeys/journey-analysis/analysis?target=${encodeURIComponent(targetFingerprint)}`,
      ),
      { params: Promise.resolve({ operation: ['quality', 'journeys', 'journey-analysis', 'analysis'] }) },
    )

    expect(response.status).toBe(200)
    expect(getQualityJourneyAnalysis).toHaveBeenCalledWith({
      journeyId: 'journey-analysis',
      targetProjectId: 'target-login',
    })
  })

  it('derives submission scope from the path and target while rejecting caller-controlled scope fields', async () => {
    const charter = {
      charterId: 'analysis-charter-1',
      analysisRevisionId: 'analysis-revision-1',
      cycleId: 'cycle-1',
      requirementRevisionId: 'requirement-revision-1',
      objectives: ['Checkout'],
      scope: { included: ['Checkout'], excluded: [] },
      actors: ['Shopper'],
      requirements: [{ requirementId: 'REQ-1', statement: 'A shopper checks out.', sourceRefs: ['brief:1'] }],
      obligations: [
        {
          obligationId: 'OBL-1',
          requirementId: 'REQ-1',
          statement: 'Checkout completes.',
          acceptanceSignals: ['Confirmation'],
        },
      ],
      constraints: [],
      assumptions: [],
      risks: [],
      acceptanceSignals: ['Confirmation'],
      retiredRequirementIds: [],
      questions: [],
      resolvedQuestionAnswerIds: [],
    }
    const submission = {
      target: targetFingerprint,
      workItemId: 'work-1',
      attemptId: 'attempt-1',
      leaseId: 'lease-1',
      ownerToken: 'owner-token',
      idempotencyKey: 'submit-analysis-1',
      charter,
    }
    const response = await POST(request(submission, ''), {
      params: Promise.resolve({ operation: ['quality', 'journeys', 'journey-analysis', 'analysis', 'submissions'] }),
    })

    expect(response.status).toBe(201)
    expect(submitQualityJourneyAnalysisSuccessor).toHaveBeenCalledWith(
      expect.objectContaining({ journeyId: 'journey-analysis', targetProjectId: 'target-login' }),
    )
    expect(submitQualityJourneyAnalysisSuccessor).toHaveBeenCalledWith(
      expect.objectContaining({
        charter: expect.objectContaining({
          schemaVersion: 'appraise.quality-journey/v1',
          journeyId: 'journey-analysis',
          targetProjectId: 'target-login',
        }),
      }),
    )

    const forged = await POST(request({ ...submission, journeyId: 'journey-forged' }, ''), {
      params: Promise.resolve({ operation: ['quality', 'journeys', 'journey-analysis', 'analysis', 'submissions'] }),
    })
    expect(forged.status).toBe(400)
  })

  it('constructs user and Runner analysis commands server-side', async () => {
    const command = {
      target: targetFingerprint,
      commandId: 'analysis-command-1',
      expectedStateHash: `sha256:${'a'.repeat(64)}`,
      idempotencyKey: 'analysis-command-key',
      charterId: 'analysis-charter-1',
      analysisRevisionId: 'analysis-revision-1',
      contentHash: `sha256:${'b'.repeat(64)}`,
    }
    const publication = await POST(request(command, ''), {
      params: Promise.resolve({ operation: ['quality', 'journeys', 'journey-analysis', 'analysis', 'publications'] }),
    })
    expect(publication.status).toBe(200)
    expect(publishQualityJourneyAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'RUNNER',
        command: 'PUBLISH_ANALYSIS',
        journeyId: 'journey-analysis',
        inputArtifactRefs: [
          {
            kind: 'ANALYSIS_CHARTER_REVISION',
            artifactId: 'analysis-charter-1',
            revisionId: 'analysis-revision-1',
            contentHash: `sha256:${'b'.repeat(64)}`,
          },
        ],
      }),
    )
    const forgedPublication = await POST(
      request(
        {
          ...command,
          actor: 'USER',
          command: 'DECIDE_ANALYSIS',
          targetProjectId: 'target-forged',
        },
        '',
      ),
      {
        params: Promise.resolve({ operation: ['quality', 'journeys', 'journey-analysis', 'analysis', 'publications'] }),
      },
    )
    expect(forgedPublication.status).toBe(400)

    const decision = await POST(request(command, ''), {
      params: Promise.resolve({ operation: ['quality', 'journeys', 'journey-analysis', 'analysis', 'decisions'] }),
    })
    expect(decision.status).toBe(200)
    expect(decideQualityJourneyAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'USER', command: 'DECIDE_ANALYSIS', journeyId: 'journey-analysis' }),
    )

    const revision = await POST(
      request(
        {
          ...command,
          expectedReviewHash: `sha256:${'c'.repeat(64)}`,
          feedback: 'Clarify payment scope.',
        },
        '',
      ),
      {
        params: Promise.resolve({
          operation: ['quality', 'journeys', 'journey-analysis', 'analysis', 'revision-requests'],
        }),
      },
    )
    expect(revision.status).toBe(200)
    expect(requestQualityJourneyAnalysisRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedReviewHash: `sha256:${'c'.repeat(64)}`,
        command: expect.objectContaining({
          actor: 'USER',
          command: 'REQUEST_ANALYSIS_REVISION',
          inputArtifactRefs: [
            {
              kind: 'ANALYSIS_CHARTER_REVISION',
              artifactId: 'analysis-charter-1',
              revisionId: 'analysis-revision-1',
              contentHash: `sha256:${'b'.repeat(64)}`,
            },
          ],
        }),
      }),
    )
  })

  it('fails closed when the generic command route receives a Phase 3 analysis command', async () => {
    const command = {
      schemaVersion: 'appraise.quality-journey/v1',
      commandId: 'forged-analysis-command',
      journeyId: 'journey-analysis',
      targetProjectId: 'target-login',
      actor: 'USER',
      expectedStateHash: `sha256:${'a'.repeat(64)}`,
      idempotencyKey: 'forged-analysis-command',
      inputArtifactRefs: [],
    }
    const commands = [
      {
        ...command,
        command: 'PUBLISH_ANALYSIS',
        actor: 'RUNNER',
        payload: { artifactRevisionId: 'analysis-revision-1', artifactHash: `sha256:${'b'.repeat(64)}` },
      },
      {
        ...command,
        command: 'REQUEST_ANALYSIS_REVISION',
        payload: {
          reviewedRevisionId: 'analysis-revision-1',
          reviewedHash: `sha256:${'b'.repeat(64)}`,
          feedback: 'Forged generic request.',
        },
      },
      {
        ...command,
        command: 'DECIDE_ANALYSIS',
        payload: { revisionId: 'analysis-revision-1', contentHash: `sha256:${'b'.repeat(64)}`, decision: 'APPROVED' },
      },
    ]
    for (const specialized of commands) {
      const response = await POST(request({ target: targetFingerprint, command: specialized }, ''), {
        params: Promise.resolve({ operation: ['quality', 'journeys', 'journey-analysis', 'commands'] }),
      })
      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toMatchObject({ code: 'UNAUTHORIZED' })
    }
  })

  it('fails closed when the generic command route receives a Phase 4 discovery retry', async () => {
    const response = await POST(
      request(
        {
          target: targetFingerprint,
          command: {
            schemaVersion: 'appraise.quality-journey/v1',
            commandId: 'forged-discovery-retry',
            journeyId: 'journey-discovery',
            targetProjectId: 'target-login',
            actor: 'USER',
            command: 'RETRY_DISCOVERY',
            expectedStateHash: `sha256:${'a'.repeat(64)}`,
            idempotencyKey: 'forged-discovery-retry',
            inputArtifactRefs: [],
            payload: { blockerId: 'discovery-blocker-1', resolutionArtifactIds: ['artifact-1'] },
          },
        },
        '',
      ),
      { params: Promise.resolve({ operation: ['quality', 'journeys', 'journey-discovery', 'commands'] }) },
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('fails closed when generic work completion carries a specialized semantic role', async () => {
    for (const role of ['SCOUT', 'RESOURCE_EXPLORER', 'TEST_SCENARIO_DESIGNER']) {
      const response = await POST(
        request(
          {
            target: targetFingerprint,
            leaseId: 'lease-1',
            ownerToken: 'owner-token-1',
            result: { role },
          },
          '',
        ),
        {
          params: Promise.resolve({ operation: ['quality', 'journeys', 'journey-1', 'work', 'work-1', 'complete'] }),
        },
      )
      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toMatchObject({ code: 'UNAUTHORIZED' })
    }
  })

  it('constructs a USER answer envelope and rejects caller-provided actor authority', async () => {
    const answer = {
      target: targetFingerprint,
      idempotencyKey: 'answer-key',
      answerId: 'answer-1',
      analysisRevisionId: 'analysis-revision-1',
      questionId: 'question-1',
      answer: 'Credit card.',
    }
    const response = await POST(request(answer, ''), {
      params: Promise.resolve({ operation: ['quality', 'journeys', 'journey-analysis', 'analysis', 'answers'] }),
    })
    expect(response.status).toBe(201)
    expect(answerQualityJourneyAnalysisQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ answer: expect.objectContaining({ actor: 'USER', journeyId: 'journey-analysis' }) }),
    )

    const forged = await POST(request({ ...answer, actor: 'RUNNER' }, ''), {
      params: Promise.resolve({ operation: ['quality', 'journeys', 'journey-analysis', 'analysis', 'answers'] }),
    })
    expect(forged.status).toBe(400)
  })
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

  it('turns direct terminal assessment_run history into immutable successor guidance', async () => {
    runQualityAssessment.mockRejectedValueOnce(
      new ServiceError(
        'Assessment execution has terminal TestRun history; create an immutable successor before preparing another run.',
        'CONFLICT',
        409,
        {
          code: 'assessment_execution_terminal',
          assessmentId: 'assessment-terminal',
          nextRecommendedAction: 'assessment_create_successor',
          nextRequiredAgentBehavior: 'create_successor_then_prepare_with_a_new_idempotency_key',
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
        nextRecommendedAction: 'assessment_create_successor',
        nextRequiredAgentBehavior: 'create_successor_then_prepare_with_a_new_idempotency_key',
      },
      retry: {
        safe: false,
        strategy: 'do_not_retry',
        nextAction: { tool: 'assessment_create_successor' },
      },
    })
  })

  it('reports a newly committed execution-consent request with an explicit decision handoff', async () => {
    const consentId = '5a9fb98f-8912-44a9-b843-30fb19dd6129'
    const manifestHash = `sha256:${'e'.repeat(64)}`
    runQualityAssessment.mockRejectedValueOnce(
      new ServiceError('Explicit execution consent is required.', 'CONFLICT', 409, {
        assessmentId: 'assessment-consent',
        consentId,
        executionManifestHash: manifestHash,
        consentStatus: 'REQUESTED',
        consentRequestCreated: true,
      }),
    )

    const response = await POST(
      request({ assessmentId: 'assessment-consent', idempotencyKey: 'consent-run-key' }, ''),
      { params: Promise.resolve({ operation: ['quality', 'assessment-runs'] }) },
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      operationOutcome: 'committed',
      durableState: 'execution_consent_request_committed',
      executionConsent: {
        assessmentId: 'assessment-consent',
        consentId,
        expectedExecutionManifestHash: manifestHash,
        consentRequestCreated: true,
        nextAction: {
          tool: 'execution_consent_decide',
          arguments: {
            assessmentId: 'assessment-consent',
            consentId,
            expectedExecutionManifestHash: manifestHash,
          },
        },
      },
      retry: {
        safe: false,
        strategy: 'read_state_then_retry',
        nextAction: { tool: 'execution_consent_decide' },
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

  it('derives the exact scenario submission scope and rejects forged route authority', async () => {
    const submission = {
      target: targetFingerprint,
      workItemId: 'scenario-work-1',
      attemptId: 'scenario-attempt-1',
      leaseId: 'scenario-lease-1',
      ownerToken: 'scenario-owner',
      idempotencyKey: 'scenario-submit-1',
      expectedInputHash: `sha256:${'a'.repeat(64)}`,
      expectedScopeHash: `sha256:${'b'.repeat(64)}`,
      portfolio: {},
      result: {},
    }
    const response = await POST(request(submission, ''), {
      params: Promise.resolve({ operation: ['quality', 'journeys', 'journey-scenario', 'scenarios', 'submissions'] }),
    })
    expect(response.status).toBe(201)
    expect(submitQualityJourneyScenarioPortfolio).toHaveBeenCalledWith(
      expect.objectContaining({
        journeyId: 'journey-scenario',
        targetProjectId: 'target-login',
        expectedInputHash: submission.expectedInputHash,
        expectedScopeHash: submission.expectedScopeHash,
      }),
    )
    const forged = await POST(request({ ...submission, journeyId: 'foreign-journey' }, ''), {
      params: Promise.resolve({ operation: ['quality', 'journeys', 'journey-scenario', 'scenarios', 'submissions'] }),
    })
    expect(forged.status).toBe(400)
  })

  it('strips public target selectors before strict scenario comment and disposition services', async () => {
    const comment = await POST(
      request(
        {
          target: targetFingerprint,
          portfolioRevisionId: 'portfolio-r1',
          comment: 'Review this exact scenario.',
          blocking: true,
          idempotencyKey: 'comment-1',
          expectedReviewHash: `sha256:${'c'.repeat(64)}`,
        },
        '',
      ),
      { params: Promise.resolve({ operation: ['quality', 'journeys', 'journey-scenario', 'scenarios', 'comments'] }) },
    )
    expect(comment.status).toBe(201)
    expect(commentQualityJourneyScenarioPortfolio).toHaveBeenCalledWith(
      expect.objectContaining({ journeyId: 'journey-scenario', targetProjectId: 'target-login', actor: 'USER' }),
    )
    expect(commentQualityJourneyScenarioPortfolio).not.toHaveBeenCalledWith(
      expect.objectContaining({ target: targetFingerprint }),
    )
    const disposition = await POST(
      request(
        {
          target: targetFingerprint,
          portfolioRevisionId: 'portfolio-r1',
          commentId: 'comment-1',
          idempotencyKey: 'dispose-1',
          expectedReviewHash: `sha256:${'d'.repeat(64)}`,
        },
        '',
      ),
      {
        params: Promise.resolve({
          operation: ['quality', 'journeys', 'journey-scenario', 'scenarios', 'comment-dispositions'],
        }),
      },
    )
    expect(disposition.status).toBe(200)
    expect(disposeQualityJourneyScenarioComment).toHaveBeenCalledWith(
      expect.objectContaining({ journeyId: 'journey-scenario', targetProjectId: 'target-login', actor: 'USER' }),
    )
    expect(disposeQualityJourneyScenarioComment).not.toHaveBeenCalledWith(
      expect.objectContaining({ target: targetFingerprint }),
    )
  })

  it('parses and forwards every specialized scenario operation through its narrow route shape', async () => {
    const operation = (leaf: string) =>
      ({
        params: Promise.resolve({ operation: ['quality', 'journeys', 'journey-scenario', 'scenarios', leaf] }),
      }) as never
    const scenarioCommand = {
      target: targetFingerprint,
      commandId: 'scenario-command-1',
      expectedStateHash: `sha256:${'a'.repeat(64)}`,
      idempotencyKey: 'scenario-command-1',
      portfolioId: 'portfolio-1',
      portfolioRevisionId: 'portfolio-r1',
      portfolioHash: `sha256:${'b'.repeat(64)}`,
    }
    const start = await POST(
      request(
        {
          target: targetFingerprint,
          commandId: 'scenario-start-1',
          expectedStateHash: `sha256:${'a'.repeat(64)}`,
          idempotencyKey: 'scenario-start-1',
        },
        '',
      ),
      operation('starts'),
    )
    expect(start.status).toBe(200)
    expect(startQualityJourneyScenarioDesign).toHaveBeenCalledWith(
      expect.objectContaining({ journeyId: 'journey-scenario', targetProjectId: 'target-login', actor: 'RUNNER' }),
    )
    const publication = await POST(request(scenarioCommand, ''), operation('publications'))
    expect(publication.status).toBe(200)
    expect(publishQualityJourneyScenarioPortfolio).toHaveBeenCalledWith(
      expect.objectContaining({ journeyId: 'journey-scenario', targetProjectId: 'target-login', actor: 'RUNNER' }),
    )
    const decision = await POST(
      request(
        {
          ...scenarioCommand,
          approvedScenarioRevisionIds: ['scenario-r1'],
          rejectedScenarioRevisionIds: [],
          expectedReviewHash: `sha256:${'c'.repeat(64)}`,
        },
        '',
      ),
      operation('decisions'),
    )
    expect(decision.status).toBe(200)
    expect(decideQualityJourneyScenarios).toHaveBeenCalledWith(
      expect.objectContaining({ command: expect.objectContaining({ actor: 'USER', targetProjectId: 'target-login' }) }),
    )
    const malformedDecisionId = await POST(
      request(
        {
          ...scenarioCommand,
          approvedScenarioRevisionIds: ['scenario revision with spaces'],
          rejectedScenarioRevisionIds: [],
          expectedReviewHash: `sha256:${'c'.repeat(64)}`,
        },
        '',
      ),
      operation('decisions'),
    )
    expect(malformedDecisionId.status).toBe(400)
    const excessiveDecisionIds = await POST(
      request(
        {
          ...scenarioCommand,
          approvedScenarioRevisionIds: Array.from({ length: 513 }, (_, index) => `scenario-r${index}`),
          rejectedScenarioRevisionIds: [],
          expectedReviewHash: `sha256:${'c'.repeat(64)}`,
        },
        '',
      ),
      operation('decisions'),
    )
    expect(excessiveDecisionIds.status).toBe(400)
    expect(decideQualityJourneyScenarios).toHaveBeenCalledTimes(1)
    const revision = await POST(
      request(
        { ...scenarioCommand, feedback: 'Create a successor.', expectedReviewHash: `sha256:${'d'.repeat(64)}` },
        '',
      ),
      operation('revision-requests'),
    )
    expect(revision.status).toBe(200)
    expect(requestQualityJourneyScenarioRevision).toHaveBeenCalledWith(
      expect.objectContaining({ command: expect.objectContaining({ actor: 'USER', targetProjectId: 'target-login' }) }),
    )
    const read = await GET(
      new Request(
        `http://127.0.0.1:3000/api/internal/coordinator/quality/journeys/journey-scenario/scenarios?target=${targetFingerprint}`,
      ),
      { params: Promise.resolve({ operation: ['quality', 'journeys', 'journey-scenario', 'scenarios'] }) } as never,
    )
    expect(read.status).toBe(200)
    expect(getQualityJourneyScenarioPortfolio).toHaveBeenCalledWith({
      journeyId: 'journey-scenario',
      targetProjectId: 'target-login',
    })
  })
})
