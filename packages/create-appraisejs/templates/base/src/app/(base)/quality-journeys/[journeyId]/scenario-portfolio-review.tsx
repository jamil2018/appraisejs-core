'use client'

import { Network } from 'lucide-react'
import { Background, Controls, ReactFlow, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'

import {
  commentQualityJourneyScenarioPortfolioAction,
  decideQualityJourneyScenariosAction,
  disposeQualityJourneyScenarioCommentAction,
  requestQualityJourneyScenarioRevisionAction,
} from '../quality-journey-actions'

type Portfolio = {
  artifactId: string
  artifactRevisionId: string
  contentHash: string
  behavioralIntentHash: string
  enrichmentHash: string
  layoutHash: string
  coverageRationale: string
  graphJson: string
  reviewHash: string | null
  scenarios: Array<{
    stableScenarioId: string
    scenarioRevisionId: string
    behavioralIntentJson: string
    enrichmentJson: string
    layoutJson: string
    decisions: Array<{ decision: string }>
  }>
  comments: Array<{
    id: string
    scenarioRevisionId: string | null
    comment: string
    blocking: boolean
    disposition: string
  }>
}
type Scenario = Portfolio['scenarios'][number]

function read(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return {}
  }
}
const list = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

/** Read-only graph projection: the canonical records remain the sole authority;
 * coordinates and feasibility are shown separately from reviewed behavior. */
const actionId = (prefix: string) => `${prefix}:${crypto.randomUUID()}`

function SharedSetupList({ setup }: { setup: unknown }) {
  if (!Array.isArray(setup) || !setup.length) return null
  return (
    <section aria-label="Shared scenario setup" className="rounded-md border p-3 text-sm">
      <p className="font-medium">Shared setup</p>
      <ul className="mt-1 list-disc pl-5 text-muted-foreground">
        {setup.map((item, index) => {
          const value = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
          const label = typeof value.label === 'string' ? value.label : `Setup ${index + 1}`
          return <li key={typeof value.setupId === 'string' ? value.setupId : `${label}:${index}`}>{label}</li>
        })}
      </ul>
    </section>
  )
}

function ScenarioReviewCard({
  scenario,
  review,
  onDecide,
  onAddComment,
}: {
  scenario: Scenario
  review: { isPending: boolean; hasFeedback: boolean; hasComment: boolean } | null
  onDecide: (scenarioRevisionId: string, decision: 'APPROVED' | 'REJECTED') => void
  onAddComment: (scenarioRevisionId: string) => void
}) {
  return (
    <article className="rounded-md border p-3">
      <div className="flex justify-between gap-2">
        <p className="font-mono text-xs text-primary">{scenario.stableScenarioId}</p>
        <Badge variant="outline">{scenario.decisions[0]?.decision ?? 'Pending review'}</Badge>
      </div>
      <ScenarioMetadata scenario={scenario} />
      {review && !scenario.decisions.length ? (
        <ScenarioDecisionControls
          hasComment={review.hasComment}
          hasFeedback={review.hasFeedback}
          isPending={review.isPending}
          onAddComment={onAddComment}
          onDecide={onDecide}
          scenarioRevisionId={scenario.scenarioRevisionId}
        />
      ) : null}
    </article>
  )
}

function ScenarioMetadata({ scenario }: { scenario: Scenario }) {
  const intent = read(scenario.behavioralIntentJson)
  const enrichment = read(scenario.enrichmentJson)
  const layout = read(scenario.layoutJson)
  return (
    <>
      <p className="mt-2 text-sm font-medium">
        {typeof intent.title === 'string' ? intent.title : 'Scenario intent unavailable'}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Requirements: {list(intent.requirementIds).join(', ') || 'Exploratory'}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{String(intent.narrative ?? '')}</p>
      {typeof intent.exploratoryRationale === 'string' ? (
        <p className="mt-1 text-xs text-muted-foreground">Exploratory rationale: {intent.exploratoryRationale}</p>
      ) : null}
      <p className="mt-1 text-xs text-muted-foreground">Signals: {list(intent.expectedSignals).join(', ')}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Steps:{' '}
        {Array.isArray(intent.steps)
          ? intent.steps
              .flatMap(step => {
                const action =
                  typeof step === 'object' && step ? String((step as Record<string, unknown>).action ?? '') : ''
                return action ? [action] : []
              })
              .join(' → ')
          : ''}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">Scout facts: {list(enrichment.observationIds).join(', ')}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Resource assumptions: {list(enrichment.resourceAssumptionIds).join(', ')}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Feasibility notes: {list(enrichment.feasibilityNotes).join(', ')}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Sequence {String(layout.sequence ?? '?')} · Graph position: {String(layout.x ?? '?')}, {String(layout.y ?? '?')}
      </p>
    </>
  )
}

function ScenarioDecisionControls({
  scenarioRevisionId,
  isPending,
  hasFeedback,
  hasComment,
  onDecide,
  onAddComment,
}: {
  scenarioRevisionId: string
  isPending: boolean
  hasFeedback: boolean
  hasComment: boolean
  onDecide: (scenarioRevisionId: string, decision: 'APPROVED' | 'REJECTED') => void
  onAddComment: (scenarioRevisionId: string) => void
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button disabled={isPending} onClick={() => onDecide(scenarioRevisionId, 'APPROVED')} size="sm">
        Approve exact scenario
      </Button>
      <Button
        disabled={isPending || !hasFeedback}
        onClick={() => onDecide(scenarioRevisionId, 'REJECTED')}
        size="sm"
        variant="outline"
      >
        Reject with feedback
      </Button>
      <Button
        disabled={isPending || !hasComment}
        onClick={() => onAddComment(scenarioRevisionId)}
        size="sm"
        variant="ghost"
      >
        Add comment
      </Button>
    </div>
  )
}

type ScenarioDependency = { source: string; target: string; relation: string }

function scenarioFlow(orderedScenarios: Portfolio['scenarios'], graphJson: string) {
  const nodes: Node[] = orderedScenarios.map(scenario => {
    const intent = read(scenario.behavioralIntentJson)
    const layout = read(scenario.layoutJson)
    return {
      id: scenario.scenarioRevisionId,
      position: { x: Number(layout.x) || 0, y: Number(layout.y) || 0 },
      data: { label: typeof intent.title === 'string' ? intent.title : scenario.stableScenarioId },
      draggable: false,
      selectable: false,
    }
  })
  const graph = read(graphJson)
  const dependencies: ScenarioDependency[] = Array.isArray(graph.edges)
    ? graph.edges.flatMap(edge => {
        if (!edge || typeof edge !== 'object') return []
        const value = edge as Record<string, unknown>
        const source = value.sourceScenarioRevisionId
        const target = value.targetScenarioRevisionId
        if (typeof source !== 'string' || typeof target !== 'string') return []
        return [{ source, target, relation: String(value.relation ?? '') }]
      })
    : []
  const edges: Edge[] = dependencies.map((dependency, index) => ({
    id: `${dependency.source}:${dependency.target}:${index}`,
    source: dependency.source,
    target: dependency.target,
    label: dependency.relation,
  }))
  return { nodes, edges, dependencies, sharedSetup: graph.sharedSetup }
}

function ScenarioDependencyList({
  dependencies,
  scenarios,
}: {
  dependencies: ScenarioDependency[]
  scenarios: Portfolio['scenarios']
}) {
  const labels = new Map(
    scenarios.map(scenario => {
      const intent = read(scenario.behavioralIntentJson)
      return [scenario.scenarioRevisionId, typeof intent.title === 'string' ? intent.title : scenario.stableScenarioId]
    }),
  )
  return (
    <section aria-label="Linear scenario dependency view" className="space-y-2 rounded-md border p-3">
      <h3 className="text-sm font-semibold">Linear scenario dependency view</h3>
      <p className="text-xs text-muted-foreground">
        Keyboard-equivalent reading order for the visual graph. Each relationship names its source, target, and kind.
      </p>
      {dependencies.length ? (
        <ol className="space-y-2 text-sm">
          {dependencies.map((dependency, index) => (
            <li
              className="rounded-md border border-white/[0.08] p-2"
              key={`${dependency.source}:${dependency.target}:${index}`}
              tabIndex={0}
            >
              <span className="font-medium">{labels.get(dependency.source) ?? dependency.source}</span>
              <span className="px-1 text-muted-foreground">— {dependency.relation || 'depends on'} →</span>
              <span className="font-medium">{labels.get(dependency.target) ?? dependency.target}</span>
              <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                {dependency.source} → {dependency.target}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">No explicit dependencies are recorded between these scenarios.</p>
      )}
    </section>
  )
}

type ScenarioReviewState = {
  canReview: boolean
  isPending: boolean
  feedback: string
  comment: string
  blocking: boolean
  error: string | null
  pendingScenarioRevisionIds: string[]
  comments: Portfolio['comments']
}

type ScenarioReviewCallbacks = {
  onFeedbackChange: (value: string) => void
  onCommentChange: (value: string) => void
  onBlockingChange: (value: boolean) => void
  onDecidePending: (decision: 'APPROVED' | 'REJECTED') => void
  onAddComment: () => void
  onRequestRevision: () => void
  onDispose: (commentId: string) => void
}

function PendingScenarioDecisionControls({
  review,
  onDecidePending,
}: Pick<ScenarioReviewCallbacks, 'onDecidePending'> & { review: ScenarioReviewState }) {
  if (!review.canReview) return null
  const hasPendingScenarios = review.pendingScenarioRevisionIds.length > 0
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground" role="status">
        {hasPendingScenarios
          ? `${review.pendingScenarioRevisionIds.length} scenario${review.pendingScenarioRevisionIds.length === 1 ? ' is' : 's are'} pending. Existing durable decisions are preserved.`
          : 'Every scenario already has a durable decision. Refresh before recording another decision.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={review.isPending || !hasPendingScenarios}
          onClick={() => onDecidePending('APPROVED')}
          size="sm"
        >
          Approve pending scenarios
        </Button>
        <Button
          disabled={review.isPending || !hasPendingScenarios || !review.feedback.trim()}
          onClick={() => onDecidePending('REJECTED')}
          size="sm"
          variant="outline"
        >
          Reject pending scenarios with feedback
        </Button>
      </div>
    </div>
  )
}

function ScenarioCommentControls({
  review,
  onCommentChange,
  onBlockingChange,
  onAddComment,
  onRequestRevision,
  onDispose,
}: Pick<
  ScenarioReviewCallbacks,
  'onCommentChange' | 'onBlockingChange' | 'onAddComment' | 'onRequestRevision' | 'onDispose'
> & { review: ScenarioReviewState }) {
  return (
    <>
      <label className="text-sm font-medium" htmlFor="scenario-review-comment">
        Comment
      </label>
      <Textarea
        id="scenario-review-comment"
        onChange={event => onCommentChange(event.target.value)}
        value={review.comment}
      />
      <label className="flex items-center gap-2 text-sm">
        <input checked={review.blocking} onChange={event => onBlockingChange(event.target.checked)} type="checkbox" />
        Blocking comment
      </label>
      {review.canReview ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={review.isPending || !review.comment.trim()}
            onClick={onAddComment}
            size="sm"
            variant="outline"
          >
            Add portfolio comment
          </Button>
          <Button
            disabled={review.isPending || !review.feedback.trim()}
            onClick={onRequestRevision}
            size="sm"
            variant="destructive"
          >
            Request revision
          </Button>
        </div>
      ) : null}
      {review.comments.length ? (
        <ul className="space-y-2">
          {review.comments.map(item => (
            <li className="flex items-center justify-between gap-3 text-sm" key={item.id}>
              <span>
                {item.blocking ? 'Blocking: ' : ''}
                {item.comment} ({item.disposition})
              </span>
              {review.canReview && item.disposition === 'OPEN' ? (
                <Button disabled={review.isPending} onClick={() => onDispose(item.id)} size="sm" variant="ghost">
                  Dispose
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {review.error ? (
        <p className="text-sm text-destructive" role="alert">
          {review.error}
        </p>
      ) : null}
    </>
  )
}

function ScenarioPortfolioReviewControls({
  review,
  ...callbacks
}: { review: ScenarioReviewState } & ScenarioReviewCallbacks) {
  return (
    <section className="space-y-3 rounded-md border p-3" aria-label="Scenario review controls">
      <label className="text-sm font-medium" htmlFor="scenario-review-feedback">
        Review feedback
      </label>
      <Textarea
        id="scenario-review-feedback"
        onChange={event => callbacks.onFeedbackChange(event.target.value)}
        value={review.feedback}
      />
      <PendingScenarioDecisionControls onDecidePending={callbacks.onDecidePending} review={review} />
      <ScenarioCommentControls review={review} {...callbacks} />
    </section>
  )
}

function ScenarioPortfolioReviewContent({
  portfolio,
  journeyId,
  stage,
  stateHash,
}: {
  portfolio: Portfolio
  journeyId: string
  stage: string
  stateHash: string
}) {
  const { refresh } = useRouter()
  const [feedback, setFeedback] = useState('')
  const [comment, setComment] = useState('')
  const [blocking, setBlocking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const actionIds = useRef<Record<string, { commandId: string; idempotencyKey: string }>>({})
  const canReview = stage === 'SCENARIO_REVIEW' && Boolean(portfolio.reviewHash)
  const orderedScenarios = portfolio.scenarios.toSorted((left, right) => {
    const sequence = Number(read(left.layoutJson).sequence) - Number(read(right.layoutJson).sequence)
    return sequence || left.stableScenarioId.localeCompare(right.stableScenarioId)
  })
  const pendingScenarioRevisionIds = orderedScenarios.flatMap(scenario =>
    scenario.decisions.length ? [] : [scenario.scenarioRevisionId],
  )
  const nextIds = (key: string) => {
    if (!actionIds.current[key])
      actionIds.current[key] = { commandId: actionId(`scenario-${key}`), idempotencyKey: actionId(`scenario-${key}`) }
    return actionIds.current[key]!
  }
  const fail = (message: string) => {
    setError(message)
    toast({ title: 'Scenario review update failed', description: message, variant: 'destructive' })
  }
  const recordDecision = (
    key: string,
    decision: 'APPROVED' | 'REJECTED',
    approvedScenarioRevisionIds: string[],
    rejectedScenarioRevisionIds: string[],
    label: string,
  ) => {
    if (!portfolio.reviewHash || (decision === 'REJECTED' && !feedback.trim())) return
    if (!approvedScenarioRevisionIds.length && !rejectedScenarioRevisionIds.length) {
      fail('Every scenario already has a durable decision. Refresh the portfolio before recording another decision.')
      return
    }
    const ids = nextIds(key)
    setError(null)
    startTransition(async () => {
      const response = await decideQualityJourneyScenariosAction({
        journeyId,
        portfolioId: portfolio.artifactId,
        portfolioRevisionId: portfolio.artifactRevisionId,
        portfolioHash: portfolio.contentHash,
        expectedReviewHash: portfolio.reviewHash,
        expectedStateHash: stateHash,
        commandId: ids.commandId,
        idempotencyKey: ids.idempotencyKey,
        approvedScenarioRevisionIds,
        rejectedScenarioRevisionIds,
        ...(decision === 'REJECTED' ? { feedback } : {}),
      })
      if (!response.success) return fail(response.error ?? `Unable to record the ${label} decision.`)
      toast({ title: `${label} decision recorded`, description: 'The review projection has been refreshed.' })
      refresh()
    })
  }
  const decide = (scenarioRevisionId: string, decision: 'APPROVED' | 'REJECTED') =>
    recordDecision(
      `${decision}:${scenarioRevisionId}`,
      decision,
      decision === 'APPROVED' ? [scenarioRevisionId] : [],
      decision === 'REJECTED' ? [scenarioRevisionId] : [],
      'Scenario',
    )
  const decidePortfolio = (decision: 'APPROVED' | 'REJECTED') => {
    recordDecision(
      `portfolio:${decision}`,
      decision,
      decision === 'APPROVED' ? pendingScenarioRevisionIds : [],
      decision === 'REJECTED' ? pendingScenarioRevisionIds : [],
      'Pending scenarios',
    )
  }
  const addComment = (scenarioRevisionId?: string) => {
    if (!portfolio.reviewHash || !comment.trim()) return
    const ids = nextIds(`comment:${scenarioRevisionId ?? 'portfolio'}:${comment}`)
    setError(null)
    startTransition(async () => {
      const response = await commentQualityJourneyScenarioPortfolioAction({
        journeyId,
        portfolioRevisionId: portfolio.artifactRevisionId,
        expectedReviewHash: portfolio.reviewHash,
        ...(scenarioRevisionId ? { scenarioRevisionId } : {}),
        comment,
        blocking,
        idempotencyKey: ids.idempotencyKey,
      })
      if (!response.success) return fail(response.error ?? 'Unable to add the review comment.')
      setComment('')
      setBlocking(false)
      toast({ title: 'Comment added', description: 'The exact review identity has changed.' })
      refresh()
    })
  }
  const dispose = (commentId: string) => {
    if (!portfolio.reviewHash) return
    const ids = nextIds(`dispose:${commentId}`)
    setError(null)
    startTransition(async () => {
      const response = await disposeQualityJourneyScenarioCommentAction({
        journeyId,
        portfolioRevisionId: portfolio.artifactRevisionId,
        expectedReviewHash: portfolio.reviewHash,
        commentId,
        idempotencyKey: ids.idempotencyKey,
      })
      if (!response.success) return fail(response.error ?? 'Unable to dispose the comment.')
      toast({ title: 'Comment disposed', description: 'The blocking disposition is no longer active.' })
      refresh()
    })
  }
  const requestRevision = () => {
    if (!portfolio.reviewHash || !feedback.trim()) return
    const ids = nextIds('revision')
    setError(null)
    startTransition(async () => {
      const response = await requestQualityJourneyScenarioRevisionAction({
        journeyId,
        portfolioId: portfolio.artifactId,
        portfolioRevisionId: portfolio.artifactRevisionId,
        portfolioHash: portfolio.contentHash,
        expectedReviewHash: portfolio.reviewHash,
        expectedStateHash: stateHash,
        commandId: ids.commandId,
        idempotencyKey: ids.idempotencyKey,
        feedback,
      })
      if (!response.success) return fail(response.error ?? 'Unable to request a successor portfolio.')
      toast({ title: 'Revision requested', description: 'A fresh Designer assignment will receive durable feedback.' })
      refresh()
    })
  }
  const { nodes, edges, dependencies, sharedSetup } = scenarioFlow(orderedScenarios, portfolio.graphJson)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Network className="size-4 text-primary" />
          Test scenarios
        </CardTitle>
        <CardDescription>
          Review the intended behavior, coverage, and any unresolved comments before Appraise prepares tests.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <details className="text-muted-foreground">
          <summary className="cursor-pointer text-xs">Technical details</summary>
          <p className="mt-1 break-all font-mono text-[11px]">
            {portfolio.artifactRevisionId} · {portfolio.contentHash}
          </p>
        </details>
        <p className="text-sm text-muted-foreground">Coverage rationale: {portfolio.coverageRationale}</p>
        <div
          aria-describedby="scenario-linear-dependency-view"
          aria-label="Visual scenario dependency graph. A keyboard-equivalent linear dependency view follows."
          className="h-64 rounded-md border"
          data-testid="scenario-readonly-flow"
          role="region"
          tabIndex={0}
        >
          <ReactFlow
            edges={edges}
            elementsSelectable={false}
            fitView
            nodes={nodes}
            nodesConnectable={false}
            nodesDraggable={false}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <div id="scenario-linear-dependency-view">
          <ScenarioDependencyList dependencies={dependencies} scenarios={orderedScenarios} />
        </div>
        <SharedSetupList setup={sharedSetup} />
        <div className="grid gap-3 md:grid-cols-2">
          {orderedScenarios.map(scenario => (
            <ScenarioReviewCard
              key={scenario.scenarioRevisionId}
              onAddComment={addComment}
              onDecide={decide}
              review={
                canReview
                  ? {
                      isPending,
                      hasFeedback: Boolean(feedback.trim()),
                      hasComment: Boolean(comment.trim()),
                    }
                  : null
              }
              scenario={scenario}
            />
          ))}
        </div>
        <ScenarioPortfolioReviewControls
          onAddComment={() => addComment()}
          onBlockingChange={setBlocking}
          onCommentChange={setComment}
          onDecidePending={decidePortfolio}
          onDispose={dispose}
          onFeedbackChange={setFeedback}
          onRequestRevision={requestRevision}
          review={{
            canReview,
            isPending,
            feedback,
            comment,
            blocking,
            error,
            pendingScenarioRevisionIds,
            comments: portfolio.comments,
          }}
        />
      </CardContent>
    </Card>
  )
}

export function ScenarioPortfolioReview({
  portfolio,
  journeyId,
  stage,
  stateHash,
}: {
  portfolio: Portfolio | null
  journeyId: string
  stage: string
  stateHash: string
}) {
  if (!portfolio) return null
  return (
    <ScenarioPortfolioReviewContent journeyId={journeyId} portfolio={portfolio} stage={stage} stateHash={stateHash} />
  )
}
