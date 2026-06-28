'use client'

import '@xyflow/react/dist/style.css'

import { useCallback, useMemo, useRef, useState, useTransition } from 'react'
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
  type NodeMouseHandler,
} from '@xyflow/react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  GitCompare,
  Image,
  List,
  Loader2,
  MessageSquare,
  Network,
  PanelRightClose,
  PanelRightOpen,
  RefreshCcw,
  Save,
  Share2,
  XCircle,
} from 'lucide-react'

import {
  addPlanRemarkAction,
  acceptBaselineAction,
  acknowledgeBaselineFailureAction,
  approvePlanRevisionAction,
  cancelBaselineExecutionAction,
  justifyBaselineRegressionPassAction,
  publishSharedPlanLayoutAction,
  reconcileBaselineExecutionAction,
  requestPlanChangesAction,
  retargetPlanRemarkAction,
  savePersonalPlanLayoutAction,
  startBaselineExecutionAction,
  startImplementationAction,
  transitionPlanRemarkAction,
} from '@/actions/plan-review/plan-review-actions'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'
import { getThreadStatus, isThreadOpen } from '@/services/plan-review/plan-review-helpers'

import { projectPlanFlow } from './plan-flow-projection'
import { PlanFlowTaskNode, type PlanFlowTaskNode as PlanFlowTaskNodeType } from './plan-flow-task-node'

type PlanReviewWorkspaceProps = {
  detail: PlanReviewDetail
}

const edgeColors = {
  'depends-on': 'var(--muted-foreground)',
  blocks: 'var(--destructive)',
  'relates-to': 'var(--primary)',
} as const

const edgeDash = {
  'depends-on': undefined,
  blocks: '8 5',
  'relates-to': '2 5',
} as const

const nodeTypes = { planTask: PlanFlowTaskNode }

function getBaselineIcon(status: string, classification?: string) {
  if (status === 'running' || status === 'scheduled') return Loader2
  if (status === 'cancelled' || status === 'interrupted' || classification === 'invalid_baseline_failure')
    return XCircle
  if (status === 'completed') return CheckCircle2
  return Clock
}

function getBaselineIconClass(status: string, classification?: string): string {
  if (status === 'running' || status === 'scheduled') return 'animate-spin text-sky-500'
  if (status === 'cancelled' || status === 'interrupted' || classification === 'invalid_baseline_failure') {
    return 'text-destructive'
  }
  if (status === 'completed') return 'text-emerald-500'
  return 'text-muted-foreground'
}

function taskRelationshipSummary(taskId: string, semanticFlow: ReturnType<typeof projectPlanFlow>): string {
  const incoming = semanticFlow.edges
    .filter(edge => edge.target === taskId)
    .map(edge => `${edge.type} from ${edge.source}`)
  const outgoing = semanticFlow.edges
    .filter(edge => edge.source === taskId)
    .map(edge => `${edge.type} to ${edge.target}`)
  return [...incoming, ...outgoing].join('; ') || 'No displayed relationships'
}

function getReviewUnavailableReason(lifecycle: string): string | null {
  if (lifecycle === 'awaiting_plan_review') return null
  if (lifecycle === 'draft') return 'This draft has not been submitted for plan review.'
  return 'The plan is not awaiting plan review.'
}

// The graph, list, inspector, and approval controls intentionally share one interaction model.
// fallow-ignore-next-line complexity
export function PlanReviewWorkspace({ detail }: PlanReviewWorkspaceProps) {
  const semanticFlow = useMemo(() => projectPlanFlow(detail.graph), [detail.graph])
  const openRemarksByTask = useMemo(() => {
    const counts = new Map<string, number>()
    for (const thread of detail.review?.threads ?? []) {
      if (thread.target.type === 'task' && isThreadOpen(thread)) {
        counts.set(thread.target.taskId, (counts.get(thread.target.taskId) ?? 0) + 1)
      }
    }
    return counts
  }, [detail.review?.threads])
  const semanticPositions = useMemo(
    () => Object.fromEntries(semanticFlow.tasks.map(task => [task.id, task.position])),
    [semanticFlow.tasks],
  )
  const initialNodes = useMemo<PlanFlowTaskNodeType[]>(
    () =>
      semanticFlow.tasks.map(task => ({
        id: task.id,
        type: 'planTask',
        position: detail.personalPositions[task.id] ?? detail.sharedPositions[task.id] ?? task.position,
        data: {
          step: task.step,
          title: task.title,
          status: task.status,
          openRemarks: openRemarksByTask.get(task.id) ?? 0,
        },
      })),
    [detail.personalPositions, detail.sharedPositions, openRemarksByTask, semanticFlow.tasks],
  )
  const initialEdges = useMemo<Edge[]>(
    () =>
      semanticFlow.edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.type,
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColors[edge.type] },
        style: {
          stroke: edgeColors[edge.type],
          strokeWidth: edge.type === 'depends-on' ? 2 : 1.5,
          strokeDasharray: edgeDash[edge.type],
        },
        labelStyle: { fill: 'var(--foreground)', fontSize: 11, fontWeight: 600 },
        labelBgStyle: { fill: 'var(--background)', fillOpacity: 0.9 },
      })),
    [semanticFlow.edges],
  )
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)
  const flowInstanceRef = useRef<ReactFlowInstance<PlanFlowTaskNodeType, Edge> | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(detail.plan.tasks[0]?.id ?? null)
  const [remarkBody, setRemarkBody] = useState('')
  const [blocking, setBlocking] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmReplacement, setConfirmReplacement] = useState(false)
  const [regressionJustification, setRegressionJustification] = useState('')
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [isPending, startTransition] = useTransition()

  const selectedTask = detail.plan.tasks.find(task => task.id === selectedTaskId)
  const threads = detail.review?.threads ?? []
  const visibleThreads = threads.filter(thread =>
    selectedTaskId
      ? thread.target.type === 'task' && thread.target.taskId === selectedTaskId
      : thread.target.type === 'plan',
  )
  const approved = detail.review?.planApprovals.some(
    approval => approval.revision === detail.plan.revision && approval.relevantHashes.plan,
  )
  const suspiciousReplacement = detail.issues.some(issue => issue.code === 'suspicious-node-replacement')
  const reviewUnavailableReason = getReviewUnavailableReason(detail.plan.lifecycle)
  const approvalDisabledReason = approved
    ? 'This exact revision has already been approved.'
    : reviewUnavailableReason
      ? reviewUnavailableReason
      : !detail.reviewReady
        ? 'Approval is disabled until the graph and list review representation is ready.'
        : null
  const requestChangesDisabledReason = approved
    ? 'This exact revision has already been approved.'
    : reviewUnavailableReason
      ? reviewUnavailableReason
      : detail.projection.stale
        ? 'Refresh the stale plan projection before requesting changes.'
        : detail.projection.conflicted
          ? 'Resolve artifact conflicts before requesting changes.'
          : !detail.reviewReady
            ? 'Changes cannot be requested until the graph and list review representation is ready.'
            : detail.blockingThreadIds.length === 0
              ? 'Add a blocking remark before requesting changes.'
              : null

  const run = (operation: () => Promise<{ success?: boolean; error?: string }>, successMessage: string) => {
    setMessage(null)
    startTransition(async () => {
      const result = await operation()
      setMessage(result.success ? successMessage : (result.error ?? 'The action failed.'))
      if (result.success) window.location.reload()
    })
  }

  const positions = () =>
    Object.fromEntries(nodes.map(node => [node.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) }]))

  const onNodeClick: NodeMouseHandler<PlanFlowTaskNodeType> = (_, node) => setSelectedTaskId(node.id)
  const resetToFlow = useCallback(() => {
    setNodes(currentNodes =>
      currentNodes.map(node => ({
        ...node,
        position: semanticPositions[node.id] ?? node.position,
      })),
    )
    requestAnimationFrame(() => void flowInstanceRef.current?.fitView({ padding: 0.18, duration: 300 }))
  }, [semanticPositions, setNodes])

  return (
    <main className="space-y-5 pb-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">Revision {detail.plan.revision}</Badge>
            <Badge variant={detail.projection.conflicted || detail.projection.stale ? 'destructive' : 'secondary'}>
              {detail.projection.lifecycle.replaceAll('_', ' ')}
            </Badge>
            {approved ? <Badge>Approved</Badge> : null}
          </div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">{detail.plan.goal}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail.plan.description}</p>
          {detail.plan.implementationGroups.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Implementation groups">
              <span className="text-xs text-muted-foreground">Implementation groups:</span>
              {detail.plan.implementationGroups.map(group => (
                <Badge key={group.id} variant="outline">
                  {group.id} ({group.taskIds.length})
                </Badge>
              ))}
            </div>
          ) : null}
          <p className="mt-2 font-mono text-xs text-muted-foreground">{detail.plan.planId}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setInspectorOpen(open => !open)}>
            {inspectorOpen ? <PanelRightClose className="mr-2 size-4" /> : <PanelRightOpen className="mr-2 size-4" />}
            {inspectorOpen ? 'Hide inspector' : 'Show inspector'}
          </Button>
        </div>
      </header>

      {detail.projection.stale || detail.projection.conflicted ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Artifact health requires attention</AlertTitle>
          <AlertDescription>
            {detail.issues.map(issue => issue.message).join(' ') || 'The current projection is stale or conflicted.'}
          </AlertDescription>
        </Alert>
      ) : null}
      {detail.plan.lifecycle === 'draft' ? (
        <Alert>
          <FileText className="size-4" />
          <AlertTitle>Draft not submitted for review</AlertTitle>
          <AlertDescription>
            Remarks can be captured, but approval and change-request actions are locked until the plan is submitted for
            plan review.
          </AlertDescription>
        </Alert>
      ) : null}
      {detail.listFallback ? (
        <Alert>
          <List className="size-4" />
          <AlertTitle>Graph unavailable, list review enabled</AlertTitle>
          <AlertDescription>
            Repeated graph processing failures do not invalidate the plan. All review controls remain available below.
          </AlertDescription>
        </Alert>
      ) : null}
      {detail.orphanedThreadIds.length > 0 ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Removed-node remarks need a decision</AlertTitle>
          <AlertDescription>
            {detail.orphanedThreadIds.length} open remark(s) target nodes no longer present in this revision.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className={cn('grid gap-5', inspectorOpen && 'xl:grid-cols-[minmax(0,1fr)_400px]')}>
        <Card className="overflow-hidden">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Review surface</CardTitle>
                <CardDescription>
                  Steps progress left to right. Tasks in the same stage may proceed in parallel.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="w-5 border-t-2 border-muted-foreground" /> depends-on
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-5 border-t-2 border-dashed border-destructive" /> blocks
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-5 border-t-2 border-dotted border-green-500" /> relates-to
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Tabs defaultValue={detail.listFallback ? 'list' : 'graph'}>
              <div className="border-b px-4 py-3">
                <TabsList aria-label="Plan review representations">
                  <TabsTrigger value="graph" disabled={detail.listFallback}>
                    <Network className="mr-2 size-4" />
                    Graph
                  </TabsTrigger>
                  <TabsTrigger value="list">
                    <List className="mr-2 size-4" />
                    Accessible list
                  </TabsTrigger>
                  <TabsTrigger value="history">
                    <GitCompare className="mr-2 size-4" />
                    Revisions
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="graph" className="relative m-0 h-[620px]">
                {detail.listFallback ? (
                  <div className="flex h-full items-center justify-center p-6 text-center">
                    <div>
                      <p className="font-medium">Graph rendering is unavailable.</p>
                      <p className="mt-2 max-w-md text-sm text-muted-foreground">
                        Switch to the accessible list to review the same steps, stages, relationships, remarks, and
                        approval controls.
                      </p>
                    </div>
                  </div>
                ) : (
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeClick={onNodeClick}
                    onInit={instance => {
                      flowInstanceRef.current = instance
                    }}
                    nodeTypes={nodeTypes}
                    nodesConnectable={false}
                    elementsSelectable
                    fitView
                    minZoom={0.2}
                    proOptions={{ hideAttribution: true }}
                    aria-label="Plan dependency graph"
                  >
                    <Background />
                    <Controls />
                  </ReactFlow>
                )}
                <div className="bg-background/90 supports-[backdrop-filter]:bg-background/70 absolute left-4 top-4 z-10 flex flex-wrap gap-2 rounded-lg border p-2 shadow-lg backdrop-blur">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () => savePersonalPlanLayoutAction({ planId: detail.plan.planId, positions: positions() }),
                        'Personal layout saved.',
                      )
                    }
                  >
                    <Save className="mr-2 size-3.5" />
                    Save layout
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () => publishSharedPlanLayoutAction({ planId: detail.plan.planId, positions: positions() }),
                        'Shared layout written to the Git-tracked sidecar.',
                      )
                    }
                  >
                    <Share2 className="mr-2 size-3.5" />
                    Publish shared
                  </Button>
                  <Button size="sm" variant="outline" type="button" onClick={resetToFlow}>
                    <RefreshCcw className="mr-2 size-3.5" />
                    Reset view
                  </Button>
                </div>
              </TabsContent>
              <TabsContent value="list" className="m-0">
                <ol aria-label="Semantic plan review list" className="divide-y">
                  {semanticFlow.tasks.map(task => (
                    <li key={task.id}>
                      <button
                        type="button"
                        className="hover:bg-muted/40 flex w-full items-start gap-4 p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        onClick={() => setSelectedTaskId(task.id)}
                        aria-pressed={selectedTaskId === task.id}
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border font-mono text-xs">
                          {task.step}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <strong>{task.title}</strong>
                            <Badge variant={task.status === 'blocked' ? 'destructive' : 'outline'}>{task.status}</Badge>
                            <Badge variant="secondary">Stage {task.stage + 1}</Badge>
                          </span>
                          <span className="mt-1 block text-sm text-muted-foreground">{task.description}</span>
                          <span className="mt-3 block text-xs text-muted-foreground">
                            Relationships: {taskRelationshipSummary(task.id, semanticFlow)}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            Validated by: {task.validationIntent}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </TabsContent>
              <TabsContent value="history" className="m-0 p-5">
                <div className="space-y-3">
                  {detail.revisions.map((revision, index) => (
                    <div key={revision.id} className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <p className="font-medium">{index === 0 ? 'Current snapshot' : `Earlier snapshot ${index}`}</p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">{revision.sourceHash}</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>{revision.createdAt.toLocaleString()}</p>
                        <p>{revision.reducedAssurance ? 'Filesystem snapshot' : revision.gitCommit?.slice(0, 10)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {inspectorOpen ? (
          <aside className="space-y-5">
            {detail.validation ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Baseline execution</CardTitle>
                  <CardDescription>
                    Required browser and environment combinations must have accepted evidence before implementation.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    {detail.validation.baselineAttempts.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No baseline attempts have been submitted.</p>
                    ) : (
                      detail.validation.baselineAttempts.map(attempt => {
                        const BaselineIcon = getBaselineIcon(attempt.status, attempt.classification)
                        const evidenceLinks = [
                          { label: 'Logs', href: attempt.evidence.logsUrl, icon: FileText },
                          { label: 'Report', href: attempt.evidence.reportUrl, icon: ExternalLink },
                          ...attempt.evidence.traceUrls.map((url, index) => ({
                            label: `Trace ${index + 1}`,
                            href: url,
                            icon: GitCompare,
                          })),
                          ...attempt.evidence.screenshotUrls.map((url, index) => ({
                            label: `Screenshot ${index + 1}`,
                            href: url,
                            icon: Image,
                          })),
                        ]

                        return (
                          <div key={attempt.id} className="bg-muted/20 rounded-lg border p-3 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="flex min-w-0 items-center gap-2 font-medium">
                                <BaselineIcon
                                  className={cn(
                                    'size-4 shrink-0',
                                    getBaselineIconClass(attempt.status, attempt.classification),
                                  )}
                                />
                                <span className="truncate">
                                  {attempt.browser} / {attempt.environment}
                                </span>
                              </span>
                              <Badge
                                variant={
                                  attempt.classification === 'invalid_baseline_failure' ? 'destructive' : 'outline'
                                }
                              >
                                {attempt.classification?.replaceAll('_', ' ') ?? attempt.status}
                              </Badge>
                            </div>
                            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                              {attempt.validationId} · run {attempt.testRunId}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                              {evidenceLinks.map(link => {
                                const EvidenceIcon = link.icon
                                return (
                                  <Button key={`${link.label}-${link.href}`} asChild size="sm" variant="secondary">
                                    <a href={link.href}>
                                      <EvidenceIcon className="mr-1 size-3.5" />
                                      {link.label}
                                    </a>
                                  </Button>
                                )
                              })}
                            </div>
                            {attempt.classification === 'pre_existing_unrelated_failure' ? (
                              <Button
                                className="mt-3"
                                size="sm"
                                variant="outline"
                                disabled={isPending}
                                onClick={() =>
                                  run(
                                    () =>
                                      acknowledgeBaselineFailureAction({
                                        planId: detail.plan.planId,
                                        attemptId: attempt.id,
                                      }),
                                    'Unrelated failure acknowledged.',
                                  )
                                }
                              >
                                Acknowledge unchanged failure
                              </Button>
                            ) : null}
                            {attempt.classification === 'accepted_regression_pass' &&
                            !attempt.regressionJustification ? (
                              <div className="mt-3 space-y-2">
                                <Textarea
                                  value={regressionJustification}
                                  onChange={event => setRegressionJustification(event.target.value)}
                                  placeholder="Why this passing test still provides required regression coverage"
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isPending || !regressionJustification.trim()}
                                  onClick={() =>
                                    run(
                                      () =>
                                        justifyBaselineRegressionPassAction({
                                          planId: detail.plan.planId,
                                          attemptId: attempt.id,
                                          justification: regressionJustification,
                                        }),
                                      'Regression coverage justified.',
                                    )
                                  }
                                >
                                  Save justification
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        )
                      })
                    )}
                  </div>
                  <div className="grid gap-2">
                    {['validations_approved', 'baseline_changes_requested'].includes(detail.plan.lifecycle) ? (
                      <Button
                        disabled={isPending}
                        onClick={() =>
                          run(
                            () => startBaselineExecutionAction({ planId: detail.plan.planId }),
                            'Baseline runs submitted.',
                          )
                        }
                      >
                        Start required baselines
                      </Button>
                    ) : null}
                    {detail.plan.lifecycle === 'baseline_running' ? (
                      <>
                        <Button
                          disabled={isPending}
                          onClick={() =>
                            run(
                              () => reconcileBaselineExecutionAction({ planId: detail.plan.planId }),
                              'Baseline evidence reconciled.',
                            )
                          }
                        >
                          Reconcile run evidence
                        </Button>
                        <Button
                          variant="outline"
                          disabled={isPending}
                          onClick={() =>
                            run(
                              () => cancelBaselineExecutionAction({ planId: detail.plan.planId }),
                              'Baseline execution cancelled.',
                            )
                          }
                        >
                          Cancel baseline runs
                        </Button>
                      </>
                    ) : null}
                    {detail.plan.lifecycle === 'baseline_review' ? (
                      <Button
                        disabled={isPending}
                        onClick={() =>
                          run(() => acceptBaselineAction({ planId: detail.plan.planId }), 'Baselines accepted.')
                        }
                      >
                        Accept complete baseline
                      </Button>
                    ) : null}
                    {detail.plan.lifecycle === 'baseline_accepted' ? (
                      <Button
                        disabled={isPending}
                        onClick={() =>
                          run(
                            () => startImplementationAction({ planId: detail.plan.planId }),
                            'Implementation unlocked.',
                          )
                        }
                      >
                        Unlock implementation
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>{selectedTask ? selectedTask.title : 'Plan-wide review'}</CardTitle>
                <CardDescription>
                  {selectedTask ? selectedTask.description : 'Remarks here apply to the plan as a whole.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedTask ? (
                  <div>
                    <p className="text-sm font-medium">Acceptance criteria</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {selectedTask.acceptanceCriteria.map(criterion => (
                        <li key={criterion}>{criterion}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-0"
                  onClick={() => setSelectedTaskId(selectedTask ? null : (detail.plan.tasks[0]?.id ?? null))}
                >
                  <MessageSquare className="mr-2 size-4" />
                  {selectedTask ? 'Switch to plan-wide remarks' : 'Switch to task remarks'}
                </Button>
                <div className="space-y-2">
                  <Label htmlFor="remark">Add remark</Label>
                  <Textarea
                    id="remark"
                    value={remarkBody}
                    onChange={event => setRemarkBody(event.target.value)}
                    placeholder="Describe the change or question..."
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="blocking" checked={blocking} onCheckedChange={value => setBlocking(value === true)} />
                  <Label htmlFor="blocking">Blocking remark</Label>
                </div>
                <Button
                  className="w-full"
                  disabled={isPending || !remarkBody.trim()}
                  onClick={() =>
                    run(
                      () =>
                        addPlanRemarkAction({
                          planId: detail.plan.planId,
                          target: selectedTaskId ? { type: 'task', taskId: selectedTaskId } : { type: 'plan' },
                          body: remarkBody,
                          blocking,
                        }),
                      'Remark added.',
                    )
                  }
                >
                  {isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <MessageSquare className="mr-2 size-4" />
                  )}
                  Add remark
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Remark thread</CardTitle>
                <CardDescription>{visibleThreads.length} thread(s) for this target</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {visibleThreads.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No remarks for this target.</p>
                ) : (
                  visibleThreads.map(thread => (
                    <div key={thread.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant={thread.blocking && isThreadOpen(thread) ? 'destructive' : 'outline'}>
                          {thread.blocking ? 'Blocking' : 'Non-blocking'}
                        </Badge>
                        <span className="text-xs capitalize text-muted-foreground">{getThreadStatus(thread)}</span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {thread.events.map(event => (
                          <div key={event.id} className="text-sm">
                            <span className="font-medium capitalize">{event.action}</span>
                            {event.body ? <p className="mt-1 text-muted-foreground">{event.body}</p> : null}
                          </div>
                        ))}
                      </div>
                      {isThreadOpen(thread) ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(['resolved', 'dismissed', 'downgraded'] as const).map(action => (
                            <Button
                              key={action}
                              size="sm"
                              variant="outline"
                              disabled={isPending}
                              onClick={() =>
                                run(
                                  () =>
                                    transitionPlanRemarkAction({
                                      planId: detail.plan.planId,
                                      threadId: thread.id,
                                      action,
                                    }),
                                  `Remark ${action}.`,
                                )
                              }
                            >
                              {action}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {detail.orphanedThreadIds.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Retarget removed-node remarks</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {detail.orphanedThreadIds.map(threadId => (
                    <Button
                      key={threadId}
                      variant="outline"
                      className="w-full justify-start"
                      disabled={!selectedTaskId || isPending}
                      onClick={() =>
                        run(
                          () =>
                            retargetPlanRemarkAction({
                              planId: detail.plan.planId,
                              threadId,
                              taskId: selectedTaskId,
                            }),
                          'Remark retargeted.',
                        )
                      }
                    >
                      Retarget {threadId.slice(0, 18)} to selected task
                    </Button>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revision approval</CardTitle>
                <CardDescription>
                  Approval binds to revision {detail.plan.revision} and its exact plan hash.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {suspiciousReplacement ? (
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="replacement-confirmation"
                      checked={confirmReplacement}
                      onCheckedChange={value => setConfirmReplacement(value === true)}
                    />
                    <Label htmlFor="replacement-confirmation" className="leading-5">
                      Confirm that replaced node identities are intentional.
                    </Label>
                  </div>
                ) : null}
                <Button
                  className="w-full"
                  aria-describedby={approvalDisabledReason ? 'approval-disabled-reason' : undefined}
                  disabled={isPending || Boolean(approvalDisabledReason)}
                  onClick={() =>
                    run(
                      () =>
                        approvePlanRevisionAction({
                          planId: detail.plan.planId,
                          displayedRevision: detail.plan.revision,
                          expectedPlanHash: detail.contentHash,
                          confirmSuspiciousReplacement: confirmReplacement,
                        }),
                      'Exact plan revision approved.',
                    )
                  }
                >
                  <Check className="mr-2 size-4" />
                  {approved ? 'Revision approved' : 'Approve exact revision'}
                </Button>
                {approvalDisabledReason ? (
                  <p id="approval-disabled-reason" className="text-sm text-muted-foreground">
                    {approvalDisabledReason}
                  </p>
                ) : null}
                <Button
                  className="w-full"
                  variant="outline"
                  aria-describedby={requestChangesDisabledReason ? 'request-changes-disabled-reason' : undefined}
                  disabled={isPending || Boolean(requestChangesDisabledReason)}
                  onClick={() =>
                    run(
                      () =>
                        requestPlanChangesAction({
                          planId: detail.plan.planId,
                          displayedRevision: detail.plan.revision,
                          expectedPlanHash: detail.contentHash,
                        }),
                      'Plan changes requested.',
                    )
                  }
                >
                  <MessageSquare className="mr-2 size-4" />
                  Request changes
                </Button>
                {requestChangesDisabledReason ? (
                  <p id="request-changes-disabled-reason" className="text-sm text-muted-foreground">
                    {requestChangesDisabledReason}
                  </p>
                ) : null}
                {message ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    {message}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </aside>
        ) : null}
      </div>
    </main>
  )
}
