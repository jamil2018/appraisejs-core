import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn() }))

vi.mock('@/config/db-config', () => {
  const qualityJourney = { findMany: mocks.findMany, findFirst: mocks.findFirst }
  return {
    default: {
      qualityJourney,
      $transaction: (read: (tx: { qualityJourney: typeof qualityJourney }) => unknown) => read({ qualityJourney }),
    },
  }
})

import { getQualityJourneyStatusSnapshot, listQualityJourneys } from './quality-journey-query-service'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listQualityJourneys', () => {
  it('maps compact, UI-safe summaries from project-scoped journey records', async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: 'journey-1',
        hostingMode: 'EXTERNAL_LEGACY',
        stage: 'ANALYSIS_REVIEW',
        status: 'ACTIVE',
        activeCycleId: 'cycle-1',
        activeRevisionIdsJson: JSON.stringify({ journey: 'journey-revision-1', ignored: 12 }),
        unresolvedQuestionIdsJson: JSON.stringify(['question-1', 4]),
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-01T01:00:00.000Z'),
        revisions: [
          {
            id: 'requirement-1',
            revision: 1,
            contentHash: 'sha256:abc',
            contentJson: JSON.stringify({ objective: 'Checkout accepts cards', privateNote: 'do not expose' }),
          },
        ],
        _count: { analysisRevisions: 2 },
        blockers: [{ responsibleActor: 'HUMAN' }],
        executionConsents: [],
        coordinatorHandoffs: [
          {
            status: 'CONNECTED',
            launchedAt: new Date('2026-09-01T00:30:00.000Z'),
            connectedAt: new Date('2026-09-01T00:31:00.000Z'),
            expiresAt: new Date('2026-09-08T00:00:00.000Z'),
          },
        ],
      },
      {
        id: 'journey-2',
        stage: 'INTAKE',
        status: 'ACTIVE',
        activeCycleId: 'cycle-2',
        activeRevisionIdsJson: 'not-json',
        unresolvedQuestionIdsJson: 'not-json',
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-01T01:00:00.000Z'),
        revisions: [{ id: 'requirement-2', revision: 1, contentHash: 'sha256:def', contentJson: JSON.stringify({}) }],
        _count: { analysisRevisions: 0 },
        blockers: [],
        executionConsents: [],
        coordinatorHandoffs: [],
      },
    ])

    await expect(listQualityJourneys({ targetProjectId: 'project-1' })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'journey-1',
          activeRevisionIds: { journey: 'journey-revision-1' },
          unresolvedQuestionIds: ['question-1'],
          requirement: expect.objectContaining({ summary: 'Checkout accepts cards' }),
          handoff: expect.objectContaining({ status: 'CONNECTED' }),
          blockerResponsibleActor: 'HUMAN',
        }),
        expect.objectContaining({
          id: 'journey-2',
          activeRevisionIds: {},
          unresolvedQuestionIds: [],
          requirement: expect.objectContaining({ summary: 'Requirement snapshot unavailable' }),
        }),
      ]),
    )
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { targetProjectId: 'project-1' } }))
    expect(mocks.findMany.mock.calls[0][0].include.coordinatorHandoffs).toMatchObject({ take: 1 })
  })

  it('projects an overdue prepared handoff as expired', async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: 'journey-expired',
        hostingMode: 'EXTERNAL_LEGACY',
        stage: 'ANALYSIS',
        status: 'ACTIVE',
        activeCycleId: 'cycle-1',
        activeRevisionIdsJson: '{}',
        unresolvedQuestionIdsJson: '[]',
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-01T01:00:00.000Z'),
        revisions: [],
        _count: { analysisRevisions: 0 },
        blockers: [],
        executionConsents: [],
        coordinatorHandoffs: [
          {
            status: 'PREPARED',
            launchedAt: null,
            connectedAt: null,
            expiresAt: new Date('2020-01-01T00:00:00.000Z'),
          },
        ],
      },
    ])

    const [journey] = await listQualityJourneys({ targetProjectId: 'project-1' })
    expect(journey.handoff?.status).toBe('EXPIRED')
  })
})

describe('getQualityJourneyStatusSnapshot', () => {
  it('returns only project-scoped lifecycle observation and presentation-safe attention', async () => {
    mocks.findFirst.mockResolvedValue({
      id: 'journey-1',
      targetProjectId: 'project-1',
      hostingMode: 'EXTERNAL_LEGACY',
      stage: 'ANALYSIS_REVIEW',
      status: 'ACTIVE',
      version: 4,
      stateHash: 'sha256:state',
      activeCycleId: 'cycle-1',
      activeRevisionIdsJson: JSON.stringify({ analysis: 'analysis-r2', ignored: 3 }),
      analysisReviewHash: 'sha256:review',
      unresolvedQuestionIdsJson: JSON.stringify(['question-1', false]),
      blockers: [
        {
          id: 'blocker-1',
          reasonCode: 'QUESTION_REQUIRED',
          summary: 'Answer the payment question.',
          responsibleActor: 'USER',
          requiredResolution: 'Provide the accepted payment methods.',
        },
      ],
      workItems: [
        {
          id: 'work-1',
          role: 'REQUIREMENT_ANALYZER',
          status: 'WAITING_FOR_INPUT',
          updatedAt: new Date('2026-09-07T00:00:00.000Z'),
        },
      ],
    })

    await expect(
      getQualityJourneyStatusSnapshot({ journeyId: 'journey-1', targetProjectId: 'project-1' }),
    ).resolves.toMatchObject({
      journeyId: 'journey-1',
      closed: false,
      lifecycle: {
        activeRevisionIds: { analysis: 'analysis-r2' },
        analysisReviewHash: 'sha256:review',
        stateHash: 'sha256:state',
        version: 4,
      },
      attention: {
        unresolvedQuestionCount: 1,
        activeBlockers: [expect.objectContaining({ id: 'blocker-1', responsibleActor: 'USER' })],
        activeWork: [expect.objectContaining({ id: 'work-1', updatedAt: '2026-09-07T00:00:00.000Z' })],
      },
    })
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'journey-1', targetProjectId: 'project-1' } }),
    )
    expect(mocks.findFirst.mock.calls[0][0].select).not.toHaveProperty('targetProject')
  })

  it('fails closed when the journey does not belong to the requested project', async () => {
    mocks.findFirst.mockResolvedValue(null)
    await expect(
      getQualityJourneyStatusSnapshot({ journeyId: 'journey-1', targetProjectId: 'other-project' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  const future = new Date('2099-01-01')
  const expired = new Date('2000-01-01')
  const item = {
    id: 'work-1',
    cycleId: 'cycle-1',
    currentAttempt: 1,
    role: 'REQUIREMENT_ANALYZER',
    status: 'IN_PROGRESS',
    updatedAt: expired,
    attempts: [],
  }
  const run = {
    status: 'ACKNOWLEDGED',
    sessionId: 'session-1',
    unresolvedRetentionAt: future,
    attempt: { attempt: 1, status: 'IN_PROGRESS', leaseExpiresAt: future, workItem: item },
    intents: [{ acknowledgedAt: expired, acknowledgementDueAt: future, turnDueAt: future }],
    threadId: 'private-provider-thread',
    policyJson: 'private-provider-policy',
  }

  it.each([
    ['eligible work', { workItems: [{ ...item, status: 'ELIGIBLE' }] }, 'QUEUED'],
    ['acknowledgement pending within its window', { providerRuns: [{ ...run, status: 'UNKNOWN' }] }, 'QUEUED'],
    ['current acknowledged work', { providerRuns: [run] }, 'RUNNING'],
    ['structured input', { unresolvedQuestionIdsJson: '["question-1"]' }, 'WAITING'],
    ['canonical review', { stage: 'ANALYSIS_REVIEW' }, 'WAITING'],
    ['execution consent', { executionConsents: [{ id: 'consent-1' }] }, 'WAITING'],
    ['durable blocker', { blockers: [{ id: 'blocker-1' }] }, 'BLOCKED'],
    ['paused lifecycle', { status: 'PAUSED', providerRuns: [run] }, 'RECOVERY'],
    ['fenced session', { providerRuns: [{ ...run, sessionId: 'old-session' }] }, 'RECOVERY'],
    [
      'overdue acknowledgement',
      {
        providerRuns: [{ ...run, status: 'UNKNOWN', intents: [{ acknowledgementDueAt: expired }] }],
      },
      'RECOVERY',
    ],
    [
      'overdue acknowledged turn',
      { providerRuns: [{ ...run, intents: [{ ...run.intents[0], turnDueAt: expired }] }] },
      'RECOVERY',
    ],
    [
      'late acknowledgement with time left on the turn',
      {
        providerRuns: [{ ...run, intents: [{ ...run.intents[0], acknowledgementDueAt: expired }] }],
      },
      'RECOVERY',
    ],
    ['expired unresolved retention', { providerRuns: [{ ...run, unresolvedRetentionAt: expired }] }, 'RECOVERY'],
    [
      'reissued Analysis with an unreconciled completed predecessor',
      {
        providerRuns: [
          {
            ...run,
            attempt: { ...run.attempt, status: 'COMPLETED', workItem: { ...item, status: 'ELIGIBLE' } },
          },
        ],
      },
      'RECOVERY',
    ],
    [
      'reissued Analysis with a reconciled completed predecessor',
      {
        workItems: [
          {
            ...item,
            status: 'ELIGIBLE',
            attempts: [
              {
                attempt: 1,
                status: 'COMPLETED',
                leaseExpiresAt: expired,
                providerRun: { status: 'NONSTART_RECONCILED' },
              },
            ],
          },
        ],
      },
      'QUEUED',
    ],
    [
      'physical completion without acceptance',
      {
        workItems: [
          {
            ...item,
            attempts: [
              {
                attempt: 1,
                status: 'IN_PROGRESS',
                leaseExpiresAt: future,
                providerRun: { status: 'TERMINAL_RECONCILED' },
              },
            ],
          },
        ],
      },
      'RECOVERY',
    ],
    ['prior cycle work without active effects', { workItems: [{ ...item, cycleId: 'old-cycle' }] }, 'UNOBSERVED'],
    ['unresolved hosting ownership', { hostingMode: 'LEGACY_UNRESOLVED' }, 'RECOVERY'],
    ['external hosting', { hostingMode: 'EXTERNAL_LEGACY', providerRuns: [run] }, null],
    ['closed journey', { stage: 'CLOSED', providerRuns: [run] }, null],
  ])('projects %s as %s using scoped Appraise records', async (_case, overrides, expected) => {
    mocks.findFirst.mockResolvedValue({
      id: 'journey-1',
      targetProjectId: 'project-1',
      hostingMode: 'APP_SERVER_LOCAL_V1',
      currentCoordinatorSessionId: 'session-1',
      stage: 'ANALYSIS',
      status: 'ACTIVE',
      version: 4,
      stateHash: 'sha256:state',
      activeCycleId: 'cycle-1',
      activeRevisionIdsJson: '{}',
      unresolvedQuestionIdsJson: '[]',
      blockers: [],
      workItems: [],
      providerRuns: [],
      executionConsents: [],
      ...overrides,
    })
    const snapshot = await getQualityJourneyStatusSnapshot({ journeyId: 'journey-1', targetProjectId: 'project-1' })
    expect(snapshot.runtimeStatus).toBe(expected)
    expect(snapshot.lifecycle).toMatchObject({ version: 4, stateHash: 'sha256:state' })
    expect(JSON.stringify(snapshot)).not.toContain('private-provider')
    expect(snapshot).not.toHaveProperty('providerRuns')
    expect(mocks.findFirst.mock.calls[0][0].select.providerRuns).toMatchObject({
      where: { targetProjectId: 'project-1' },
      select: { intents: { where: { sendBoundaryId: { not: null }, reconciledAt: null } } },
    })
  })
})
