import { getOperatorTriageAvailable } from '@/services/coordinator/app-managed-triage-service'
import { getQualityJourneyAnalysis } from '@/services/coordinator/quality-journey-analysis-service'
import { getQualityJourneyClosure } from '@/services/coordinator/quality-journey-closure-service'
import { getQualityJourneyDiscoveryPrerequisites } from '@/services/coordinator/quality-journey-discovery-prerequisites'
import { getQualityJourneyDiscovery } from '@/services/coordinator/quality-journey-discovery-service'
import { getQualityJourneyExecution } from '@/services/coordinator/quality-journey-execution-service'
import { qualityJourneyRemediationScope } from '@/services/coordinator/quality-journey-remediation-scope'
import { getQualityJourneyScenarioPortfolio } from '@/services/coordinator/quality-journey-scenario-service'
import { getQualityJourney } from '@/services/coordinator/quality-journey-service'
import { getQualityJourneyTriage } from '@/services/coordinator/quality-journey-triage-service'
import { ServiceError } from '@/services/shared/errors'
import prisma from '@/config/db-config'
import { chatScenarioReviewSchema } from '@/lib/conversation/scenario-review'
import { readConversationExecution } from '@/services/conversation/conversation-execution-service'
import { readConversationJourneyEvidence } from '@/services/conversation/conversation-journey-evidence'

import { AnalysisApprovalReceipt } from './analysis-approval-receipt'
import { AutomationMaterializationStatus } from './automation-materialization-status'
import { ChatJourneyResultCard } from './chat-journey-result-card'
import { ChatRunActivityCard } from './chat-run-activity-card'
import { ChatRunActivityRefresh } from './chat-run-activity-refresh'
import { ChatRunApproval } from './chat-run-approval'
import { ChatRunPermissionCard } from './chat-run-permission-card'
import { ChatRunRequest, ChatRunRequestForm } from './chat-run-request'
import { ClosurePanel } from './closure-panel'
import { JourneyExecutionConsentControls, JourneyRerunProgress } from './journey-execution-status'
import { JourneyFocusCard } from './journey-focus-card'
import { analysisCriterionChanges, currentJourneyAnalysis, currentJourneyFocus } from './journey-focus-data'
import { OperatorTriageControl } from './operator-triage-control'
import { ChatAnalysisReviewCard } from './proposed-checks-card'
import { analysisReviewEvent } from './proposed-checks-event'
import { toAnalysisRevisionView } from './quality-journey-view-model'
import { ScenarioPortfolioReview } from './scenario-portfolio-review'
import { TriageReportPanel } from './triage-report-panel'

export async function readJourneyChatFocus({
  projectId,
  journeyId,
  savedConversationId,
}: {
  projectId: string
  journeyId: string
  savedConversationId?: string
}) {
  const scope = { journeyId, targetProjectId: projectId }
  const journey = await getQualityJourney(scope).catch(error => {
    if (error instanceof ServiceError && error.code === 'NOT_FOUND') return null
    throw error
  })
  if (!journey) return null
  const observation = {
    projectId,
    journeyId,
    stage: journey.journey.stage,
    version: journey.journey.version,
    stateHash: journey.journey.stateHash,
  }
  const chatExecution = savedConversationId
    ? await readConversationExecution({ ...scope, conversationId: savedConversationId })
    : null
  const execution = chatExecution?.execution ?? (await getQualityJourneyExecution(scope))
  const latestCycle = execution.cycles.at(-1)
  const stage = journey.journey.stage
  const resultsHref = `/quality-journeys/${encodeURIComponent(journeyId)}?project=${encodeURIComponent(projectId)}#triage`
  const evidence =
    savedConversationId && latestCycle && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(latestCycle.status)
      ? await readConversationJourneyEvidence({ ...scope, conversationId: savedConversationId })
      : null
  const evidenceRuns = evidence && evidence.latestCycleId === latestCycle?.id ? evidence.runs : []
  const result = evidenceRuns.length ? <ChatJourneyResultCard runs={evidenceRuns} journeyHref={resultsHref} /> : null
  const activity = latestCycle ? (
    <>
      <ChatRunActivityCard
        cycle={latestCycle}
        projectId={projectId}
        journeyId={journeyId}
        journeyPaused={journey.journey.status === 'PAUSED'}
        stateHash={
          savedConversationId && journey.journey.hostingMode !== 'EXTERNAL_LEGACY' ? observation.stateHash : undefined
        }
        canProposeRerun={
          ['TRIAGE', 'REPORT_REVIEW'].includes(stage) && ['COMPLETED', 'CANCELLED'].includes(latestCycle.status)
        }
        historyOnly={stage === 'CLOSED'}
      />
      <ChatRunActivityRefresh active={['RESERVED', 'RUNNING', 'CANCELLING'].includes(latestCycle.status)} />
    </>
  ) : null
  if (
    journey.blockers.length ||
    journey.journey.status === 'PAUSED' ||
    journey.journey.hostingMode === 'EXTERNAL_LEGACY'
  )
    return {
      observation,
      card:
        (activity ? (
          <>
            {activity}
            {result}
          </>
        ) : null) ??
        (chatExecution?.permission && savedConversationId ? (
          <ChatRunPermissionCard permission={chatExecution.permission} projectId={projectId} journeyId={journeyId} />
        ) : null),
    }

  const [analysis, triage, scenarios] = await Promise.all([
    getQualityJourneyAnalysis(scope),
    getQualityJourneyTriage(scope),
    ['SCENARIO_REVIEW', 'AUTOMATION'].includes(stage)
      ? getQualityJourneyScenarioPortfolio(scope).catch(error => {
          if (error instanceof ServiceError && error.code === 'NOT_FOUND') return null
          throw error
        })
      : null,
  ])
  const { revision, view: activeAnalysis } = currentJourneyAnalysis(journey, analysis)
  const focus = currentJourneyFocus({
    journey,
    activeAnalysis,
    execution,
    triage,
    scenarios,
  })
  const href = `/quality-journeys/${encodeURIComponent(journeyId)}?project=${encodeURIComponent(projectId)}#${focus.destination}`
  const permission = chatExecution?.permission
  if (savedConversationId && permission && (stage === 'AUTOMATION' || !latestCycle)) {
    const actionablePermission = permission.status === 'REQUESTED' && !permission.stale && !permission.expired
    const replacementEnvironments =
      stage === 'AUTOMATION' && (permission.stale || permission.expired)
        ? await prisma.environment.findMany({
            where: { targetProjectId: projectId, archivedAt: null },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : null
    return {
      observation,
      ...(actionablePermission
        ? {
            runPermissionReview: {
              journeyId,
              executionConsentId: permission.id,
              expectedScopeHash: permission.scopeHash,
            },
          }
        : {}),
      card: (
        <ChatRunPermissionCard
          permission={permission}
          projectId={projectId}
          journeyId={journeyId}
          action={
            ['REQUESTED', 'GRANTED'].includes(permission.status) && !permission.stale && !permission.expired ? (
              <ChatRunApproval
                conversationId={savedConversationId}
                journeyId={journeyId}
                executionConsentId={permission.id}
                expectedScopeHash={permission.scopeHash}
                resumeGrantedAttempt={permission.status === 'GRANTED'}
              />
            ) : null
          }
          replacement={
            replacementEnvironments && (
              <ChatRunRequestForm
                conversationId={savedConversationId}
                journeyId={journeyId}
                expectedStateHash={journey.journey.stateHash}
                environments={replacementEnvironments}
              />
            )
          }
        />
      ),
    }
  }
  if (savedConversationId && latestCycle && journey.journey.stage === 'EXECUTION') {
    const stopAvailable =
      journey.journey.status === 'ACTIVE' &&
      ['RESERVED', 'RUNNING'].includes(latestCycle.status) &&
      latestCycle.testRuns.every(run => !run.diagnostic)
    return {
      observation,
      ...(stopAvailable
        ? {
            runStopReview: { journeyId, executionCycleId: latestCycle.id, expectedStateHash: observation.stateHash },
          }
        : {}),
      card: (
        <>
          {activity}
          {stopAvailable ? (
            <p className="text-sm text-muted-foreground">
              Type <strong>Stop this run</strong> to request a stop for all tests in this activity.
            </p>
          ) : null}
          {result}
        </>
      ),
    }
  }
  if (savedConversationId && journey.journey.stage === 'AUTOMATION') {
    const portfolio = scenarios?.portfolio
    const [materializations, environments, remediation] = await Promise.all([
      portfolio
        ? prisma.qualityJourneyAutomationMaterialization.findMany({
            where: { ...scope, cycleId: journey.journey.activeCycleId, portfolioRecordId: portfolio.id },
            select: { scenarioRevisionId: true, status: true, preparedCapsule: { select: { status: true } } },
          })
        : [],
      prisma.environment.findMany({
        where: { targetProjectId: projectId, archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      qualityJourneyRemediationScope(journeyId, journey.journey.activeCycleId, prisma),
    ])
    const scenarioRevisionIds =
      portfolio?.scenarios
        .filter(
          scenario =>
            scenario.decisions.some(decision => decision.decision === 'APPROVED') &&
            (!remediation || remediation.scenarioRevisionIds.includes(scenario.scenarioRevisionId)),
        )
        .map(scenario => scenario.scenarioRevisionId) ?? []
    const prepared = new Set(
      materializations
        .filter(item => item.status === 'MATERIALIZED' && item.preparedCapsule?.status === 'PREPARED')
        .map(item => item.scenarioRevisionId),
    )
    const ready = scenarioRevisionIds.length > 0 && scenarioRevisionIds.every(id => prepared.has(id))
    return {
      observation,
      card: (
        <>
          <AutomationMaterializationStatus
            context={scenarioRevisionIds.length ? { materializations, scenarioRevisionIds } : null}
          />
          {ready ? (
            <ChatRunRequest
              conversationId={savedConversationId}
              journeyId={journeyId}
              expectedStateHash={journey.journey.stateHash}
              environments={environments}
            />
          ) : (
            <JourneyFocusCard focus={focus} href={href} />
          )}
        </>
      ),
    }
  }
  if (savedConversationId && stage === 'DISCOVERY') {
    const discovery = await getQualityJourneyDiscovery(scope)
    const current = discovery.revisions.find(revision => revision.id === discovery.activeDiscoveryRevisionId)
    return {
      observation,
      card: (
        <JourneyFocusCard
          focus={{
            ...focus,
            title: 'Inspect the target app',
            summary: current
              ? 'The approved inspection scope is ready in the Journey.'
              : 'Waiting for the approved inspection scope.',
            action: 'Open target inspection',
          }}
          href={href}
        />
      ),
    }
  }
  if (savedConversationId && stage === 'SCENARIO_REVIEW' && scenarios) {
    const portfolio = scenarios.portfolio
    const reviewed = chatScenarioReviewSchema.safeParse({
      journeyId,
      portfolioId: portfolio.artifactId,
      portfolioRevisionId: portfolio.artifactRevisionId,
      portfolioHash: portfolio.contentHash,
      reviewHash: portfolio.reviewHash,
      stateHash: observation.stateHash,
      pendingScenarioRevisionIds: portfolio.scenarios
        .filter(scenario => !scenario.decisions.length)
        .map(scenario => scenario.scenarioRevisionId)
        .sort(),
    })
    return {
      observation,
      scenarioReview: reviewed.success ? reviewed.data : undefined,
      card: (
        <ScenarioPortfolioReview
          key={portfolio.reviewHash ?? portfolio.artifactRevisionId}
          portfolio={portfolio}
          journeyId={journeyId}
          stage={stage}
          stateHash={observation.stateHash}
        />
      ),
    }
  }
  const reviewHash = activeAnalysis?.publication?.reviewHash
  const question = activeAnalysis?.questions.find(item => item.required && item.answers.length === 0)
  if (
    savedConversationId &&
    focus.kind === 'question' &&
    activeAnalysis &&
    question &&
    journey.journey.analysisReviewHash &&
    (stage === 'ANALYSIS_REVIEW' || (stage === 'ANALYSIS' && !activeAnalysis.publication))
  ) {
    const expected = {
      conversationId: savedConversationId,
      projectId,
      journeyId,
      revisionId: activeAnalysis.analysisRevisionId,
      reviewHash: journey.journey.analysisReviewHash,
    }
    const event = analysisReviewEvent({
      ...expected,
      kind: 'question',
      revision: activeAnalysis.revision,
      includedScope: activeAnalysis.scope.included,
      prompt: question.prompt,
      rationale: question.rationale,
      choices: question.suggestedAnswers ?? [],
    })
    return {
      observation,
      analysisQuestion: {
        journeyId,
        revisionId: activeAnalysis.id,
        questionId: question.questionId,
        stateHash: observation.stateHash,
      },
      card: <ChatAnalysisReviewCard events={[event]} expected={expected} />,
    }
  }
  if (
    focus.kind === 'proposed-checks' &&
    savedConversationId &&
    revision &&
    activeAnalysis &&
    activeAnalysis.analysisRevisionId === journey.journey.activeRevisionIds.analysis &&
    reviewHash &&
    reviewHash === journey.journey.analysisReviewHash
  ) {
    const expected = {
      conversationId: savedConversationId,
      projectId,
      journeyId,
      revisionId: activeAnalysis.analysisRevisionId,
      reviewHash,
    }
    const base = {
      ...expected,
      revision: activeAnalysis.revision,
      includedScope: activeAnalysis.scope.included,
      approvable:
        !activeAnalysis.decision &&
        journey.journey.unresolvedQuestionIds.length === 0 &&
        (await getQualityJourneyDiscoveryPrerequisites(projectId)).ready,
    }
    const predecessor = analysis.revisions.find(item => item.id === revision.predecessorRevisionId)
    const event = analysisReviewEvent(
      predecessor?.publication
        ? {
            ...base,
            kind: 'review-changes',
            changes: analysisCriterionChanges(
              toAnalysisRevisionView(predecessor).obligations,
              activeAnalysis.obligations,
            ),
          }
        : { ...base, kind: 'proposed-checks', checks: activeAnalysis.acceptanceSignals },
    )
    return {
      observation,
      analysisReview: { journeyId, revisionId: expected.revisionId, reviewHash, stateHash: observation.stateHash },
      card: <ChatAnalysisReviewCard events={[event]} expected={expected} />,
    }
  }
  if (savedConversationId && focus.kind === 'proposed-checks') return { observation, card: null }
  const [closure, operatorTriage] = await Promise.all([
    savedConversationId && ['REPORT_REVIEW', 'CLOSED'].includes(stage) ? getQualityJourneyClosure(scope) : null,
    savedConversationId && stage === 'TRIAGE' ? getOperatorTriageAvailable(scope) : false,
  ])
  const rerunProposals = savedConversationId && ['TRIAGE', 'REPORT_REVIEW'].includes(stage) ? execution.proposals : []
  const rerunEnvironments = rerunProposals.some(item => ['PROPOSED', 'APPROVED'].includes(item.status))
    ? await prisma.environment.findMany({
        where: { targetProjectId: projectId, archivedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : []
  return {
    observation,
    card: (
      <>
        {activeAnalysis?.decision?.decision === 'APPROVED' &&
          activeAnalysis.analysisRevisionId === journey.journey.activeRevisionIds.analysis && (
            <AnalysisApprovalReceipt revision={activeAnalysis.revision} />
          )}
        {savedConversationId && latestCycle && ['TRIAGE', 'REPORT_REVIEW', 'CLOSED'].includes(stage) && activity}
        {focus.kind === 'result-evidence' && result ? result : <JourneyFocusCard focus={focus} href={href} />}
        {operatorTriage && <OperatorTriageControl journeyId={journeyId} stateHash={observation.stateHash} />}
        {savedConversationId && rerunProposals.length > 0 && (
          <section aria-label="Selective reruns" className="space-y-3">
            <JourneyRerunProgress
              proposals={rerunProposals}
              environments={rerunEnvironments}
              journeyId={journeyId}
              stateHash={observation.stateHash}
            />
            <JourneyExecutionConsentControls
              consents={execution.consents.filter(consent => !consent.scope.chatConversationId)}
              environments={rerunEnvironments}
              journeyId={journeyId}
            />
          </section>
        )}
        {savedConversationId && stage === 'REPORT_REVIEW' && triage.activeReportRevisionId && (
          <details className="space-y-3 rounded-xl border p-3">
            <summary className="app-focus cursor-pointer text-sm font-medium">Review results and remediation</summary>
            <TriageReportPanel
              projectId={projectId}
              journeyId={journeyId}
              stage={stage}
              stateHash={observation.stateHash}
              triage={triage}
            />
          </details>
        )}
        {closure && (
          <ClosurePanel
            key={closure.reportHash ?? journeyId}
            journeyId={journeyId}
            stateHash={observation.stateHash}
            closure={closure}
          />
        )}
      </>
    ),
  }
}

export async function JourneyChatFocus(props: { projectId: string; journeyId: string }) {
  return (await readJourneyChatFocus(props))?.card ?? null
}
