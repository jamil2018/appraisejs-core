import { ClosurePanel } from './closure-panel'
import { CoordinatorHandoffPanel } from './coordinator-handoff-panel'
import { getQualityJourneyClosure } from '@/services/coordinator/quality-journey-closure-service'
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, CircleAlert, ClipboardCheck, GitBranch, ShieldCheck, UserRoundCheck } from 'lucide-react'
import { notFound } from 'next/navigation'

import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireActiveProject } from '@/lib/active-project'
import {
  displayStageForQualityJourney,
  nextActionForQualityJourney,
  qualityJourneyRequirementSummary,
} from '@/lib/quality-journey/presentation'
import { getQualityJourneyAnalysis } from '@/services/coordinator/quality-journey-analysis-service'
import { getQualityJourney } from '@/services/coordinator/quality-journey-service'
import { getQualityJourneyScenarioPortfolio } from '@/services/coordinator/quality-journey-scenario-service'
import { getQualityJourneyAutomationContext } from '@/services/coordinator/quality-journey-automation-service'
import { getQualityJourneyExecution } from '@/services/coordinator/quality-journey-execution-service'
import { inspectQualityJourneyHandoff } from '@/services/coordinator/quality-journey-handoff-service'
import { getQualityJourneyTriage } from '@/services/coordinator/quality-journey-triage-service'
import prisma from '@/config/db-config'
import { JourneyExecutionStatus } from './journey-execution-status'
import { ServiceError } from '@/services/shared/errors'

import { AnalysisReviewControls } from './analysis-review-controls'
import { AutomationMaterializationStatus } from './automation-materialization-status'
import { JourneyAnchorNavigation } from './journey-anchor-navigation'
import { JourneyProgressNotice } from './journey-progress-notice'
import { JourneyProgress } from './journey-progress'
import { JourneyStatusObservationProvider } from './journey-status-observation'
import { ScenarioPortfolioReview } from './scenario-portfolio-review'
import { TriageReportPanel } from './triage-report-panel'
import { qualityJourneyLabel, toAnalysisRevisionView } from './quality-journey-view-model'

type PageProps = { params: Promise<{ journeyId: string }>; searchParams?: Promise<{ project?: string }> }
type JourneyDetail = Awaited<ReturnType<typeof getQualityJourney>>
type ActiveProject = Awaited<ReturnType<typeof requireActiveProject>>
type ActiveAnalysis = ReturnType<typeof toAnalysisRevisionView> | null
type ActiveScenarioPortfolio = Awaited<ReturnType<typeof getQualityJourneyScenarioPortfolio>>['portfolio'] | null

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
    <Button asChild variant="outline">
      <Link
        href={`/quality-journeys/new?project=${encodeURIComponent(projectId)}&predecessor=${encodeURIComponent(journeyId)}`}
      >
        Start linked follow-up journey
      </Link>
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
  const automationContext = automationStages.includes(stage)
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
  const activeRunner = journey.runner.find(
    node => node.stage === journey.journey.stage && ['RUNNABLE', 'IN_PROGRESS', 'BLOCKED'].includes(node.state),
  )

  const [{ scenarios, automation }, execution, triage, handoff, environments, attempts, requirement] =
    await Promise.all([
      loadJourneySupplementalArtifacts(journeyId, projectId, journey.journey.stage),
      getQualityJourneyExecution({ journeyId, targetProjectId: projectId }),
      getQualityJourneyTriage({ journeyId, targetProjectId: projectId }),
      inspectQualityJourneyHandoff({ journeyId, targetProjectId: projectId }),
      prisma.environment.findMany({
        where: { targetProjectId: projectId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.qualityJourneyWorkAttempt.findMany({
        where: { workItem: { journeyId, targetProjectId: projectId } },
        select: { id: true, workItemId: true, attempt: true, status: true, startedAt: true, completedAt: true },
        orderBy: [{ workItemId: 'asc' }, { attempt: 'asc' }],
      }),
      prisma.qualityJourneyRevision.findFirst({
        where: { journeyId },
        orderBy: { revision: 'asc' },
        select: { contentJson: true },
      }),
    ])
  return {
    activeAnalysis,
    activeRunner,
    answerable,
    journey,
    scenarios,
    automation,
    execution,
    triage,
    handoff: handoff.handoff,
    environments,
    attempts,
    requirementSummary: requirement
      ? qualityJourneyRequirementSummary(requirement.contentJson)
      : 'Requirement snapshot unavailable',
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
  return {
    portfolio,
    pendingAnalysisDecision: detail.journey.journey.stage === 'ANALYSIS_REVIEW' && !detail.activeAnalysis?.decision,
    pendingReportDecision: detail.journey.journey.stage === 'REPORT_REVIEW',
    pendingScenarioDecision:
      detail.journey.journey.stage === 'SCENARIO_REVIEW' &&
      Boolean(portfolio?.reviewHash) &&
      Boolean(portfolio?.scenarios.some(scenario => !scenario.decisions.length)),
    requestedExecutionConsentCount: detail.execution.consents.filter(consent => consent.status === 'REQUESTED').length,
    showCoordinatorHandoff: ['INTAKE', 'ANALYSIS', 'ANALYSIS_REVIEW'].includes(detail.journey.journey.stage),
    hasObservedWorkerProgress: Boolean(detail.activeAnalysis),
    hasClosureReceipt: Boolean(closure.receipt),
    capsuleIds: materializations.flatMap(item =>
      item.status === 'MATERIALIZED' && item.preparedCapsule ? [item.preparedCapsule.id] : [],
    ),
  }
}

export default async function QualityJourneyDetailPage({ params, searchParams }: PageProps) {
  const [{ journeyId }, parameters] = await Promise.all([params, searchParams])
  const project = await requireActiveProject(parameters ? parameters.project : undefined)
  const [detail, closure] = await Promise.all([
    loadJourneyDetail(journeyId, project.id),
    getQualityJourneyClosure({ journeyId, targetProjectId: project.id }),
  ])
  const {
    activeAnalysis,
    activeRunner,
    answerable,
    journey,
    automation,
    execution,
    triage,
    handoff,
    environments,
    attempts,
    requirementSummary,
  } = detail
  const presentation = detailPresentation(detail, closure)

  return (
    <JourneyStatusObservationProvider
      journeyId={journeyId}
      stage={journey.journey.stage}
      stateHash={journey.journey.stateHash}
    >
      <main className="space-y-6 pb-10">
        <JourneyHeader journey={journey} project={project} requirementSummary={requirementSummary} />
        <JourneyNextAction
          blockerCount={journey.blockers.length}
          hasObservedWorkerProgress={presentation.hasObservedWorkerProgress}
          handoffStatus={handoff?.status}
          journeyId={journeyId}
          pendingAnalysisDecision={presentation.pendingAnalysisDecision}
          pendingReportDecision={presentation.pendingReportDecision}
          pendingScenarioDecision={presentation.pendingScenarioDecision}
          projectId={project.id}
          requestedExecutionConsentCount={presentation.requestedExecutionConsentCount}
          stage={journey.journey.stage}
          unresolvedRequiredQuestionCount={journey.journey.unresolvedQuestionIds.length}
        />
        <section id="overview" tabIndex={-1}>
          <JourneyOverview activeRunner={activeRunner} journey={journey} />
        </section>
        <JourneyAnchorNavigation journeyId={journeyId} projectId={project.id} stage={journey.journey.stage} />
        <JourneyProgressNotice
          eventCount={journey.events.length}
          stateHash={journey.journey.stateHash}
          stage={journey.journey.stage}
        />
        <nav className="flex flex-wrap gap-3" aria-label="Journey artifact actions">
          <Button asChild variant="outline">
            <Link href={`/quality-journeys/${journeyId}/artifacts?project=${encodeURIComponent(project.id)}`}>
              Artifact library and export
            </Link>
          </Button>
          <LinkedFollowUpAction journeyId={journeyId} projectId={project.id} visible={presentation.hasClosureReceipt} />
        </nav>
        <section id="gates" tabIndex={-1}>
          <ClosurePanel
            key={closure.reportHash ?? journeyId}
            journeyId={journeyId}
            stateHash={journey.journey.stateHash}
            closure={closure}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(20rem,0.85fr)]">
          <div className="space-y-6">
            <section id="progress" tabIndex={-1}>
              <JourneyProgress
                attempts={attempts}
                closure={closure}
                execution={execution}
                journey={journey}
                triage={triage}
              />
            </section>
            <section id="analysis" tabIndex={-1}>
              {presentation.showCoordinatorHandoff ? (
                <div className="mb-6">
                  <CoordinatorHandoffPanel
                    handoff={handoff}
                    hasObservedWorkerProgress={presentation.hasObservedWorkerProgress}
                    journeyId={journeyId}
                  />
                </div>
              ) : null}
              <AnalysisDocument analysis={activeAnalysis} />
              <AnalysisReviewControls
                analysis={activeAnalysis}
                answerable={answerable}
                journeyId={journey.journey.journeyId}
                stage={journey.journey.stage}
                stateHash={journey.journey.stateHash}
                analysisReviewHash={journey.journey.analysisReviewHash}
                unresolvedQuestionIds={journey.journey.unresolvedQuestionIds}
              />
            </section>
            <section id="scenarios" tabIndex={-1}>
              <ScenarioPortfolioReview
                journeyId={journey.journey.journeyId}
                portfolio={presentation.portfolio}
                stage={journey.journey.stage}
                stateHash={journey.journey.stateHash}
              />
            </section>
            <section id="automation" tabIndex={-1}>
              <AutomationMaterializationStatus context={automation} />
            </section>
            <section id="execution" tabIndex={-1}>
              <JourneyExecutionStatus
                execution={execution}
                journeyId={journeyId}
                targetProjectId={project.id}
                stateHash={journey.journey.stateHash}
                stage={journey.journey.stage}
                environments={environments}
                capsuleIds={presentation.capsuleIds}
              />
            </section>
            <section id="triage" tabIndex={-1}>
              <TriageReportPanel
                journeyId={journeyId}
                stage={journey.journey.stage}
                stateHash={journey.journey.stateHash}
                triage={triage}
              />
            </section>
          </div>
          <div id="activity" tabIndex={-1}>
            <JourneySidebar
              activeAnalysis={activeAnalysis}
              journey={journey}
              requestedExecutionConsentCount={presentation.requestedExecutionConsentCount}
              scenarios={presentation.portfolio}
            />
          </div>
        </section>
      </main>
    </JourneyStatusObservationProvider>
  )
}

function JourneyHeader({
  journey,
  project,
  requirementSummary,
}: {
  journey: JourneyDetail
  project: ActiveProject
  requirementSummary: string
}) {
  return (
    <header className="space-y-4">
      <Button asChild size="sm" variant="ghost">
        <Link href={`/quality-journeys?project=${encodeURIComponent(project.id)}`}>
          <ArrowLeft aria-hidden="true" className="mr-2 size-4" />
          Quality Journeys
        </Link>
      </Button>
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div className="space-y-2">
          <PageHeader>
            <span className="flex items-center gap-3">
              <GitBranch aria-hidden="true" className="size-7 text-primary sm:size-8" />
              Testing journey
            </span>
          </PageHeader>
          <HeaderSubtitle>{requirementSummary}</HeaderSubtitle>
        </div>
        <Badge variant="outline">{displayStageForQualityJourney(journey.journey.stage).label}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">Testing work for {project.displayName}.</p>
      <details className="text-muted-foreground">
        <summary className="cursor-pointer text-[11px]">Technical details</summary>
        <p className="mt-1 break-all font-mono text-[11px]">Journey ID: {journey.journey.journeyId}</p>
      </details>
    </header>
  )
}

function JourneyNextAction({
  blockerCount,
  hasObservedWorkerProgress,
  handoffStatus,
  journeyId,
  pendingAnalysisDecision,
  pendingReportDecision,
  pendingScenarioDecision,
  projectId,
  requestedExecutionConsentCount,
  stage,
  unresolvedRequiredQuestionCount,
}: {
  blockerCount: number
  hasObservedWorkerProgress: boolean
  handoffStatus?: string
  journeyId: string
  pendingAnalysisDecision: boolean
  pendingReportDecision: boolean
  pendingScenarioDecision: boolean
  projectId: string
  requestedExecutionConsentCount: number
  stage: string
  unresolvedRequiredQuestionCount: number
}) {
  const action = nextActionForQualityJourney({
    stage,
    blockerCount,
    hasObservedWorkerProgress,
    handoffStatus,
    unresolvedRequiredQuestionCount,
    pendingAnalysisDecision,
    pendingScenarioDecision,
    pendingReportDecision,
    requestedExecutionConsentCount,
  })
  const href = `/quality-journeys/${encodeURIComponent(journeyId)}?project=${encodeURIComponent(projectId)}#${action.destination}`
  return (
    <Card className="border-primary/30 bg-primary/[0.05]">
      <CardHeader>
        <CardDescription>Next action</CardDescription>
        <CardTitle className="text-lg">{action.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{action.description}</p>
        <Button asChild>
          <Link href={href}>{action.actionLabel}</Link>
        </Button>
        {action.alsoNeedsAttention.length ? (
          <div className="text-sm">
            <p className="font-medium">Also needs attention</p>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              {action.alsoNeedsAttention.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function JourneyOverview({
  activeRunner,
  journey,
}: {
  activeRunner: JourneyDetail['runner'][number] | undefined
  journey: JourneyDetail
}) {
  const questionCount = journey.journey.unresolvedQuestionIds.length
  const blockerCount = journey.blockers.length

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Journey overview">
      <SummaryCard label="Stage" value={qualityJourneyLabel(journey.journey.stage)} />
      <SummaryCard
        label="Active role"
        value={activeRunner ? qualityJourneyLabel(activeRunner.role) : 'Awaiting a role'}
      />
      <SummaryCard
        label="Open required questions"
        tone={questionCount ? 'warning' : 'default'}
        value={String(questionCount)}
      />
      <SummaryCard label="Active blockers" tone={blockerCount ? 'warning' : 'default'} value={String(blockerCount)} />
    </section>
  )
}

function JourneySidebar({
  activeAnalysis,
  journey,
  requestedExecutionConsentCount,
  scenarios,
}: {
  activeAnalysis: ActiveAnalysis
  journey: JourneyDetail
  requestedExecutionConsentCount: number
  scenarios: ActiveScenarioPortfolio
}) {
  const questionCount = journey.journey.unresolvedQuestionIds.length
  const pendingAnalysisDecision = journey.journey.stage === 'ANALYSIS_REVIEW' && !activeAnalysis?.decision
  const pendingReportReview = journey.journey.stage === 'REPORT_REVIEW'
  const pendingScenarioDecision =
    journey.journey.stage === 'SCENARIO_REVIEW' &&
    Boolean(scenarios?.reviewHash) &&
    Boolean(scenarios?.scenarios.some(scenario => !scenario.decisions.length))

  return (
    <aside className="space-y-6">
      <PendingUserDecisions
        pendingAnalysisDecision={pendingAnalysisDecision}
        pendingReportReview={pendingReportReview}
        pendingScenarioDecision={pendingScenarioDecision}
        questionCount={questionCount}
        requestedExecutionConsentCount={requestedExecutionConsentCount}
      />
      <BlockerCard blockers={journey.blockers} />
      <Timeline events={journey.events} />
    </aside>
  )
}

function PendingUserDecisions({
  pendingAnalysisDecision,
  pendingReportReview,
  pendingScenarioDecision,
  questionCount,
  requestedExecutionConsentCount,
}: {
  pendingAnalysisDecision: boolean
  pendingReportReview: boolean
  pendingScenarioDecision: boolean
  questionCount: number
  requestedExecutionConsentCount: number
}) {
  const hasPendingDecision =
    pendingAnalysisDecision || pendingScenarioDecision || pendingReportReview || requestedExecutionConsentCount > 0
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserRoundCheck aria-hidden="true" className="size-4 text-primary" />
          Pending user decisions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {pendingAnalysisDecision ? (
          <p>Review the current published analysis revision or request a revision with durable feedback.</p>
        ) : null}
        {pendingScenarioDecision ? (
          <p>Review the pending Scenario Portfolio decisions; existing durable scenario decisions are preserved.</p>
        ) : null}
        {pendingReportReview ? <p>Review the current full report and record the canonical report decision.</p> : null}
        {requestedExecutionConsentCount ? (
          <p>
            {requestedExecutionConsentCount} requested execution consent
            {requestedExecutionConsentCount === 1 ? ' requires' : 's require'} a human decision.
          </p>
        ) : null}
        {questionCount ? (
          <p>
            {questionCount} required question{questionCount === 1 ? '' : 's'} must be resolved before approval.
          </p>
        ) : null}
        {!hasPendingDecision && questionCount === 0 ? (
          <p className="text-muted-foreground">No user decision is currently pending.</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function SummaryCard({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'warning'
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardDescription>{label}</CardDescription>
        <CardTitle className={tone === 'warning' ? 'text-amber-200' : 'capitalize'}>{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}

function AnalysisDocument({ analysis }: { analysis: ReturnType<typeof toAnalysisRevisionView> | null }) {
  if (!analysis) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck aria-hidden="true" className="size-4 text-primary" />
            Proposed test approach
          </CardTitle>
          <CardDescription>Appraise is preparing a test approach from your brief.</CardDescription>
        </CardHeader>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck aria-hidden="true" className="size-4 text-primary" />
              Proposed test approach
            </CardTitle>
            <CardDescription>
              Version {analysis.revision}. Scope, intended checks, assumptions, risks, and success signals for this
              version.
            </CardDescription>
          </div>
          <Badge variant="outline">
            {analysis.decision
              ? qualityJourneyLabel(analysis.decision.decision)
              : analysis.publication
                ? 'Published for review'
                : 'Draft'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <details className="text-muted-foreground">
          <summary className="cursor-pointer text-sm">Technical details</summary>
          <div className="mt-2 space-y-1">
            <HashRow label="Approach revision ID" value={analysis.analysisRevisionId} />
            <HashRow label="Content hash" value={analysis.contentHash} />
          </div>
        </details>
        <DocumentList heading="Objectives" items={analysis.objectives} />
        <section className="grid gap-4 lg:grid-cols-2">
          <DocumentList heading="In scope" items={analysis.scope.included} />
          <DocumentList heading="Excluded" items={analysis.scope.excluded} empty="No explicit exclusions." />
        </section>
        <section>
          <h2 className="text-sm font-semibold">Requirements</h2>
          <ul className="mt-3 space-y-3">
            {analysis.requirements.map(requirement => (
              <li
                className="rounded-md border border-white/[0.08] bg-white/[0.025] p-3"
                key={requirement.requirementId}
              >
                <p className="mt-2 text-sm leading-6">{requirement.statement}</p>
                {requirement.sourceRefs.length ? (
                  <details className="mt-2 text-muted-foreground">
                    <summary className="cursor-pointer text-xs">Technical details</summary>
                    <p className="mt-1 break-all font-mono text-[11px]">
                      Requirement {requirement.requirementId} · sources: {requirement.sourceRefs.join(', ')}
                    </p>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="text-sm font-semibold">Obligations and acceptance signals</h2>
          <ul className="mt-3 space-y-3">
            {analysis.obligations.map(obligation => (
              <li className="rounded-md border border-white/[0.08] bg-white/[0.025] p-3" key={obligation.obligationId}>
                <p className="mt-2 text-sm leading-6">{obligation.statement}</p>
                <p className="mt-2 text-xs text-muted-foreground">Signals: {obligation.acceptanceSignals.join(', ')}</p>
                <details className="mt-2 text-muted-foreground">
                  <summary className="cursor-pointer text-xs">Technical details</summary>
                  <p className="mt-1 break-all font-mono text-[11px]">
                    {obligation.obligationId} → {obligation.requirementId}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        </section>
        <section className="grid gap-4 lg:grid-cols-3">
          <DocumentList heading="Constraints" items={analysis.constraints} empty="No constraints recorded." />
          <DocumentList heading="Assumptions" items={analysis.assumptions} empty="No assumptions recorded." />
          <DocumentList heading="Risks" items={analysis.risks} empty="No risks recorded." />
        </section>
        <DocumentList
          heading="How we will know it works"
          items={analysis.acceptanceSignals}
          empty="No additional success signals were recorded."
        />
      </CardContent>
    </Card>
  )
}

function HashRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="break-all font-mono text-[11px] text-muted-foreground">
      {label}: {value}
    </p>
  )
}

function DocumentList({
  heading,
  items,
  empty = 'None recorded.',
}: {
  heading: string
  items: string[]
  empty?: string
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold">{heading}</h2>
      {items.length ? (
        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
          {items.map(item => (
            <li className="rounded-md border border-white/[0.08] bg-white/[0.025] p-2" key={item}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
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
          <CircleAlert aria-hidden="true" className="size-4 text-primary" />
          What needs attention
        </CardTitle>
      </CardHeader>
      <CardContent>
        {blockers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active blockers.</p>
        ) : (
          <ul className="space-y-3">
            {blockers.map(blocker => (
              <li className="rounded-md border border-amber-500/20 bg-amber-500/[0.06] p-3" key={blocker.id}>
                <p className="text-sm">{blocker.summary}</p>
                <p className="mt-2 text-xs text-muted-foreground">How to resolve it: {blocker.requiredResolution}</p>
                <details className="mt-2 text-muted-foreground">
                  <summary className="cursor-pointer text-xs">Technical details</summary>
                  <p className="mt-1 font-mono text-[11px] text-amber-200">{blocker.reasonCode}</p>
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
              <li className="border-l border-white/[0.14] pl-3" key={event.id}>
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
