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
import { getQualityJourneyAnalysis } from '@/services/coordinator/quality-journey-analysis-service'
import { getQualityJourney } from '@/services/coordinator/quality-journey-service'
import { getQualityJourneyScenarioPortfolio } from '@/services/coordinator/quality-journey-scenario-service'
import { getQualityJourneyAutomationContext } from '@/services/coordinator/quality-journey-automation-service'
import { getQualityJourneyExecution } from '@/services/coordinator/quality-journey-execution-service'
import prisma from '@/config/db-config'
import { JourneyExecutionStatus } from './journey-execution-status'
import { ServiceError } from '@/services/shared/errors'

import { AnalysisReviewControls } from './analysis-review-controls'
import { AutomationMaterializationStatus } from './automation-materialization-status'
import { ScenarioPortfolioReview } from './scenario-portfolio-review'
import { qualityJourneyLabel, toAnalysisRevisionView } from './quality-journey-view-model'

type PageProps = { params: Promise<{ journeyId: string }>; searchParams?: Promise<{ project?: string }> }
type JourneyDetail = Awaited<ReturnType<typeof getQualityJourney>>
type ActiveProject = Awaited<ReturnType<typeof requireActiveProject>>
type ActiveAnalysis = ReturnType<typeof toAnalysisRevisionView> | null
type ActiveScenarioPortfolio = Awaited<ReturnType<typeof getQualityJourneyScenarioPortfolio>>['portfolio'] | null

async function loadJourneySupplementalArtifacts(journeyId: string, projectId: string, stage: string) {
  if (!['SCENARIO_DESIGN', 'SCENARIO_REVIEW', 'AUTOMATION'].includes(stage))
    return { scenarios: null, automation: null }
  const scenarios = await getQualityJourneyScenarioPortfolio({ journeyId, targetProjectId: projectId }).catch(
    () => null,
  )
  if (stage !== 'AUTOMATION') return { scenarios, automation: null }
  const automation = await getQualityJourneyAutomationContext({ journeyId, targetProjectId: projectId }).catch(
    () => null,
  )
  return { scenarios, automation }
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

  const [{ scenarios, automation }, execution, environments] = await Promise.all([
    loadJourneySupplementalArtifacts(journeyId, projectId, journey.journey.stage),
    getQualityJourneyExecution({ journeyId, targetProjectId: projectId }),
    prisma.environment.findMany({
      where: { targetProjectId: projectId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])
  return { activeAnalysis, activeRunner, answerable, journey, scenarios, automation, execution, environments }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { journeyId } = await params
  return { title: `Quality Journey ${journeyId}` }
}

export default async function QualityJourneyDetailPage({ params, searchParams }: PageProps) {
  const [{ journeyId }, parameters] = await Promise.all([params, searchParams])
  const project = await requireActiveProject(parameters?.project)
  const { activeAnalysis, activeRunner, answerable, journey, scenarios, automation, execution, environments } =
    await loadJourneyDetail(journeyId, project.id)

  return (
    <main className="space-y-6 pb-10">
      <JourneyHeader journey={journey} project={project} />
      <JourneyOverview activeRunner={activeRunner} journey={journey} />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(20rem,0.85fr)]">
        <div className="space-y-6">
          <AnalysisDocument analysis={activeAnalysis} />
          <ScenarioPortfolioReview
            journeyId={journey.journey.journeyId}
            portfolio={scenarios?.portfolio ?? null}
            stage={journey.journey.stage}
            stateHash={journey.journey.stateHash}
          />
          <AutomationMaterializationStatus context={automation} />
          <JourneyExecutionStatus
            execution={execution}
            journeyId={journeyId}
            targetProjectId={project.id}
            stateHash={journey.journey.stateHash}
            stage={journey.journey.stage}
            environments={environments}
            capsuleIds={
              automation?.materializations
                .filter(item => item.status === 'MATERIALIZED' && item.preparedCapsule)
                .map(item => item.preparedCapsule!.id) ?? []
            }
          />
          <AnalysisReviewControls
            analysis={activeAnalysis}
            answerable={answerable}
            journeyId={journey.journey.journeyId}
            stage={journey.journey.stage}
            stateHash={journey.journey.stateHash}
            analysisReviewHash={journey.journey.analysisReviewHash}
            unresolvedQuestionIds={journey.journey.unresolvedQuestionIds}
          />
        </div>
        <JourneySidebar activeAnalysis={activeAnalysis} journey={journey} scenarios={scenarios?.portfolio ?? null} />
      </section>
    </main>
  )
}

function JourneyHeader({ journey, project }: { journey: JourneyDetail; project: ActiveProject }) {
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
              Quality Journey
            </span>
          </PageHeader>
          <HeaderSubtitle>
            Appraise-owned workflow state for {project.displayName}. Review exact artifacts; the Runner performs
            publication.
          </HeaderSubtitle>
        </div>
        <Badge className="capitalize" variant="outline">
          {qualityJourneyLabel(journey.journey.stage)}
        </Badge>
      </div>
      <p className="break-all font-mono text-[11px] text-muted-foreground">Journey ID: {journey.journey.journeyId}</p>
    </header>
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
  scenarios,
}: {
  activeAnalysis: ActiveAnalysis
  journey: JourneyDetail
  scenarios: ActiveScenarioPortfolio
}) {
  const questionCount = journey.journey.unresolvedQuestionIds.length
  const pendingAnalysisDecision = journey.journey.stage === 'ANALYSIS_REVIEW' && !activeAnalysis?.decision
  const pendingScenarioDecision =
    journey.journey.stage === 'SCENARIO_REVIEW' &&
    Boolean(scenarios?.reviewHash) &&
    Boolean(scenarios?.scenarios.some(scenario => !scenario.decisions.length))

  return (
    <aside className="space-y-6">
      <PendingUserDecisions
        pendingAnalysisDecision={pendingAnalysisDecision}
        pendingScenarioDecision={pendingScenarioDecision}
        questionCount={questionCount}
      />
      <BlockerCard blockers={journey.blockers} />
      <Timeline events={journey.events} />
    </aside>
  )
}

function PendingUserDecisions({
  pendingAnalysisDecision,
  pendingScenarioDecision,
  questionCount,
}: {
  pendingAnalysisDecision: boolean
  pendingScenarioDecision: boolean
  questionCount: number
}) {
  const hasPendingDecision = pendingAnalysisDecision || pendingScenarioDecision
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
            Analysis Charter
          </CardTitle>
          <CardDescription>The assigned Requirement Analyzer has not produced a charter yet.</CardDescription>
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
              Analysis Charter
            </CardTitle>
            <CardDescription>
              Revision {analysis.revision} · stable downstream requirement IDs are shown below.
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
        <HashRow label="Analysis revision ID" value={analysis.analysisRevisionId} />
        <HashRow label="Content hash" value={analysis.contentHash} />
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
                <p className="break-all font-mono text-[11px] text-primary">{requirement.requirementId}</p>
                <p className="mt-2 text-sm leading-6">{requirement.statement}</p>
                {requirement.sourceRefs.length ? (
                  <p className="mt-2 text-xs text-muted-foreground">Sources: {requirement.sourceRefs.join(', ')}</p>
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
                <p className="break-all font-mono text-[11px] text-primary">
                  {obligation.obligationId} → {obligation.requirementId}
                </p>
                <p className="mt-2 text-sm leading-6">{obligation.statement}</p>
                <p className="mt-2 text-xs text-muted-foreground">Signals: {obligation.acceptanceSignals.join(', ')}</p>
              </li>
            ))}
          </ul>
        </section>
        <section className="grid gap-4 lg:grid-cols-3">
          <DocumentList heading="Constraints" items={analysis.constraints} empty="No constraints recorded." />
          <DocumentList heading="Assumptions" items={analysis.assumptions} empty="No assumptions recorded." />
          <DocumentList heading="Risks" items={analysis.risks} empty="No risks recorded." />
        </section>
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
  blockers: Array<{ id: string; reasonCode: string; summary: string; requiredResolution: string }>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CircleAlert aria-hidden="true" className="size-4 text-primary" />
          Current blockers
        </CardTitle>
      </CardHeader>
      <CardContent>
        {blockers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active blockers.</p>
        ) : (
          <ul className="space-y-3">
            {blockers.map(blocker => (
              <li className="rounded-md border border-amber-500/20 bg-amber-500/[0.06] p-3" key={blocker.id}>
                <p className="font-mono text-[11px] text-amber-200">{blocker.reasonCode}</p>
                <p className="mt-2 text-sm">{blocker.summary}</p>
                <p className="mt-2 text-xs text-muted-foreground">Resolution: {blocker.requiredResolution}</p>
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
          Journey timeline
        </CardTitle>
        <CardDescription>Append-only lifecycle events.</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events have been recorded.</p>
        ) : (
          <ol className="space-y-3">
            {events.map(event => (
              <li className="border-l border-white/[0.14] pl-3" key={event.id}>
                <p className="text-sm font-medium">{qualityJourneyLabel(event.eventType)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  #{event.sequence} · {event.createdAt.toLocaleString()}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
