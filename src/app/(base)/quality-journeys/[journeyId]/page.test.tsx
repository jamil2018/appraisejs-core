// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./managed-journey-progression', () => ({
  ManagedJourneyProgression: () => <span>Automatic progression</span>,
}))
const mocks = vi.hoisted(() => ({
  getAnalysis: vi.fn(),
  readStatus: vi.fn(),
  getJourney: vi.fn(),
  getScenarios: vi.fn(),
  getAutomation: vi.fn(),
  getTriage: vi.fn(),
  notFound: vi.fn(),
  project: vi.fn(),
  discoverySetup: vi.fn(),
  getDiscovery: vi.fn(),
  preparationRecovery: vi.fn(),
  designCorrection: vi.fn(),
  triageRecovery: vi.fn(),
  attempts: vi.fn(),
  discoveryCaptureStatus: vi.fn(),
  managedScoutEvidenceReview: vi.fn(),
  managedReadiness: vi.fn(),
  manualRecovery: vi.fn(),
  manualIssued: vi.fn(),
  manualChoices: vi.fn(),
  operatorTriage: vi.fn(),
}))

vi.mock('@/services/coordinator/quality-journey-query-service', () => ({
  getQualityJourneyStatusSnapshot: vi.fn(async () => null),
}))
vi.mock('./managed-journey-ownership-control', () => ({
  ManagedJourneyOwnershipControl: ({ journeyId, projectId }: { journeyId: string; projectId: string }) => (
    <p>
      Ownership controls for {journeyId} in {projectId}
    </p>
  ),
}))
vi.mock('./managed-scenario-automation-control', () => ({
  ManagedScenarioAutomationControl: ({
    role,
    correction,
  }: {
    role: string
    correction?: { detail: string } | null
  }) => (
    <p>
      Preparation controls for {role}
      {correction ? `: ${correction.detail}` : ''}
    </p>
  ),
}))
vi.mock('./managed-triage-control', () => ({
  ManagedTriageControl: () => <p>Managed triage controls</p>,
}))
vi.mock('./manual-automation-control', () => ({ ManualAutomationControl: () => <p>Manual preparation recovery</p> }))
vi.mock('./operator-triage-control', () => ({ OperatorTriageControl: () => <p>Operator report review</p> }))
vi.mock('@/services/coordinator/app-managed-automation-manual-recovery', () => ({
  getAppManagedAutomatorManualRecovery: mocks.manualRecovery,
  observePendingManualAutomationRecovery: mocks.manualIssued,
  getAppManagedManualAutomationDraftContext: mocks.manualChoices,
}))
vi.mock('@/services/coordinator/app-managed-triage-service', () => ({
  getOperatorTriageAvailable: mocks.operatorTriage,
}))
vi.mock('@/services/coordinator/app-managed-discovery-capture', () => ({
  getAppManagedAnonymousDiscoveryCaptureStatus: mocks.discoveryCaptureStatus,
}))
vi.mock('@/services/coordinator/app-managed-discovery-evidence', () => ({
  getManagedScoutEvidenceReview: mocks.managedScoutEvidenceReview,
}))
vi.mock('@/services/coordinator/app-managed-journey-readiness', () => ({
  getManagedJourneyReadinessForProvider: mocks.managedReadiness,
  managedJourneyFullyEnabled: () => true,
  managedJourneyReadinessStage: (stage: string, status?: string | null) =>
    stage === 'DISCOVERY' && status === 'COMPLETED' ? 'SCENARIO_DESIGN' : stage,
}))
vi.mock('@/services/coordinator/app-managed-triage-recovery', () => ({
  getAppManagedTriageRecovery: mocks.triageRecovery,
}))
vi.mock('@/services/coordinator/quality-journey-closure-service', () => ({
  getQualityJourneyClosure: vi.fn().mockResolvedValue({
    receipt: null,
    contentHash: null,
    reportRevisionId: null,
    reportHash: null,
    unresolvedItems: [],
    blockers: [],
  }),
}))
vi.mock('@/config/db-config', () => ({
  default: {
    environment: { findMany: vi.fn().mockResolvedValue([]) },
    qualityJourneyWorkAttempt: { findMany: mocks.attempts },
    qualityJourneyRevision: {
      findFirst: vi.fn().mockResolvedValue({ contentJson: JSON.stringify({ objective: 'Checkout accepts cards' }) }),
    },
    qualityJourneyCoordinatorHandoff: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}))
vi.mock('@/services/coordinator/quality-journey-execution-service', () => ({
  getQualityJourneyExecution: vi.fn().mockResolvedValue({ cycles: [], consents: [], proposals: [] }),
}))
vi.mock('../quality-journey-status-actions', () => ({ readQualityJourneyStatusAction: mocks.readStatus }))
vi.mock('../quality-journey-execution-actions', () => ({ qualityJourneyExecutionAction: vi.fn() }))

vi.mock('next/navigation', () => ({
  notFound: () => mocks.notFound(),
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/lib/active-project', () => ({ requireActiveProject: mocks.project }))
vi.mock('@/services/coordinator/quality-journey-discovery-service', () => ({
  getQualityJourneyDiscovery: mocks.getDiscovery,
}))
vi.mock('./managed-discovery-control', () => ({
  ManagedDiscoveryControl: ({
    journeyId,
    stateHash,
    enabled,
  }: {
    journeyId: string
    stateHash: string
    enabled: boolean
  }) => (
    <p>
      Discovery controls for {journeyId} at {stateHash} ({enabled ? 'enabled' : 'disabled'})
    </p>
  ),
}))
vi.mock('@/services/coordinator/quality-journey-discovery-prerequisites', () => ({
  getQualityJourneyDiscoveryPrerequisites: mocks.discoverySetup,
}))
vi.mock('@/services/coordinator/app-managed-scenario-automation-recovery', () => ({
  getAppManagedPreparationRecovery: mocks.preparationRecovery,
  getAppManagedScenarioDesignCorrection: mocks.designCorrection,
}))
vi.mock('@/services/coordinator/quality-journey-analysis-service', () => ({
  getQualityJourneyAnalysis: mocks.getAnalysis,
}))
vi.mock('@/services/coordinator/quality-journey-scenario-service', () => ({
  getQualityJourneyScenarioPortfolio: mocks.getScenarios,
}))
vi.mock('@/services/coordinator/quality-journey-automation-service', () => ({
  getQualityJourneyAutomationContext: mocks.getAutomation,
}))
vi.mock('@/services/coordinator/quality-journey-triage-service', () => ({
  getQualityJourneyTriage: mocks.getTriage,
}))
vi.mock('@/services/coordinator/quality-journey-service', () => ({ getQualityJourney: mocks.getJourney }))
vi.mock('../quality-journey-actions', () => ({
  answerQualityJourneyAnalysisQuestionAction: vi.fn(),
  approveQualityJourneyAnalysisAction: vi.fn(),
  requestQualityJourneyAnalysisRevisionAction: vi.fn(),
}))

import QualityJourneyDetailPage from './page'
import { ServiceError } from '@/services/shared/errors'

const project = { id: 'project-1', displayName: 'Storefront' }
const digest = (character: string) => `sha256:${character.repeat(64)}`

const journey = (overrides: Record<string, unknown> = {}) => ({
  journey: {
    journeyId: 'journey-1',
    stage: 'ANALYSIS_REVIEW',
    hostingMode: 'APP_SERVER_LOCAL_V1',
    version: 1,
    stateHash: digest('a'),
    activeRevisionIds: {},
    analysisReviewHash: digest('b'),
    unresolvedQuestionIds: ['payment-method'],
    ...overrides,
  },
  runner: [{ role: 'REQUIREMENT_ANALYZER', stage: 'ANALYSIS_REVIEW', state: 'RUNNABLE', workItemId: 'work-1' }],
  workItems: [],
  blockers: [],
  events: [],
})

function analysisRevision({
  id,
  revision,
  publication,
  questionId,
}: {
  id: string
  revision: number
  publication: { reviewHash: string; publishedAt: Date } | null
  questionId: string
}) {
  return {
    id: `row-${id}`,
    artifactId: `artifact-${id}`,
    artifactRevisionId: id,
    revision,
    contentHash: digest(String(revision)),
    artifact: {
      artifactJson: JSON.stringify({
        objectives: [`Objective ${revision}`],
        scope: { included: ['Checkout'], excluded: [] },
        requirements: [],
        obligations: [],
        constraints: [],
        assumptions: [],
        risks: [],
        acceptanceSignals: [],
      }),
    },
    questions: [
      {
        id: `question-row-${revision}`,
        questionId,
        required: true,
        artifact: {
          artifactJson: JSON.stringify({ prompt: `Question for revision ${revision}`, rationale: 'Coverage.' }),
        },
        answers: [],
      },
    ],
    publication,
    decision: null,
  }
}

async function renderPage() {
  return render(
    await QualityJourneyDetailPage({
      params: Promise.resolve({ journeyId: 'journey-1' }),
      searchParams: Promise.resolve({ project: 'project-1' }),
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.discoveryCaptureStatus.mockResolvedValue('MANUAL_REQUIRED')
  mocks.managedScoutEvidenceReview.mockResolvedValue(null)
  const readiness = {
    CODEX: { provider: 'CODEX', ready: true, state: 'ready', reason: null, actionLabel: null, settingsHref: '' },
    CLAUDE_CODE: {
      provider: 'CLAUDE_CODE',
      ready: true,
      state: 'ready',
      reason: null,
      actionLabel: null,
      settingsHref: '',
    },
  }
  mocks.managedReadiness.mockImplementation((_: unknown, provider: 'CODEX' | 'CLAUDE_CODE') =>
    Promise.resolve(readiness[provider]),
  )
  mocks.readStatus.mockResolvedValue(null)
  mocks.project.mockResolvedValue(project)
  mocks.discoverySetup.mockResolvedValue({ ready: true, missing: [] })
  mocks.preparationRecovery.mockResolvedValue(null)
  mocks.designCorrection.mockResolvedValue(null)
  mocks.triageRecovery.mockResolvedValue(null)
  mocks.manualRecovery.mockResolvedValue(null)
  mocks.manualIssued.mockResolvedValue(null)
  mocks.manualChoices.mockResolvedValue(null)
  mocks.operatorTriage.mockResolvedValue(false)
  mocks.attempts.mockResolvedValue([])
  mocks.getDiscovery.mockResolvedValue({ revisions: [], activeDiscoveryRevisionId: null })
  mocks.getJourney.mockResolvedValue(journey())
  mocks.getAnalysis.mockResolvedValue({ revisions: [] })
  mocks.getScenarios.mockResolvedValue({ portfolio: null })
  mocks.getAutomation.mockResolvedValue(null)
  mocks.getTriage.mockResolvedValue({ assignments: [], reports: [], activeReportRevisionId: null })
})

describe('QualityJourneyDetailPage', () => {
  it('shows only eligible manual preparation and operator report controls', async () => {
    mocks.getJourney.mockResolvedValue(journey({ stage: 'AUTOMATION', status: 'ACTIVE', unresolvedQuestionIds: [] }))
    mocks.manualIssued.mockResolvedValue({ eventId: 'manual-recovery' })
    mocks.manualChoices.mockResolvedValue({ choices: { bindings: [] } })
    const view = await renderPage()
    expect(screen.getByText('Manual preparation recovery')).toBeVisible()
    expect(mocks.manualIssued).toHaveBeenCalledWith({ journeyId: 'journey-1', targetProjectId: 'project-1' })
    expect(mocks.manualChoices).toHaveBeenCalledWith({ journeyId: 'journey-1', targetProjectId: 'project-1' })
    view.unmount()
    mocks.getJourney.mockResolvedValue(journey({ stage: 'TRIAGE', status: 'ACTIVE', unresolvedQuestionIds: [] }))
    mocks.operatorTriage.mockResolvedValue(true)
    await renderPage()
    expect(screen.getByText('Operator report review')).toBeVisible()
    expect(mocks.operatorTriage).toHaveBeenCalledWith({ journeyId: 'journey-1', targetProjectId: 'project-1' })
  })
  it('renders the Automation stage without loading draft choices when no manual recovery exists', async () => {
    mocks.getJourney.mockResolvedValue(journey({ stage: 'AUTOMATION', status: 'ACTIVE', unresolvedQuestionIds: [] }))

    await renderPage()

    expect(screen.getByRole('list', { name: 'Journey stages' })).toBeVisible()
    expect(screen.queryByText('Manual preparation recovery')).not.toBeInTheDocument()
    expect(mocks.manualChoices).not.toHaveBeenCalled()
  })
  it('does not offer a fresh role launch after its current dispatch is consumed without a retained recovery', async () => {
    mocks.getJourney.mockResolvedValue({
      ...journey({ stage: 'AUTOMATION', status: 'ACTIVE', activeCycleId: 'cycle', activeWorkItemIds: ['work-auto'] }),
      workItems: [{ id: 'work-auto', cycleId: 'cycle', role: 'AUTOMATOR', currentAttempt: 1, status: 'IN_PROGRESS' }],
    })
    mocks.attempts.mockResolvedValue([
      {
        id: 'attempt-auto',
        workItemId: 'work-auto',
        attempt: 1,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        completedAt: null,
        dispatchAdapterId: 'APP_SERVER_LOCAL_V1_PREPARATION_AUTOMATOR',
      },
    ])
    await renderPage()
    expect(screen.queryByText('Preparation controls for AUTOMATOR')).not.toBeInTheDocument()
  })

  it('offers a distinct correction assignment for the consumed Designer with its exact rejection detail', async () => {
    mocks.getJourney.mockResolvedValue({
      ...journey({
        stage: 'SCENARIO_DESIGN',
        status: 'ACTIVE',
        activeCycleId: 'cycle',
        activeWorkItemIds: ['work-designer'],
      }),
      workItems: [
        {
          id: 'work-designer',
          cycleId: 'cycle',
          role: 'TEST_SCENARIO_DESIGNER',
          currentAttempt: 1,
          status: 'IN_PROGRESS',
        },
      ],
    })
    mocks.attempts.mockResolvedValue([
      {
        id: 'original',
        startedAt: new Date(),
        completedAt: null,
        workItemId: 'work-designer',
        attempt: 1,
        status: 'IN_PROGRESS',
        dispatchAdapterId: 'APP_SERVER_LOCAL_V1_PREPARATION_TEST_SCENARIO_DESIGNER',
      },
    ])
    mocks.designCorrection.mockResolvedValue({
      attemptId: 'original',
      failureHash: digest('f'),
      detail: 'arguments.portfolio.scenarios.3.enrichment.observationIds (too_small)',
    })
    await renderPage()
    expect(
      screen.getByText(/Preparation controls for TEST_SCENARIO_DESIGNER: arguments.portfolio.scenarios.3/),
    ).toBeInTheDocument()
    expect(mocks.designCorrection).toHaveBeenCalledWith({ journeyId: 'journey-1', targetProjectId: 'project-1' })
  })

  it('offers retained Designer recovery during scenario review in the exact Journey project', async () => {
    mocks.getJourney.mockResolvedValue(journey({ stage: 'SCENARIO_REVIEW', status: 'ACTIVE' }))
    mocks.preparationRecovery.mockResolvedValue({
      attemptId: 'attempt',
      candidateHash: digest('c'),
      detail: 'Retained proposal',
    })
    await renderPage()
    expect(screen.getByText('Preparation controls for TEST_SCENARIO_DESIGNER')).toBeInTheDocument()
    expect(mocks.preparationRecovery).toHaveBeenCalledWith({
      journeyId: 'journey-1',
      targetProjectId: 'project-1',
      role: 'TEST_SCENARIO_DESIGNER',
    })
  })

  it.each(['TRIAGE', 'SCENARIO_DESIGN', 'AUTOMATION', 'DISCOVERY'])(
    'continues active %s inside Appraise',
    async stage => {
      mocks.getJourney.mockResolvedValue(journey({ stage, status: 'ACTIVE', unresolvedQuestionIds: [] }))
      await renderPage()
      expect(screen.getByText('Automatic progression')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled()
      expect(screen.queryByText(/Preparation controls for|Managed triage controls/)).not.toBeInTheDocument()
    },
  )
  it('restores the managed inspected-page review from durable Journey state', async () => {
    mocks.getJourney.mockResolvedValue(journey({ stage: 'DISCOVERY', status: 'ACTIVE', unresolvedQuestionIds: [] }))
    mocks.getDiscovery.mockResolvedValue({
      activeDiscoveryRevisionId: 'discovery-1',
      revisions: [
        {
          id: 'discovery-1',
          scoutWorkItemId: 'scout-1',
          scoutScopeJson: JSON.stringify({ environmentIds: ['environment-1'], routes: ['/account', '/checkout'] }),
        },
      ],
    })
    mocks.managedScoutEvidenceReview.mockResolvedValue({
      discoveryRevisionId: 'discovery-1',
      pages: [{ artifactId: 'receipt-1', routeId: '/account', environmentId: 'environment-1' }],
      reviewHash: `sha256:${'a'.repeat(64)}`,
    })

    await renderPage()

    expect(mocks.managedScoutEvidenceReview).toHaveBeenCalledWith({
      journeyId: 'journey-1',
      targetProjectId: 'project-1',
    })
    expect(screen.getByRole('region', { name: 'Inspected pages review' })).toHaveTextContent('/account')
    expect(screen.getByRole('button', { name: 'Continue with inspected pages' })).toBeEnabled()
  })
  it('offers exact retained report recovery inside Appraise', async () => {
    mocks.getJourney.mockResolvedValue(journey({ stage: 'TRIAGE', status: 'ACTIVE', unresolvedQuestionIds: [] }))
    mocks.triageRecovery.mockResolvedValue({ attemptId: 'triage-attempt', candidateHash: digest('c') })
    await renderPage()
    expect(screen.getByText('Managed triage controls')).toBeInTheDocument()
    expect(mocks.triageRecovery).toHaveBeenCalledWith({ journeyId: 'journey-1', targetProjectId: 'project-1' })
  })
  it('distinguishes an unavailable report proposal from ordinary waiting', async () => {
    mocks.getJourney.mockResolvedValue({
      ...journey({
        stage: 'TRIAGE',
        status: 'ACTIVE',
        activeCycleId: 'cycle-1',
        activeWorkItemIds: ['triage-work'],
        unresolvedQuestionIds: [],
      }),
      workItems: [{ id: 'triage-work', role: 'TRIAGER', status: 'IN_PROGRESS', cycleId: 'cycle-1', currentAttempt: 1 }],
    })
    mocks.attempts.mockResolvedValue([
      {
        workItemId: 'triage-work',
        attempt: 1,
        dispatchAdapterId: 'APP_SERVER_LOCAL_V1_TRIAGE',
        failureJson: '{"stage":"CANONICAL_SUBMISSION"}',
      },
    ])
    await renderPage()
    expect(screen.getByText('The recorded outcomes and evidence are available under Test results.')).toBeInTheDocument()
    expect(screen.queryByText('Managed triage controls')).not.toBeInTheDocument()
  })
  it('hides the old Scout recovery action while fresh discovery is underway', async () => {
    mocks.getJourney.mockResolvedValue({
      ...journey({ stage: 'DISCOVERY', status: 'ACTIVE', activeCycleId: 'cycle-1', unresolvedQuestionIds: [] }),
      workItems: [{ id: 'old-scout', role: 'SCOUT', status: 'SUPERSEDED', cycleId: 'cycle-1', currentAttempt: 1 }],
    })
    mocks.attempts.mockResolvedValue([
      {
        workItemId: 'old-scout',
        attempt: 1,
        dispatchAdapterId: 'APP_SERVER_LOCAL_V1_DISCOVERY_SCOUT',
        failureJson: '{"stage":"NATIVE_SEND"}',
      },
    ])
    await renderPage()
    expect(screen.queryByText(/Discovery controls for/)).not.toBeInTheDocument()
  })
  it('suspends work and offers one-click resume', async () => {
    mocks.getJourney.mockResolvedValue(journey({ stage: 'DISCOVERY', status: 'PAUSED', unresolvedQuestionIds: [] }))
    await renderPage()
    expect(screen.getByRole('button', { name: 'Resume' })).toBeEnabled()
    expect(screen.queryByText('Automatic progression')).not.toBeInTheDocument()
  })
  it('shows missing Discovery setup in the Journey project before Analysis approval', async () => {
    mocks.discoverySetup.mockResolvedValue({ ready: false, missing: ['module', 'locator-group'] })
    mocks.getAnalysis.mockResolvedValue({
      revisions: [
        {
          ...analysisRevision({
            id: 'analysis-1',
            revision: 1,
            publication: { reviewHash: digest('b'), publishedAt: new Date() },
            questionId: 'payment-method',
          }),
          questions: [],
        },
      ],
    })
    mocks.getJourney.mockResolvedValue(
      journey({ activeRevisionIds: { analysis: 'analysis-1' }, unresolvedQuestionIds: [] }),
    )
    await renderPage()
    expect(mocks.discoverySetup).toHaveBeenCalledWith('project-1')
    expect(screen.getByText('Set up Discovery before approval')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create module' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create environment' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve criteria' })).toBeDisabled()
  })

  it('renders the active project-scoped Journey and blocks approval while required answers remain open', async () => {
    await renderPage()

    expect(screen.getByRole('heading', { name: 'Checkout accepts cards' })).toBeVisible()
    expect(screen.getByRole('list', { name: 'Journey stages' })).toHaveTextContent(
      'RequirementsScenariosTest runResults',
    )
    expect(screen.queryByText('Operational control')).not.toBeInTheDocument()
    expect(screen.queryByText('Open required questions')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Discuss in chat' })).toHaveAttribute(
      'href',
      '/conversations/new?kind=quality-journey&record=journey-1&project=project-1',
    )
    expect(mocks.getJourney).toHaveBeenCalledWith({ journeyId: 'journey-1', targetProjectId: 'project-1' })
  })

  it('shows no pending decision once there are no open questions outside the review state', async () => {
    mocks.getJourney.mockResolvedValue(journey({ stage: 'INTAKE', unresolvedQuestionIds: [] }))

    await renderPage()

    expect(screen.queryByText('Ready to review acceptance criteria')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve criteria' })).not.toBeInTheDocument()
  })

  it('keeps the report review in the main work area', async () => {
    mocks.getJourney.mockResolvedValue(journey({ stage: 'REPORT_REVIEW', unresolvedQuestionIds: [] }))
    await renderPage()
    expect(
      within(screen.getByRole('region', { name: 'Current journey focus' })).getByText('Ready to review results'),
    ).toBeVisible()
  })

  it('projects prepared automation without implying a TestRun exists', async () => {
    mocks.getScenarios.mockResolvedValue({ portfolio: { approvedIntentHash: digest('b'), scenarios: [] } })
    mocks.getJourney.mockResolvedValue(journey({ stage: 'AUTOMATION', unresolvedQuestionIds: [] }))
    mocks.getAutomation.mockResolvedValue({
      inputHash: digest('z'),
      inputHashes: [digest('z')],
      scopeHash: digest('y'),
      portfolioRevisionId: 'portfolio-r1',
      scenarioRevisionIds: ['scenario-r1'],
      materializations: [
        {
          scenarioRevisionId: 'scenario-r1',
          status: 'MATERIALIZED',
          suiteId: 'suite-1',
          testCaseId: 'case-1',
          preparedCapsule: { id: 'prepared-1', status: 'PREPARED' },
        },
      ],
    })

    await renderPage()

    expect(screen.getByText('1 of 1 approved scenarios ready to run.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /open live run/i })).not.toBeInTheDocument()
    expect(mocks.getAutomation).toHaveBeenCalledWith({ journeyId: 'journey-1', targetProjectId: 'project-1' })
  })

  it('selects the latest unpublished successor during analysis so Q&A can continue after a revision request', async () => {
    const user = userEvent.setup()
    mocks.getJourney.mockResolvedValue(
      journey({
        stage: 'ANALYSIS',
        activeRevisionIds: { analysis: 'analysis-revision-1' },
        analysisReviewHash: digest('d'),
        unresolvedQuestionIds: ['question-successor'],
      }),
    )
    mocks.getAnalysis.mockResolvedValue({
      revisions: [
        analysisRevision({
          id: 'analysis-revision-1',
          revision: 1,
          publication: { reviewHash: digest('b'), publishedAt: new Date('2026-09-01T00:00:00.000Z') },
          questionId: 'question-predecessor',
        }),
        analysisRevision({
          id: 'analysis-revision-2',
          revision: 2,
          publication: null,
          questionId: 'question-successor',
        }),
      ],
    })

    await renderPage()

    const focus = within(screen.getByRole('region', { name: 'Current journey focus' }))
    expect(focus.getByRole('heading', { name: 'Question for revision 2' })).toBeInTheDocument()
    expect(focus.queryByText('How to connect the agent')).not.toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: /Your answer/ }), 'Wallet payment.')
    expect(screen.getByRole('button', { name: 'Record answer' })).toBeEnabled()
  })

  it('keeps the published predecessor contextual but not answerable while a requested successor is still absent', async () => {
    mocks.getJourney.mockResolvedValue(
      journey({
        stage: 'ANALYSIS',
        activeRevisionIds: { analysis: 'analysis-revision-1' },
        analysisReviewHash: digest('d'),
        unresolvedQuestionIds: ['question-predecessor'],
      }),
    )
    mocks.getAnalysis.mockResolvedValue({
      revisions: [
        analysisRevision({
          id: 'analysis-revision-1',
          revision: 1,
          publication: { reviewHash: digest('b'), publishedAt: new Date('2026-09-01T00:00:00.000Z') },
          questionId: 'question-predecessor',
        }),
      ],
    })

    await renderPage()

    expect(screen.getAllByText('Question for revision 1').length).toBeGreaterThan(0)
    expect(screen.queryByLabelText('Answer')).not.toBeInTheDocument()
  })

  it('uses the Next missing-resource path for a journey outside the active project', async () => {
    mocks.getJourney.mockRejectedValue(new ServiceError('missing', 'NOT_FOUND'))
    mocks.notFound.mockImplementation(() => {
      throw new Error('not found')
    })

    await expect(renderPage()).rejects.toThrow('not found')
  })
})

it('shows managed runtime inside the current focus and omits desktop handoff', async () => {
  mocks.getJourney.mockResolvedValue(
    journey({
      hostingMode: 'APP_SERVER_LOCAL_V1',
      stage: 'ANALYSIS',
      unresolvedQuestionIds: [],
    }),
  )
  mocks.getAnalysis.mockResolvedValue({ revisions: [] })
  mocks.readStatus.mockResolvedValue({
    success: true,
    data: {
      journeyId: 'journey-1',
      targetProjectId: 'project-1',
      runtimeStatus: 'QUEUED',
      lifecycle: { stage: 'ANALYSIS', version: 1, stateHash: digest('a') },
    },
  })
  render(await QualityJourneyDetailPage({ params: Promise.resolve({ journeyId: 'journey-1' }) }))
  const focus = screen.getByRole('region', { name: 'Current journey focus' })
  expect(within(focus).getByRole('status')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Managed hosting ownership' })).not.toBeInTheDocument()
  expect(screen.queryByText(/Prepare a Codex prompt/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Codex/ })).not.toBeInTheDocument()
})

it('keeps the exact Journey return link when Claude Code needs sign-in', async () => {
  mocks.getJourney.mockResolvedValue(
    journey({
      stage: 'ANALYSIS',
      status: 'ACTIVE',
      managedWorkerProvider: 'CLAUDE_CODE',
      unresolvedQuestionIds: [],
    }),
  )
  const settingsHref =
    '/settings/agent-setup?provider=CLAUDE_CODE&project=project-1&returnTo=%2Fquality-journeys%2Fjourney-1%3Fproject%3Dproject-1%23current-work'
  const readiness = {
    CODEX: { provider: 'CODEX', ready: true, state: 'ready', reason: null, actionLabel: null, settingsHref: '' },
    CLAUDE_CODE: {
      provider: 'CLAUDE_CODE',
      ready: false,
      state: 'sign_in',
      reason: 'Claude Code needs your sign-in.',
      actionLabel: 'Sign in to Claude Code',
      settingsHref,
    },
  }
  mocks.managedReadiness.mockImplementation((_: unknown, provider: 'CODEX' | 'CLAUDE_CODE') =>
    Promise.resolve(readiness[provider]),
  )
  render(
    await QualityJourneyDetailPage({
      params: Promise.resolve({ journeyId: 'journey-1' }),
      searchParams: Promise.resolve({ project: 'project-1' }),
    }),
  )
  expect(screen.getByRole('status')).toHaveTextContent('The selected assistant needs setup')
  expect(screen.getByRole('link', { name: 'Sign in to Claude Code' })).toHaveAttribute('href', settingsHref)
  expect(screen.queryByText(/APPRAISE_|server owner|SHA-256/)).not.toBeInTheDocument()
  expect(mocks.managedReadiness).toHaveBeenCalledWith(
    {
      targetProjectId: 'project-1',
      returnTo: '/quality-journeys/journey-1?project=project-1#current-work',
      stage: 'ANALYSIS',
    },
    'CLAUDE_CODE',
  )
})

it('shows legacy migration ownership without desktop controls and retains history', async () => {
  mocks.getJourney.mockResolvedValue(
    journey({ hostingMode: 'EXTERNAL_LEGACY', stage: 'ANALYSIS', unresolvedQuestionIds: [] }),
  )
  mocks.getAnalysis.mockResolvedValue({ revisions: [] })
  render(await QualityJourneyDetailPage({ params: Promise.resolve({ journeyId: 'journey-1' }) }))
  expect(screen.getByText(/Ready to continue this journey in Appraise/)).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Managed hosting ownership' })).toHaveTextContent(
    'Ownership controls for journey-1 in project-1',
  )
  await userEvent.click(screen.getByText('History'))
  expect(screen.getByRole('link', { name: 'Browse files and evidence' })).toBeVisible()
  expect(screen.queryByRole('button', { name: /Codex|prompt|takeover/i })).not.toBeInTheDocument()
})
