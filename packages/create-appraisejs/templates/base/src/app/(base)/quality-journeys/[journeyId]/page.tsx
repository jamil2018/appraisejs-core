import { getAppManagedAnonymousDiscoveryCaptureStatus } from '@/services/coordinator/app-managed-discovery-capture'
import { ClosurePanel } from './closure-panel'
import { ManagedJourneyOwnershipControl } from './managed-journey-ownership-control'
import { ManagedJourneyProgression } from './managed-journey-progression'
import { ManagedTriageControl } from './managed-triage-control'
import { ManualAutomationControl } from './manual-automation-control'
import { OperatorTriageControl } from './operator-triage-control'
import { getOperatorTriageAvailable } from '@/services/coordinator/app-managed-triage-service'
import {
  getAppManagedAutomatorManualRecovery,
  observePendingManualAutomationRecovery,
  getAppManagedManualAutomationDraftContext,
} from '@/services/coordinator/app-managed-automation-manual-recovery'
import { getAppManagedTriageRecovery } from '@/services/coordinator/app-managed-triage-recovery'
import { getQualityJourneyClosure } from '@/services/coordinator/quality-journey-closure-service'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, CircleAlert, ShieldCheck } from 'lucide-react'
import { notFound } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireActiveProject } from '@/lib/active-project'
import { qualityJourneyRequirementSummary } from '@/lib/quality-journey/presentation'
import { getQualityJourneyAnalysis } from '@/services/coordinator/quality-journey-analysis-service'
import { getQualityJourneyDiscovery } from '@/services/coordinator/quality-journey-discovery-service'
import { getQualityJourneyDiscoveryPrerequisites } from '@/services/coordinator/quality-journey-discovery-prerequisites'
import {
  getAppManagedPreparationRecovery,
  getAppManagedScenarioDesignCorrection,
} from '@/services/coordinator/app-managed-scenario-automation-recovery'
import { getQualityJourney } from '@/services/coordinator/quality-journey-service'
import { getQualityJourneyScenarioPortfolio } from '@/services/coordinator/quality-journey-scenario-service'
import { getQualityJourneyAutomationContext } from '@/services/coordinator/quality-journey-automation-service'
import { getQualityJourneyExecution } from '@/services/coordinator/quality-journey-execution-service'
import { getQualityJourneyTriage } from '@/services/coordinator/quality-journey-triage-service'
import prisma from '@/config/db-config'
import { JourneyActivity, JourneyStages } from './journey-activity'
import { JourneyExecutionStatus } from './journey-execution-status'
import { JourneyRecoveryPanel } from './journey-recovery-panel'
import { ServiceError } from '@/services/shared/errors'

import { AnalysisReviewControls } from './analysis-review-controls'
import { AutomationMaterializationStatus } from './automation-materialization-status'
import { AnalysisRecoveryControl } from './analysis-recovery-control'
import { getQualityJourneyStatusSnapshot } from '@/services/coordinator/quality-journey-query-service'
import { JourneyStatusObservationProvider } from './journey-status-observation'
import { ScenarioPortfolioReview } from './scenario-portfolio-review'
import { DiscoveryBrowserPanel } from './discovery-browser-panel'
import { DiscoverySetupPanel } from './discovery-setup-panel'
import { ManagedDiscoveryControl } from './managed-discovery-control'
import { ManagedScenarioAutomationControl } from './managed-scenario-automation-control'
import { TriageReportPanel } from './triage-report-panel'
import { qualityJourneyLabel, toAnalysisRevisionView } from './quality-journey-view-model'

type PageProps = { params: Promise<{ journeyId: string }>; searchParams?: Promise<{ project?: string }> }

function LinkedFollowUpAction({
  visible,
  journeyId,
  projectId,
}: {
  visible: boolean
  journeyId: string
  projectId: string
}) {
  if (!visible) return null
  return (
    <Button
      variant="outline"
      nativeButton={false}
      render={
        <Link
          href={`/quality-journeys/new?project=${encodeURIComponent(projectId)}&predecessor=${encodeURIComponent(journeyId)}`}
        />
      }
    >
      Start linked follow-up journey
    </Button>
  )
}

async function loadJourneySupplementalArtifacts(journeyId: string, projectId: string, stage: string) {
  const scenarioStages = [
    'SCENARIO_DESIGN',
    'SCENARIO_REVIEW',
    'AUTOMATION',
    'EXECUTION',
    'TRIAGE',
    'REPORT_REVIEW',
    'CLOSED',
  ]
  const automationStages = ['AUTOMATION', 'EXECUTION', 'TRIAGE', 'REPORT_REVIEW', 'CLOSED']
  const scenarioPortfolio = scenarioStages.includes(stage)
    ? await getQualityJourneyScenarioPortfolio({ journeyId, targetProjectId: projectId }).catch(error => {
        if (error instanceof ServiceError && error.code === 'NOT_FOUND') return null
        throw error
      })
    : null
  const automationContext =
    automationStages.includes(stage) &&
    (stage !== 'AUTOMATION' || Boolean(scenarioPortfolio?.portfolio?.approvedIntentHash))
      ? await getQualityJourneyAutomationContext({ journeyId, targetProjectId: projectId })
      : null
  // These are immutable, reviewable lifecycle records. Keep them available once
  // they exist, even when the current Runner stage has moved past their gate.
  return { scenarios: scenarioPortfolio, automation: automationContext }
}

async function loadJourneyDetail(journeyId: string, projectId: string) {
  const [journey, analysis] = await Promise.all([
    getQualityJourney({ journeyId, targetProjectId: projectId }).then(
      value => value,
      error => {
        if (error instanceof ServiceError && error.code === 'NOT_FOUND') return notFound()
        throw error
      },
    ),
    getQualityJourneyAnalysis({ journeyId, targetProjectId: projectId }),
  ])
  const activeAnalysisId = journey.journey.activeRevisionIds.analysis
  const activeRevision = analysis.revisions.find(item => item.artifactRevisionId === activeAnalysisId)
  const successorDraft = analysis.revisions.findLast(item => !item.publication)
  const revision =
    journey.journey.stage === 'ANALYSIS'
      ? (successorDraft ?? activeRevision)
      : (activeRevision ?? analysis.revisions.at(-1))
  const activeAnalysis = revision ? toAnalysisRevisionView(revision) : null
  const answerable =
    journey.journey.stage === 'ANALYSIS_REVIEW' ||
    (journey.journey.stage === 'ANALYSIS' && Boolean(revision && !revision.publication))
  const [
    { scenarios, automation },
    discovery,
    execution,
    triage,
    environments,
    attempts,
    requirement,
    discoverySetup,
    preparationRecovery,
    designCorrection,
    triageRecovery,
    discoveryCaptureStatus,
    manualPreparation,
    operatorTriageAvailable,
  ] = await Promise.all([
    loadJourneySupplementalArtifacts(journeyId, projectId, journey.journey.stage),
    loadActiveDiscovery(journey.journey.stage, journeyId, projectId),
    getQualityJourneyExecution({ journeyId, targetProjectId: projectId }),
    getQualityJourneyTriage({ journeyId, targetProjectId: projectId }),
    prisma.environment.findMany({
      where: { targetProjectId: projectId, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.qualityJourneyWorkAttempt.findMany({
      where: { workItem: { journeyId, targetProjectId: projectId } },
      select: {
        id: true,
        workItemId: true,
        attempt: true,
        status: true,
        startedAt: true,
        completedAt: true,
        dispatchAdapterId: true,
        failureJson: true,
      },
      orderBy: [{ workItemId: 'asc' }, { attempt: 'asc' }],
    }),
    prisma.qualityJourneyRevision.findFirst({
      where: { journeyId },
      orderBy: { revision: 'asc' },
      select: { contentJson: true },
    }),
    ['ANALYSIS', 'ANALYSIS_REVIEW'].includes(journey.journey.stage)
      ? getQualityJourneyDiscoveryPrerequisites(projectId)
      : null,
    ['SCENARIO_DESIGN', 'SCENARIO_REVIEW', 'AUTOMATION'].includes(journey.journey.stage)
      ? getAppManagedPreparationRecovery({
          journeyId,
          targetProjectId: projectId,
          role: journey.journey.stage === 'AUTOMATION' ? 'AUTOMATOR' : 'TEST_SCENARIO_DESIGNER',
        })
      : null,
    journey.journey.stage === 'SCENARIO_DESIGN'
      ? getAppManagedScenarioDesignCorrection({ journeyId, targetProjectId: projectId })
      : null,
    ['TRIAGE', 'REPORT_REVIEW'].includes(journey.journey.stage)
      ? getAppManagedTriageRecovery({ journeyId, targetProjectId: projectId })
      : null,
    journey.journey.stage === 'DISCOVERY'
      ? getAppManagedAnonymousDiscoveryCaptureStatus({
          journeyId,
          targetProjectId: projectId,
          expectedStateHash: journey.journey.stateHash,
        })
      : null,
    journey.journey.stage === 'AUTOMATION' ? loadManualPreparation(journeyId, projectId) : null,
    journey.journey.stage === 'TRIAGE' ? getOperatorTriageAvailable({ journeyId, targetProjectId: projectId }) : false,
  ])
  return {
    activeAnalysis,
    previousAnalyses: analysis.revisions
      .filter(item => revision && item.revision < revision.revision)
      .map(toAnalysisRevisionView),
    answerable,
    journey,
    discovery,
    discoverySetup,
    preparationRecovery,
    designCorrection,
    triageRecovery,
    discoveryCaptureStatus,
    manualPreparation,
    operatorTriageAvailable,
    scenarios,
    automation,
    execution,
    triage,
    environments,
    attempts,
    requirementSummary: requirement
      ? qualityJourneyRequirementSummary(requirement.contentJson)
      : 'Requirement snapshot unavailable',
  }
}

async function loadManualPreparation(journeyId: string, targetProjectId: string) {
  const scope = { journeyId, targetProjectId }
  const [recovery, issued] = await Promise.all([
    getAppManagedAutomatorManualRecovery(scope),
    observePendingManualAutomationRecovery(scope),
  ])
  if (!recovery && !issued) return null
  const context = await getAppManagedManualAutomationDraftContext(scope)
  return { recovery, issued, choices: context?.choices }
}

async function loadActiveDiscovery(stage: string, journeyId: string, projectId: string) {
  if (stage !== 'DISCOVERY') return null
  return getQualityJourneyDiscovery({ journeyId, targetProjectId: projectId }).catch(error => {
    if (error instanceof ServiceError && error.code === 'NOT_FOUND') return null
    throw error
  })
}

function discoveryBrowserView(
  discovery: Awaited<ReturnType<typeof getQualityJourneyDiscovery>> | null,
  environments: Array<{ id: string; name: string }>,
) {
  if (!discovery?.activeDiscoveryRevisionId) return null
  const active = discovery.revisions.find(revision => revision.id === discovery.activeDiscoveryRevisionId)
  if (!active) return null
  const scope = JSON.parse(active.scoutScopeJson) as {
    environmentIds?: string[]
    routes?: string[]
    environmentBindings?: Array<{ environmentId: string; discoveryAuthTransitPolicyJson: string | null }>
  }
  const environmentIds = new Set(scope.environmentIds ?? [])
  const routes = [...new Set(scope.routes ?? [])].toSorted()
  if (!routes.length) return null
  return {
    id: active.id,
    workItemId: active.scoutWorkItemId,
    environments: environments.filter(environment => environmentIds.has(environment.id)),
    routes,
    authFlows: (scope.environmentBindings ?? []).flatMap(binding => {
      if (!binding.discoveryAuthTransitPolicyJson) return []
      try {
        const value = JSON.parse(binding.discoveryAuthTransitPolicyJson) as { flows?: Array<{ flowId?: string }> }
        return (value.flows ?? [])
          .filter((flow): flow is { flowId: string } => typeof flow.flowId === 'string')
          .map(flow => ({ environmentId: binding.environmentId, flowId: flow.flowId }))
      } catch {
        return []
      }
    }),
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { journeyId } = await params
  return { title: `Quality Journey ${journeyId}` }
}

function detailPresentation(
  detail: Awaited<ReturnType<typeof loadJourneyDetail>>,
  closure: Awaited<ReturnType<typeof getQualityJourneyClosure>>,
) {
  const portfolio = detail.scenarios ? detail.scenarios.portfolio : null
  const materializations = detail.automation ? detail.automation.materializations : []
  const activeDiscovery = detail.discovery?.revisions.find(
    revision => revision.id === detail.discovery?.activeDiscoveryRevisionId,
  )
  const readyScenarios = new Set(
    materializations
      .filter(item => item.status === 'MATERIALIZED' && item.preparedCapsule?.status === 'PREPARED')
      .map(item => item.scenarioRevisionId),
  )
  const allPrepared = Boolean(
    detail.automation?.scenarioRevisionIds.length &&
    detail.automation.scenarioRevisionIds.every(id => readyScenarios.has(id)),
  )
  const discoveryFailure = (role: string) =>
    detail.journey.workItems.some(
      item =>
        item.cycleId === detail.journey.journey.activeCycleId &&
        item.status !== 'SUPERSEDED' &&
        item.role === role &&
        detail.attempts.some(
          attempt =>
            attempt.workItemId === item.id &&
            attempt.attempt === item.currentAttempt &&
            attempt.dispatchAdapterId &&
            attempt.failureJson &&
            attempt.failureJson.includes('"stage"'),
        ),
    )
  return {
    portfolio,
    allPrepared,
    scoutFailed: discoveryFailure('SCOUT'),
    explorerFailed: discoveryFailure('RESOURCE_EXPLORER'),
    triageFailed: discoveryFailure('TRIAGER'),
    requestedExecutionConsentCount: detail.execution.consents.filter(consent => consent.status === 'REQUESTED').length,
    hasClosureReceipt: Boolean(closure.receipt),
    discoveryCorrectionReady: activeDiscovery?.status === 'INVALIDATED',
    capsuleIds: materializations.flatMap(item =>
      item.status === 'MATERIALIZED' && item.preparedCapsule ? [item.preparedCapsule.id] : [],
    ),
  }
}

type Detail = Awaited<ReturnType<typeof loadJourneyDetail>>
type CurrentWorkProps = {
  detail: Detail
  presentation: ReturnType<typeof detailPresentation>
  projectId: string
  closure: Awaited<ReturnType<typeof getQualityJourneyClosure>>
}

function JourneyHistory({ detail, projectId, closed }: { detail: Detail; projectId: string; closed: boolean }) {
  const { journey, activeAnalysis, requirementSummary } = detail
  const journeyId = journey.journey.journeyId
  return (
    <details className="border-t pt-3">
      <summary className="cursor-pointer text-sm font-medium">History</summary>
      <div className="mt-4 space-y-4">
        <section>
          <h2 className="font-semibold">Original brief</h2>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">{requirementSummary}</p>
        </section>
        {[...detail.previousAnalyses, ...(activeAnalysis ? [activeAnalysis] : [])].map(item => (
          <details key={item.analysisRevisionId}>
            <summary className="cursor-pointer text-sm">Requirements review {item.revision}</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {item.requirements.map(row => (
                <li key={row.requirementId}>{row.statement}</li>
              ))}
            </ul>
            {item.questions.map(q => (
              <div key={q.id} className="mt-2 text-sm">
                <p>{q.prompt}</p>
                {q.answers.map(a => (
                  <p key={a.answerId} className="text-muted-foreground">
                    {a.answer}
                  </p>
                ))}
              </div>
            ))}
          </details>
        ))}
        <Timeline events={journey.events} />
        <Link
          className="text-sm underline"
          href={`/quality-journeys/${journeyId}/artifacts?project=${encodeURIComponent(projectId)}`}
        >
          Browse files and evidence
        </Link>
        <LinkedFollowUpAction journeyId={journeyId} projectId={projectId} visible={closed} />
      </div>
    </details>
  )
}

function JourneyCurrentWork({ detail, presentation, projectId, closure }: CurrentWorkProps) {
  const {
    journey,
    activeAnalysis,
    answerable,
    discovery,
    discoverySetup,
    preparationRecovery,
    designCorrection,
    automation,
    execution,
    triage,
    environments,
  } = detail
  const { stage, journeyId, stateHash } = journey.journey
  const run = (
    <section id="execution" tabIndex={-1}>
      <JourneyExecutionStatus
        execution={execution}
        journeyId={journeyId}
        targetProjectId={projectId}
        stateHash={stateHash}
        stage={stage}
        environments={environments}
        capsuleIds={presentation.capsuleIds}
      />
    </section>
  )
  switch (stage) {
    case 'ANALYSIS':
    case 'ANALYSIS_REVIEW':
      return activeAnalysis ? (
        <section id="analysis" className="space-y-3">
          <AnalysisReviewControls
            discoveryReady={discoverySetup?.ready ?? true}
            previousAnalyses={detail.previousAnalyses}
            analysis={activeAnalysis}
            answerable={answerable}
            journeyId={journeyId}
            stage={stage}
            stateHash={stateHash}
            analysisReviewHash={journey.journey.analysisReviewHash}
            unresolvedQuestionIds={journey.journey.unresolvedQuestionIds}
          />

          {discoverySetup && !discoverySetup.ready && !journey.journey.unresolvedQuestionIds.length ? (
            <DiscoverySetupPanel prerequisites={discoverySetup} projectId={projectId} />
          ) : null}
        </section>
      ) : null
    case 'DISCOVERY':
      return (
        <section id="discovery" tabIndex={-1}>
          <DiscoveryBrowserPanel
            journeyId={journeyId}
            discovery={discoveryBrowserView(discovery, environments)}
            automaticStatus={detail.discoveryCaptureStatus ?? undefined}
          />
          {presentation.scoutFailed || presentation.explorerFailed || presentation.discoveryCorrectionReady ? (
            <ManagedDiscoveryControl
              correctionReady={presentation.discoveryCorrectionReady}
              scoutAccepted={!presentation.scoutFailed}
              resourceAccepted={!presentation.explorerFailed}
              journeyId={journeyId}
              stateHash={stateHash}
              enabled={process.env.APPRAISE_LOCAL_CODEX_DISCOVERY_ENABLED === 'true'}
            />
          ) : null}
        </section>
      )
    case 'SCENARIO_DESIGN':
    case 'SCENARIO_REVIEW':
      return (
        <section id="scenarios" tabIndex={-1}>
          {designCorrection || preparationRecovery ? (
            <ManagedScenarioAutomationControl
              key={`designer:${designCorrection?.failureHash ?? preparationRecovery?.candidateHash ?? 'dispatch'}`}
              correction={designCorrection}
              recovery={preparationRecovery}
              journeyId={journeyId}
              stateHash={stateHash}
              enabled={process.env.APPRAISE_LOCAL_CODEX_SCENARIO_AUTOMATION_ENABLED === 'true'}
              role="TEST_SCENARIO_DESIGNER"
            />
          ) : null}
          <ScenarioPortfolioReview
            journeyId={journeyId}
            portfolio={presentation.portfolio}
            stage={stage}
            stateHash={stateHash}
          />
        </section>
      )
    case 'AUTOMATION':
      return (
        <>
          {
            <section id="automation" tabIndex={-1}>
              {detail.manualPreparation?.recovery || detail.manualPreparation?.issued ? (
                <ManualAutomationControl
                  journeyId={journeyId}
                  stateHash={stateHash}
                  recovery={detail.manualPreparation.recovery}
                  issued={detail.manualPreparation.issued}
                  choices={detail.manualPreparation.choices}
                />
              ) : null}
              {preparationRecovery ? (
                <ManagedScenarioAutomationControl
                  key={`automator:${preparationRecovery?.candidateHash ?? 'dispatch'}`}
                  recovery={preparationRecovery}
                  journeyId={journeyId}
                  stateHash={stateHash}
                  enabled={process.env.APPRAISE_LOCAL_CODEX_SCENARIO_AUTOMATION_ENABLED === 'true'}
                  role="AUTOMATOR"
                />
              ) : null}
              <AutomationMaterializationStatus context={automation} />
            </section>
          }
          {presentation.allPrepared ? run : null}
        </>
      )
    case 'EXECUTION':
      return run
    case 'TRIAGE':
    case 'REPORT_REVIEW':
    case 'CLOSED':
      return (
        <>
          {
            <section id="triage" tabIndex={-1}>
              {stage === 'TRIAGE' && detail.operatorTriageAvailable ? (
                <OperatorTriageControl journeyId={journeyId} stateHash={stateHash} />
              ) : null}
              {detail.triageRecovery ? (
                <ManagedTriageControl
                  journeyId={journeyId}
                  stateHash={stateHash}
                  enabled={false}
                  recovery={detail.triageRecovery}
                />
              ) : stage === 'TRIAGE' && presentation.triageFailed ? (
                <p role="alert" className="text-sm">
                  Appraise couldn’t save the report. Your test results are in History.
                </p>
              ) : null}
              <TriageReportPanel
                projectId={projectId}
                journeyId={journeyId}
                stage={stage}
                stateHash={stateHash}
                triage={triage}
              />
            </section>
          }
          {execution.proposals.some(p => ['PROPOSED', 'APPROVED'].includes(p.status)) ? run : null}
          {stage === 'TRIAGE' ? null : (
            <ClosurePanel
              key={closure.reportHash ?? journeyId}
              journeyId={journeyId}
              stateHash={stateHash}
              closure={closure}
            />
          )}
        </>
      )
    default:
      return null
  }
}

export default async function QualityJourneyDetailPage({ params, searchParams }: PageProps) {
  const [{ journeyId }, parameters] = await Promise.all([params, searchParams])
  const project = await requireActiveProject(parameters ? parameters.project : undefined)
  const [detail, closure, initialSnapshot] = await Promise.all([
    loadJourneyDetail(journeyId, project.id),
    getQualityJourneyClosure({ journeyId, targetProjectId: project.id }),
    getQualityJourneyStatusSnapshot({ journeyId, targetProjectId: project.id }),
  ])
  const { activeAnalysis, answerable, journey, execution, requirementSummary } = detail
  const presentation = detailPresentation(detail, closure)
  const managedActive = journey.journey.hostingMode === 'APP_SERVER_LOCAL_V1' && journey.journey.status === 'ACTIVE'

  const stage = journey.journey.stage
  const workerSetting: Partial<Record<string, string>> = {
    ANALYSIS: 'APPRAISE_LOCAL_CODEX_ANALYSIS_ENABLED',
    DISCOVERY: 'APPRAISE_LOCAL_CODEX_DISCOVERY_ENABLED',
    SCENARIO_DESIGN: 'APPRAISE_LOCAL_CODEX_SCENARIO_AUTOMATION_ENABLED',
    AUTOMATION: 'APPRAISE_LOCAL_CODEX_SCENARIO_AUTOMATION_ENABLED',
    TRIAGE: 'APPRAISE_LOCAL_CODEX_TRIAGE_ENABLED',
  }
  const setting = workerSetting[stage]
  const agentEnabled = Boolean(setting && process.env[setting] === 'true')
  const activeRunStates = new Set(execution.cycles.map(cycle => cycle.status))
  let executionActivity: string | undefined
  if (stage === 'EXECUTION') {
    if (activeRunStates.has('CANCELLING')) executionActivity = 'Stopping the test run'
    else if (activeRunStates.has('RUNNING')) executionActivity = 'Running approved tests'
    else if (activeRunStates.has('RESERVED')) executionActivity = 'Waiting for the test run to start'
  }
  const legacy = journey.journey.hostingMode === 'EXTERNAL_LEGACY'
  const paused = journey.journey.status === 'PAUSED'
  const hasQuestion =
    answerable &&
    (journey.journey.unresolvedQuestionIds.length > 0 ||
      Boolean(activeAnalysis?.questions.some(question => question.required && !question.answers.length)))
  const showAgentSetup =
    managedActive &&
    setting &&
    !agentEnabled &&
    !hasQuestion &&
    !journey.blockers.length &&
    !presentation.allPrepared &&
    !presentation.requestedExecutionConsentCount &&
    !detail.operatorTriageAvailable &&
    !detail.manualPreparation &&
    !['MANUAL_REQUIRED', 'RECOVERY_REQUIRED', 'INSPECTING'].includes(detail.discoveryCaptureStatus ?? '') &&
    initialSnapshot?.runtimeStatus !== 'RECOVERY'

  return (
    <JourneyStatusObservationProvider
      initialSnapshot={initialSnapshot}
      journeyId={journeyId}
      projectId={project.id}
      stage={journey.journey.stage}
      stateHash={journey.journey.stateHash}
      version={journey.journey.version}
    >
      <div className="space-y-4">
        <header className="space-y-2">
          <Link
            className="app-focus inline-flex min-h-8 items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground"
            href={`/quality-journeys?project=${encodeURIComponent(project.id)}`}
          >
            <ArrowLeft aria-hidden="true" className="size-4" /> Quality Journeys
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="min-w-0 flex-[1_1_12rem] break-words text-2xl font-semibold tracking-tight sm:text-3xl">
              {requirementSummary.split('\n')[0].slice(0, 100)}
            </h1>
            <JourneyRecoveryPanel
              journeyId={journeyId}
              status={journey.journey.status}
              stateHash={journey.journey.stateHash}
              version={journey.journey.version}
            />
          </div>
        </header>
        <JourneyStages stage={stage} />
        {managedActive ? (
          <ManagedJourneyProgression
            journeyId={journeyId}
            stateHash={journey.journey.stateHash}
            discoveryCaptureStatus={detail.discoveryCaptureStatus}
          />
        ) : null}
        <section className="space-y-3" aria-label="Current journey focus">
          <div
            className={
              showAgentSetup ? 'space-y-2 rounded-xl border border-warning-border bg-warning-surface p-4' : undefined
            }
          >
            <JourneyActivity
              stage={stage}
              status={journey.journey.status}
              legacy={legacy}
              revision={stage === 'ANALYSIS' && Boolean(activeAnalysis?.decision || detail.previousAnalyses.length)}
              readyToRun={stage === 'AUTOMATION' && presentation.allPrepared}
              analyzingEnabled={agentEnabled}
              reviewing={Boolean(activeAnalysis)}
              discoveryCaptureStatus={detail.discoveryCaptureStatus ?? undefined}
              awaitingReportReview={detail.operatorTriageAvailable}
              awaitingTestPlan={Boolean(detail.manualPreparation?.issued)}
              executionActivity={executionActivity}
              question={hasQuestion}
              blocked={journey.blockers.length > 0}
              consent={presentation.requestedExecutionConsentCount > 0}
              lastEvent={journey.events.at(-1)?.eventType}
              lastEventAt={journey.events.at(-1)?.createdAt.toISOString()}
            />
            {showAgentSetup ? (
              <details className="text-sm">
                <summary className="app-focus w-fit cursor-pointer rounded-sm font-medium text-warning underline-offset-4 hover:underline">
                  How to connect the agent
                </summary>
                <p className="mt-2 max-w-prose leading-6 text-muted-foreground">
                  Ask your workspace owner to enable <code className="break-all text-foreground">{setting}</code> on the
                  Appraise server. Your brief stays saved here.
                </p>
              </details>
            ) : null}
          </div>
          {managedActive && ['ANALYSIS', 'ANALYSIS_REVIEW'].includes(stage) ? (
            <AnalysisRecoveryControl journeyId={journeyId} />
          ) : null}
          {paused && execution.cycles.some(c => ['RUNNING', 'RESERVED', 'CANCELLING'].includes(c.status)) ? (
            <p className="rounded-lg border border-warning-border bg-warning-surface p-3 text-sm text-warning">
              A test run is still stopping.
            </p>
          ) : null}
          {legacy && !presentation.hasClosureReceipt ? (
            <section id="hosting" aria-label="Managed hosting ownership">
              <ManagedJourneyOwnershipControl journeyId={journeyId} projectId={project.id} />
            </section>
          ) : null}
          {!paused && !legacy && journey.blockers.length > 0 ? <BlockerCard blockers={journey.blockers} /> : null}
          {!paused && !legacy ? (
            <JourneyCurrentWork detail={detail} presentation={presentation} projectId={project.id} closure={closure} />
          ) : null}
        </section>
        <JourneyHistory detail={detail} projectId={project.id} closed={presentation.hasClosureReceipt} />
      </div>
    </JourneyStatusObservationProvider>
  )
}

function BlockerCard({
  blockers,
}: {
  blockers: Array<{
    id: string
    reasonCode: string
    summary: string
    requiredResolution: string
    responsibleActor: string
    safeResumeCommand: string
  }>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CircleAlert aria-hidden="true" className="size-4 text-warning" />
          What needs attention
        </CardTitle>
      </CardHeader>
      <CardContent>
        {blockers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active blockers.</p>
        ) : (
          <ul className="space-y-3">
            {blockers.map(blocker => (
              <li className="rounded-lg border border-warning-border bg-warning-surface p-3" key={blocker.id}>
                <p className="text-sm font-medium">{blocker.summary}</p>
                <p className="mt-2 text-xs text-muted-foreground">How to resolve it: {blocker.requiredResolution}</p>
                <details className="mt-2 text-muted-foreground">
                  <summary className="cursor-pointer text-xs">Technical details</summary>
                  <p className="mt-1 font-mono text-[11px] text-warning">{blocker.reasonCode}</p>
                  <p className="mt-1 text-xs">Responsible actor: {blocker.responsibleActor}</p>
                  <p className="mt-1 break-all font-mono text-[11px]">
                    Canonical resumption: {blocker.safeResumeCommand}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function Timeline({ events }: { events: Array<{ id: string; sequence: number; eventType: string; createdAt: Date }> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
          Activity history
        </CardTitle>
        <CardDescription>Completed steps and supporting lifecycle evidence.</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events have been recorded.</p>
        ) : (
          <ol className="space-y-3">
            {events.map(event => (
              <li className="border-l border-border pl-3" key={event.id}>
                <p className="text-sm font-medium">{qualityJourneyLabel(event.eventType)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{event.createdAt.toLocaleString()}</p>
                <details className="mt-1 text-muted-foreground">
                  <summary className="cursor-pointer text-[11px]">Technical details</summary>
                  <p className="mt-1 break-all font-mono text-[11px]">
                    Event {event.sequence} · {event.id}
                  </p>
                </details>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
