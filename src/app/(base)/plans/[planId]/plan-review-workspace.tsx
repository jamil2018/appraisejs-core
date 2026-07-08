'use client'

import '@xyflow/react/dist/style.css'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
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
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowDown,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Folder,
  GitCompare,
  Hash,
  Image,
  Keyboard,
  Layers,
  List,
  Loader2,
  MessageSquare,
  Network,
  PanelRightClose,
  PanelRightOpen,
  RefreshCcw,
  Save,
  Search,
  Share2,
  ShieldAlert,
  XCircle,
  X,
} from 'lucide-react'

import {
  addPlanRemarkAction,
  acceptBaselineAction,
  acknowledgeBaselineFailureAction,
  approveValidationFileAction,
  approvePlanRevisionAction,
  cancelBaselineExecutionAction,
  decideValidationNodeAction,
  justifyBaselineRegressionPassAction,
  publishSharedPlanLayoutAction,
  requestPlanChangesAction,
  retargetPlanRemarkAction,
  savePersonalPlanLayoutAction,
  submitValidationFeedbackAction,
  submitValidationReviewAction,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { getPlanDisplaySlug } from '@/lib/plans/plan-display'
import { cn } from '@/lib/utils'
import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'
import { getThreadStatus, isThreadOpen } from '@/services/plan-review/plan-review-helpers'

import { projectPlanFlow } from './plan-flow-projection'
import { PlanFlowTaskNode, type PlanFlowTaskNode as PlanFlowTaskNodeType } from './plan-flow-task-node'
import { ValidationReviewPanel } from './validation-review-panel'

type PlanReviewWorkspaceProps = {
  detail: PlanReviewDetail
  initialTab?: 'graph' | 'list' | 'history' | 'validations'
}
type ActionMessage = { tone: 'success' | 'error'; text: string; recovery?: 'validation-drift' }

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
  if (
    status === 'cancelled' ||
    status === 'interrupted' ||
    classification === 'invalid_baseline_failure' ||
    classification === 'validation_harness_failure'
  )
    return XCircle
  if (status === 'completed') return CheckCircle2
  return Clock
}

function getBaselineIconClass(status: string, classification?: string): string {
  if (status === 'running' || status === 'scheduled') return 'animate-spin text-sky-500'
  if (
    status === 'cancelled' ||
    status === 'interrupted' ||
    classification === 'invalid_baseline_failure' ||
    classification === 'validation_harness_failure'
  ) {
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

const SHORTCUT_SECTIONS: Array<{ title: string; items: Array<{ label: string; keys: string[] }> }> = [
  {
    title: 'Navigation',
    items: [
      { label: 'Switch to Graph tab', keys: ['G'] },
      { label: 'Switch to List tab', keys: ['L'] },
      { label: 'Switch to History tab', keys: ['H'] },
      { label: 'Switch to Validations tab', keys: ['V'] },
    ],
  },
  {
    title: 'Inspector & Selection',
    items: [
      { label: 'Toggle Inspector panel', keys: ['I'] },
      { label: 'Clear task selection', keys: ['Esc'] },
      { label: 'Select next task', keys: ['J', '↓'] },
      { label: 'Select previous task', keys: ['K', '↑'] },
    ],
  },
  {
    title: 'Help',
    items: [{ label: 'Show shortcuts guide', keys: ['?'] }],
  },
]

function ShortcutSection({
  title,
  items,
  withBorder,
}: {
  title: string
  items: Array<{ label: string; keys: string[] }>
  withBorder?: boolean
}) {
  return (
    <div className={cn('space-y-3', withBorder && 'border-t pt-3')}>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      <div className="grid grid-cols-2 items-center gap-2 text-sm">
        {items.map(item => (
          <Fragment key={item.label}>
            <span className="text-muted-foreground">{item.label}</span>
            <div className="flex items-center justify-end gap-1">
              {item.keys.map((k, index) => (
                <Fragment key={k}>
                  {index > 0 && <span className="text-muted-foreground">or</span>}
                  <Kbd>{k}</Kbd>
                </Fragment>
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}

type RelationBucket = 'prerequisites' | 'blocks' | 'relatesTo'

const RELATION_RULES: Record<string, { asSource: RelationBucket; asTarget: RelationBucket }> = {
  'depends-on': { asSource: 'blocks', asTarget: 'prerequisites' },
  blocks: { asSource: 'blocks', asTarget: 'prerequisites' },
  'relates-to': { asSource: 'relatesTo', asTarget: 'relatesTo' },
}

const LIFECYCLE_TONES = {
  neutral: {
    classes: 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300',
    Icon: FileText,
    dot: 'bg-slate-400',
  },
  pending: {
    classes: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    Icon: AlertTriangle,
    dot: 'bg-amber-500',
  },
  danger: {
    classes: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
    Icon: XCircle,
    dot: 'bg-red-500',
  },
  success: {
    classes: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    Icon: CheckCircle2,
    dot: 'bg-emerald-500',
  },
  running: {
    classes: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    Icon: Loader2,
    dot: 'bg-sky-500 animate-pulse',
  },
  active: {
    classes: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
    Icon: Clock,
    dot: 'bg-violet-500 animate-pulse',
  },
} as const

const LIFECYCLE_TONE_BY_STATE: Record<string, keyof typeof LIFECYCLE_TONES> = {
  draft: 'neutral',
  paused: 'neutral',
  cancelled: 'neutral',
  awaiting_plan_review: 'pending',
  awaiting_validation_review: 'pending',
  baseline_review: 'pending',
  changes_requested: 'danger',
  validation_changes_requested: 'danger',
  baseline_changes_requested: 'danger',
  failed_validation: 'danger',
  plan_approved: 'success',
  validations_approved: 'success',
  baseline_accepted: 'success',
  validation_passed: 'success',
  completed: 'success',
  preparing_validations: 'running',
  baseline_running: 'running',
  validating: 'running',
  in_progress: 'active',
}

function getInitials(actor: string): string {
  if (actor === 'local-user') return 'LU'
  return actor
    .split(/[\s_-]+/)
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function getRelativeTimeString(date: Date | string | number): string {
  const time = typeof date === 'number' ? date : new Date(date).getTime()
  const now = Date.now()
  const diff = now - time

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 7) {
    return new Date(time).toLocaleDateString()
  }
  if (days > 0) {
    return `${days}d ago`
  }
  if (hours > 0) {
    return `${hours}h ago`
  }
  if (minutes > 0) {
    return `${minutes}m ago`
  }
  return 'Just now'
}

function renderLifecycleBadge(lifecycle: string) {
  const label = lifecycle.replaceAll('_', ' ')
  const tone = LIFECYCLE_TONES[LIFECYCLE_TONE_BY_STATE[lifecycle] ?? 'neutral']
  const Icon = lifecycle === 'in_progress' ? Clock : tone.Icon
  const spinning = lifecycle === 'baseline_running' || lifecycle === 'validating'

  return (
    <Badge className={cn('gap-1.5 py-0.5 pl-2 pr-2.5 font-medium capitalize', tone.classes)} variant="outline">
      <span className={cn('size-1.5 rounded-full', tone.dot)} />
      <Icon className={cn('size-3.5', spinning && 'animate-spin')} />
      {label}
    </Badge>
  )
}

function MarkdownRemark({ content }: { content: string }) {
  if (!content) return null

  // Split content by code blocks first
  const parts = content.split(/(```[\s\S]*?```)/g)

  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const code = part.slice(3, -3).trim()
          return (
            <pre key={index} className="my-2 overflow-x-auto rounded-md border bg-muted p-2.5 font-mono text-xs">
              <code>{code}</code>
            </pre>
          )
        }

        // Process inline formatting (bold, italic, inline code, lists)
        const lines = part.split('\n')
        const elements: React.ReactNode[] = []
        let inList = false
        let listItems: string[] = []

        const flushList = (key: number) => {
          if (listItems.length > 0) {
            elements.push(
              <ul key={`list-${key}`} className="my-1.5 list-disc space-y-0.5 pl-5">
                {listItems.map((item, i) => (
                  <li key={i}>{renderInline(item)}</li>
                ))}
              </ul>,
            )
            listItems = []
          }
        }

        const renderInline = (text: string) => {
          // Replace inline code, bold, italic
          const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g)
          return tokens.map((token, i) => {
            if (token.startsWith('`') && token.endsWith('`')) {
              return (
                <code key={i} className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {token.slice(1, -1)}
                </code>
              )
            }
            if (token.startsWith('**') && token.endsWith('**')) {
              return (
                <strong key={i} className="font-semibold">
                  {token.slice(2, -2)}
                </strong>
              )
            }
            if (token.startsWith('*') && token.endsWith('*')) {
              return <em key={i}>{token.slice(1, -1)}</em>
            }
            return token
          })
        }

        lines.forEach((line, lineIndex) => {
          const trimmed = line.trim()
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            inList = true
            listItems.push(trimmed.slice(2))
          } else {
            if (inList) {
              flushList(lineIndex)
              inList = false
            }
            if (trimmed) {
              elements.push(<p key={lineIndex}>{renderInline(line)}</p>)
            } else {
              elements.push(<div key={lineIndex} className="h-2" />)
            }
          }
        })

        if (inList) {
          flushList(lines.length)
        }

        return <div key={index}>{elements}</div>
      })}
    </div>
  )
}

function RemarkTransitionButton({
  label,
  tooltip,
  icon,
  disabled,
  onClick,
}: {
  label: string
  tooltip: string
  icon: ReactNode
  disabled: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-6 gap-1 px-2 text-[10px] font-semibold"
          disabled={disabled}
          onClick={onClick}
        >
          {icon}
          {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

type PlanActionRunner = (
  operation: () => Promise<{ success?: boolean; error?: string }>,
  successMessage: string,
) => void

type RemarkThread = NonNullable<PlanReviewDetail['review']>['threads'][number]
type BaselineAttempt = NonNullable<PlanReviewDetail['validation']>['baselineAttempts'][number]

// fallow-ignore-next-line complexity
function PlanRemarkThreadItem({
  thread,
  planId,
  isPending,
  run,
}: {
  thread: RemarkThread
  planId: string
  isPending: boolean
  run: PlanActionRunner
}) {
  return (
    <div className="group relative">
      <div className="absolute -left-[19px] top-1.5 flex size-4 items-center justify-center rounded-full border border-border bg-background shadow-sm">
        <span
          className={cn(
            'size-1.5 rounded-full',
            thread.blocking && isThreadOpen(thread) ? 'animate-pulse bg-destructive' : 'bg-muted-foreground/60',
          )}
        />
      </div>

      <div
        className={cn(
          'space-y-2.5 rounded-xl border bg-card p-3 shadow-sm transition-all duration-200 hover:shadow-md',
          thread.blocking && isThreadOpen(thread)
            ? 'bg-destructive/[0.02] border-destructive/20'
            : 'border-border/80',
        )}
      >
        <div className="border-border/40 flex items-center justify-between gap-2 border-b pb-1.5">
          <div className="flex items-center gap-1">
            {thread.blocking && <ShieldAlert className="size-3 animate-bounce text-destructive" />}
            <Badge
              variant={thread.blocking && isThreadOpen(thread) ? 'destructive' : 'outline'}
              className="px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider"
            >
              {thread.blocking ? 'Blocking' : 'Non-blocking'}
            </Badge>
          </div>
          <span className="text-muted-foreground/75 text-[10px] font-bold uppercase tracking-wider">
            {getThreadStatus(thread)}
          </span>
        </div>

        <div className="space-y-3">
          {thread.events.map(event => {
            const initials = getInitials(event.actor)
            return (
              <div key={event.id} className="flex gap-2 text-xs">
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-[9px] font-bold text-secondary-foreground shadow-sm"
                  title={event.actor}
                >
                  {initials}
                </span>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="font-bold text-foreground">{event.actor}</span>
                    <span>{getRelativeTimeString(event.createdAt)}</span>
                  </div>
                  {event.body ? (
                    <div className="bg-muted/30 border-muted/20 rounded-lg border p-2 text-muted-foreground">
                      <div className="text-muted-foreground/50 mb-1 text-[9px] font-bold uppercase tracking-wider">
                        {event.action}
                      </div>
                      <MarkdownRemark content={event.body} />
                    </div>
                  ) : (
                    <div className="text-muted-foreground/70 pl-1 text-[10px] capitalize italic">
                      {event.action} the thread
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {isThreadOpen(thread) && (
          <TooltipProvider>
            <div className="border-border/40 mt-2 flex items-center gap-1.5 border-t pt-2">
              <span className="text-muted-foreground/70 mr-1 text-[9px] font-semibold uppercase">Action:</span>

              <RemarkTransitionButton
                label="Resolve"
                tooltip="Mark as resolved"
                icon={<Check className="size-3 text-emerald-500" />}
                disabled={isPending}
                onClick={() =>
                  run(
                    () =>
                      transitionPlanRemarkAction({
                        planId,
                        threadId: thread.id,
                        action: 'resolved',
                      }),
                    'Remark resolved.',
                  )
                }
              />

              <RemarkTransitionButton
                label="Dismiss"
                tooltip="Dismiss remark"
                icon={<X className="size-3 text-muted-foreground" />}
                disabled={isPending}
                onClick={() =>
                  run(
                    () =>
                      transitionPlanRemarkAction({
                        planId,
                        threadId: thread.id,
                        action: 'dismissed',
                      }),
                    'Remark dismissed.',
                  )
                }
              />

              <RemarkTransitionButton
                label="Downgrade"
                tooltip="Downgrade priority"
                icon={<ArrowDown className="size-3 text-amber-500" />}
                disabled={isPending}
                onClick={() =>
                  run(
                    () =>
                      transitionPlanRemarkAction({
                        planId,
                        threadId: thread.id,
                        action: 'downgraded',
                      }),
                    'Remark downgraded.',
                  )
                }
              />
            </div>
          </TooltipProvider>
        )}
      </div>
    </div>
  )
}

// fallow-ignore-next-line complexity
function BaselineAttemptCard({
  attempt,
  planId,
  isPending,
  run,
  regressionJustification,
  onRegressionJustificationChange,
}: {
  attempt: BaselineAttempt
  planId: string
  isPending: boolean
  run: PlanActionRunner
  regressionJustification: string
  onRegressionJustificationChange: (value: string) => void
}) {
  const BaselineIcon = getBaselineIcon(attempt.status, attempt.classification)

  let cardStatusStyle = 'border-l-slate-400 bg-muted/10'
  let badgeStyle = 'border-slate-500/30 bg-slate-500/5 text-slate-700 dark:text-slate-300'
  if (attempt.status === 'running' || attempt.status === 'scheduled') {
    cardStatusStyle = 'border-l-sky-500 bg-sky-500/[0.03] animate-pulse'
    badgeStyle = 'border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300'
  } else if (
    attempt.status === 'cancelled' ||
    attempt.status === 'interrupted' ||
    attempt.classification === 'invalid_baseline_failure' ||
    attempt.classification === 'validation_harness_failure'
  ) {
    cardStatusStyle = 'border-l-destructive bg-destructive/[0.03]'
    badgeStyle = 'border-destructive/30 bg-destructive/5 text-destructive'
  } else if (attempt.status === 'completed') {
    cardStatusStyle = 'border-l-emerald-500 bg-emerald-500/[0.03]'
    badgeStyle = 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
  }

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
    <div
      className={cn(
        'group space-y-3 rounded-xl border border-l-4 p-3.5 text-xs transition-all duration-200 hover:shadow-sm',
        cardStatusStyle,
      )}
    >
      <div className="border-border/40 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <span className="flex min-w-0 items-center gap-2 font-bold">
          <BaselineIcon
            className={cn('size-4 shrink-0', getBaselineIconClass(attempt.status, attempt.classification))}
          />
          <span className="text-foreground/90 truncate text-xs">
            {attempt.browser} / {attempt.environment}
          </span>
        </span>
        <Badge variant="outline" className={cn('px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider', badgeStyle)}>
          {attempt.classification?.replaceAll('_', ' ') ?? attempt.status}
        </Badge>
      </div>
      <p className="text-muted-foreground/80 flex items-center justify-between font-mono text-[10px]">
        <span>ID: {attempt.validationId.slice(0, 12)}...</span>
        <span>Run: #{attempt.testRunId}</span>
      </p>

      <div className="flex flex-wrap gap-1.5">
        {evidenceLinks.map(link => {
          const EvidenceIcon = link.icon
          return (
            <Button
              key={`${link.label}-${link.href}`}
              asChild
              size="sm"
              variant="secondary"
              className="bg-secondary/60 border-border/40 h-7 border px-2 text-[10px] font-medium transition-colors hover:bg-secondary"
            >
              <a href={link.href} target="_blank" rel="noopener noreferrer">
                <EvidenceIcon className="mr-1 size-3" />
                {link.label}
              </a>
            </Button>
          )
        })}
      </div>

      {attempt.classification === 'pre_existing_unrelated_failure' && (
        <Button
          className="mt-1 h-8 w-full text-xs font-semibold"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() =>
            run(
              () =>
                acknowledgeBaselineFailureAction({
                  planId,
                  attemptId: attempt.id,
                }),
              'Unrelated failure acknowledged.',
            )
          }
        >
          Acknowledge unchanged failure
        </Button>
      )}
      {attempt.classification === 'validation_harness_failure' && (
        <div className="border-destructive/30 bg-destructive/10 rounded-lg border p-2.5 text-[11px] font-medium leading-normal text-destructive">
          Runtime harness wiring failed. Fix step definitions, imports, Cucumber config, or setup, then republish.
        </div>
      )}
      {attempt.classification === 'accepted_regression_pass' && !attempt.regressionJustification && (
        <div className="border-border/40 space-y-2 border-t pt-1.5">
          <Textarea
            value={regressionJustification}
            onChange={event => onRegressionJustificationChange(event.target.value)}
            placeholder="Why this passing test still provides required regression coverage"
            className="min-h-[60px] rounded-lg text-xs"
          />
          <Button
            size="sm"
            className="h-8 w-full text-xs font-semibold"
            variant="outline"
            disabled={isPending || !regressionJustification.trim()}
            onClick={() =>
              run(
                () =>
                  justifyBaselineRegressionPassAction({
                    planId,
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
      )}
    </div>
  )
}

// The graph, list, inspector, and approval controls intentionally share one interaction model.
// fallow-ignore-next-line complexity
export function PlanReviewWorkspace({ detail, initialTab }: PlanReviewWorkspaceProps) {
  const router = useRouter()
  const planSlug = getPlanDisplaySlug({
    planId: detail.plan.planId,
    slug: detail.projection.slug,
    legacyPlanId: detail.projection.legacyPlanId,
  })
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
  const [message, setMessage] = useState<ActionMessage | null>(null)
  const [confirmReplacement, setConfirmReplacement] = useState(false)
  const [regressionJustification, setRegressionJustification] = useState('')
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [sidebarTab, setSidebarTab] = useState<'remarks' | 'baselines' | 'approval'>('remarks')
  const [graphSearchQuery, setGraphSearchQuery] = useState('')
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const planMarkdown = useMemo(() => {
    const p = detail.plan
    const lines: string[] = []
    lines.push(`# ${p.goal}`)
    lines.push(``)
    lines.push(`> **Revision:** ${p.revision} | **Lifecycle:** ${p.lifecycle}`)
    if (p.implementationGroups.length > 0) {
      const groupsStr = p.implementationGroups.map(g => `\`${g.id}\` (${g.taskIds.length} tasks)`).join(', ')
      lines.push(`> **Implementation Groups:** ${groupsStr}`)
    }
    lines.push(``)
    lines.push(`## Description`)
    lines.push(p.description)
    lines.push(``)

    // Group tasks by stage
    const stages: Record<number, typeof semanticFlow.tasks> = {}
    semanticFlow.tasks.forEach(task => {
      const stageNum = task.stage ?? 1
      if (!stages[stageNum]) {
        stages[stageNum] = []
      }
      stages[stageNum].push(task)
    })

    const sortedStages = Object.keys(stages)
      .map(Number)
      .sort((a, b) => a - b)

    lines.push(`## Stages & Tasks`)
    lines.push(``)
    sortedStages.forEach(stageNum => {
      lines.push(`### Stage ${stageNum}`)
      lines.push(``)
      const stageTasks = stages[stageNum].sort((a, b) => (a.step ?? 0) - (b.step ?? 0))
      stageTasks.forEach(task => {
        lines.push(`#### Step ${task.step}: ${task.title}`)
        lines.push(`- **Status:** \`${task.status}\``)
        if (task.description) {
          lines.push(`- **Description:** ${task.description}`)
        }

        // Prerequisites
        const prereqs = semanticFlow.edges
          .filter(e => e.target === task.id && e.type === 'depends-on')
          .map(e => {
            const t = semanticFlow.tasks.find(tk => tk.id === e.source)
            return t ? `Step ${t.step} (${t.title})` : e.source
          })
        if (prereqs.length > 0) {
          lines.push(`- **Prerequisites:** ${prereqs.join(', ')}`)
        }

        // Acceptance Criteria
        if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
          lines.push(`- **Acceptance Criteria:**`)
          task.acceptanceCriteria.forEach(c => {
            lines.push(`  - ${c}`)
          })
        }
        lines.push(``)
      })
    })

    return lines.join('\n')
  }, [detail.plan, semanticFlow])

  const downloadMarkdown = () => {
    const element = document.createElement('a')
    const file = new Blob([planMarkdown], { type: 'text/markdown' })
    element.href = URL.createObjectURL(file)
    element.download = `plan-${detail.plan.planId}-rev${detail.plan.revision}.md`
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(planMarkdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const selectedTask = semanticFlow.tasks.find(task => task.id === selectedTaskId)
  const openRemarksCount = selectedTaskId
    ? (openRemarksByTask.get(selectedTaskId) ?? 0)
    : (detail.review?.threads.filter(t => t.target.type === 'plan' && isThreadOpen(t)).length ?? 0)
  const taskRelationships = useMemo(() => {
    const buckets: Record<RelationBucket, Array<{ id: string; title: string; step: number }>> = {
      prerequisites: [],
      blocks: [],
      relatesTo: [],
    }
    if (!selectedTaskId) return buckets

    const taskById = new Map(semanticFlow.tasks.map(t => [t.id, t]))

    for (const edge of semanticFlow.edges) {
      const rule = RELATION_RULES[edge.type]
      if (!rule) continue

      let bucket: RelationBucket
      let neighborId: string
      if (edge.source === selectedTaskId) {
        bucket = rule.asSource
        neighborId = edge.target
      } else if (edge.target === selectedTaskId) {
        bucket = rule.asTarget
        neighborId = edge.source
      } else {
        continue
      }

      const task = taskById.get(neighborId)
      if (task) buckets[bucket].push({ id: task.id, title: task.title, step: task.step })
    }

    return buckets
  }, [selectedTaskId, semanticFlow.edges, semanticFlow.tasks])

  const focusAndSelectTask = useCallback(
    (taskId: string) => {
      setSelectedTaskId(taskId)
      setSidebarTab('remarks')
      // If the graph is rendered, center it
      const node = nodes.find(n => n.id === taskId)
      if (node && flowInstanceRef.current) {
        flowInstanceRef.current.fitView({ nodes: [node], duration: 400, padding: 0.3 })
      }
    },
    [nodes],
  )

  const searchResults = useMemo(() => {
    if (!graphSearchQuery.trim()) return []
    const query = graphSearchQuery.toLowerCase()
    return semanticFlow.tasks.filter(
      task => task.title.toLowerCase().includes(query) || task.id.toLowerCase().includes(query),
    )
  }, [graphSearchQuery, semanticFlow.tasks])

  const tasksByStage = useMemo(() => {
    const stages: Record<number, typeof semanticFlow.tasks> = {}
    for (const task of semanticFlow.tasks) {
      if (!stages[task.stage]) {
        stages[task.stage] = []
      }
      stages[task.stage].push(task)
    }
    return Object.entries(stages).sort(([a], [b]) => Number(a) - Number(b))
  }, [semanticFlow])
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

  const defaultTab = initialTab ?? (detail.listFallback ? 'list' : 'graph')
  const [activeTab, setActiveTab] = useState<string>(defaultTab)

  const run = (
    operation: () => Promise<{ success?: boolean; error?: string }>,
    successMessage: string,
    options?: { recovery?: ActionMessage['recovery'] },
  ) => {
    setMessage(null)
    startTransition(async () => {
      const result = await operation()
      const recovery =
        !result.success &&
        options?.recovery === 'validation-drift' &&
        result.error?.includes('Validation files changed after approval or baseline execution')
          ? options.recovery
          : undefined
      setMessage({
        tone: result.success ? 'success' : 'error',
        text: result.success ? successMessage : (result.error ?? 'The action failed.'),
        recovery,
      })
      if (result.success) router.refresh()
    })
  }

  const reopenValidationReviewAfterDrift = () =>
    run(
      () =>
        submitValidationFeedbackAction({
          planId: detail.plan.planId,
          scope: 'test_artifact',
          target: { type: 'plan' },
          body:
            message?.text ??
            'Validation files changed after approval or baseline execution. Re-review validation artifacts.',
          affectedValidationIds: detail.validation?.validations.map(validation => validation.id),
          affectedFilePaths: detail.validation?.files.map(file => file.path),
        }),
      'Validation review reopened.',
    )

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

  useEffect(() => {
    if (!graphSearchQuery.trim()) {
      setNodes(currentNodes =>
        currentNodes.map(node => ({
          ...node,
          style: undefined,
        })),
      )
      return
    }
    const query = graphSearchQuery.toLowerCase()
    setNodes(currentNodes =>
      currentNodes.map(node => {
        const matches = node.data.title.toLowerCase().includes(query) || node.id.toLowerCase().includes(query)
        return {
          ...node,
          style: {
            opacity: matches ? 1 : 0.3,
            transition: 'opacity 0.2s ease-in-out',
          },
        }
      }),
    )
  }, [graphSearchQuery, setNodes])

  const selectAdjacentTask = useCallback(
    (direction: 1 | -1) => {
      const tasks = detail.plan.tasks
      if (tasks.length === 0) return
      setSelectedTaskId(current => {
        const currentIndex = tasks.findIndex(t => t.id === current)
        if (currentIndex === -1) {
          return direction === 1 ? tasks[0].id : tasks[tasks.length - 1].id
        }
        const nextIndex = (currentIndex + direction + tasks.length) % tasks.length
        return tasks[nextIndex].id
      })
    },
    [detail.plan.tasks],
  )

  const keyActions = useMemo<Record<string, () => void>>(() => {
    const actions: Record<string, () => void> = {
      l: () => setActiveTab('list'),
      h: () => setActiveTab('history'),
      v: () => setActiveTab('validations'),
      i: () => setInspectorOpen(open => !open),
      escape: () => setSelectedTaskId(null),
      j: () => selectAdjacentTask(1),
      arrowdown: () => selectAdjacentTask(1),
      k: () => selectAdjacentTask(-1),
      arrowup: () => selectAdjacentTask(-1),
      '?': () => setShortcutsModalOpen(true),
    }
    if (!detail.listFallback) {
      actions.g = () => setActiveTab('graph')
    }
    return actions
  }, [detail.listFallback, selectAdjacentTask])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement
      const isTyping =
        el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.getAttribute('contenteditable') === 'true'
      if (isTyping) return

      const action = keyActions[e.key.toLowerCase()]
      if (!action) return
      e.preventDefault()
      action()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [keyActions])

  return (
    <main className="space-y-5 pb-10">
      {/* Sleek breadcrumb-like top bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/plans" className="flex items-center gap-1 transition-colors hover:text-foreground">
            <ArrowLeft className="size-4" />
            Plans
          </Link>
          <span>/</span>
          <span className="max-w-[200px] truncate font-semibold text-foreground sm:max-w-[400px]">
            {detail.plan.goal}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {renderLifecycleBadge(detail.plan.lifecycle)}
          {approved && (
            <Badge
              className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
              variant="outline"
            >
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Approved
            </Badge>
          )}
        </div>
      </div>

      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="max-w-4xl space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1 font-mono text-xs">
              <Hash className="size-3 text-muted-foreground" />
              Rev {detail.plan.revision}
            </Badge>
            {detail.projection.stale && (
              <Badge variant="destructive" className="gap-1.5 pl-2">
                <span className="size-1.5 animate-pulse rounded-full bg-destructive" />
                Stale
              </Badge>
            )}
            {detail.projection.conflicted && (
              <Badge variant="destructive" className="gap-1.5 pl-2">
                <span className="size-1.5 animate-pulse rounded-full bg-destructive" />
                Conflicted
              </Badge>
            )}
          </div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            {detail.plan.goal}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{detail.plan.description}</p>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 text-xs text-muted-foreground">
            {detail.plan.implementationGroups.length > 0 && (
              <div className="flex items-center gap-1.5" aria-label="Implementation groups">
                <Folder className="size-3.5 text-muted-foreground" />
                <span className="font-medium">Groups:</span>
                <div className="flex flex-wrap gap-1">
                  {detail.plan.implementationGroups.map(group => (
                    <Badge key={group.id} variant="secondary" className="px-1.5 py-0 font-mono text-[10px]">
                      {group.id} ({group.taskIds.length})
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Layers className="size-3.5" />
              <span className="font-mono">{planSlug}</span>
              {planSlug !== detail.plan.planId && (
                <span className="text-muted-foreground/70 font-mono">(ID: {detail.plan.planId})</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 md:self-start">
          <Button
            variant="outline"
            size="sm"
            className="animate-fade-in h-9"
            onClick={() => setShortcutsModalOpen(true)}
            title="Keyboard Shortcuts (?)"
          >
            <Keyboard className="mr-2 size-4" />
            Shortcuts
          </Button>
          <Button variant="outline" size="sm" className="h-9" onClick={() => setExportModalOpen(true)}>
            <FileText className="mr-2 size-4" />
            Export Plan
          </Button>
          <Button variant="outline" size="sm" className="h-9" onClick={() => setInspectorOpen(open => !open)}>
            {inspectorOpen ? <PanelRightClose className="mr-2 size-4" /> : <PanelRightOpen className="mr-2 size-4" />}
            {inspectorOpen ? 'Hide inspector' : 'Show inspector'}
          </Button>
        </div>
      </header>

      {detail.projection.stale || detail.projection.conflicted ? (
        <Alert variant="destructive" className="rounded-xl">
          <AlertTriangle className="size-4" />
          <AlertTitle>Artifact health requires attention</AlertTitle>
          <AlertDescription>
            {detail.issues.map(issue => issue.message).join(' ') || 'The current projection is stale or conflicted.'}
          </AlertDescription>
        </Alert>
      ) : null}
      {message ? (
        <Alert variant={message.tone === 'error' ? 'destructive' : 'default'} className="rounded-xl">
          {message.tone === 'error' ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}
          <AlertTitle>{message.tone === 'error' ? 'Action blocked' : 'Action complete'}</AlertTitle>
          <AlertDescription>
            <span>{message.text}</span>
            {message.recovery === 'validation-drift' ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-destructive/50 hover:bg-destructive/10 mt-3 text-destructive hover:text-destructive"
                disabled={isPending}
                onClick={reopenValidationReviewAfterDrift}
              >
                Reopen validation review
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {detail.plan.lifecycle === 'draft' ? (
        <Alert className="rounded-xl">
          <FileText className="size-4" />
          <AlertTitle>Draft not submitted for review</AlertTitle>
          <AlertDescription>
            Remarks can be captured, but approval and change-request actions are locked until the plan is submitted for
            plan review.
          </AlertDescription>
        </Alert>
      ) : null}
      {detail.listFallback ? (
        <Alert className="rounded-xl">
          <List className="size-4" />
          <AlertTitle>Graph unavailable, list review enabled</AlertTitle>
          <AlertDescription>
            Repeated graph processing failures do not invalidate the plan. All review controls remain available below.
          </AlertDescription>
        </Alert>
      ) : null}
      {detail.orphanedThreadIds.length > 0 ? (
        <Alert variant="destructive" className="rounded-xl">
          <AlertTriangle className="size-4" />
          <AlertTitle>Removed-node remarks need a decision</AlertTitle>
          <AlertDescription>
            {detail.orphanedThreadIds.length} open remark(s) target nodes no longer present in this revision.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className={cn('grid gap-5', inspectorOpen && 'xl:grid-cols-[minmax(0,1fr)_420px]')}>
        <Card className="overflow-hidden rounded-xl border">
          <CardHeader className="bg-muted/10 border-b">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg">Review surface</CardTitle>
                <CardDescription className="text-xs">
                  Steps progress left to right. Tasks in the same stage may proceed in parallel.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="w-4 border-t-2 border-muted-foreground" /> depends-on
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-4 border-t-2 border-dashed border-destructive" /> blocks
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-4 border-t-2 border-dotted border-green-500" /> relates-to
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="bg-muted/5 border-b px-4 py-2">
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
                  <TabsTrigger value="validations">
                    <CheckCircle2 className="mr-2 size-4" />
                    Validations
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="graph" className="bg-muted/5 relative m-0 h-[620px]">
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
                  <>
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

                    {/* Floating Graph Toolbar */}
                    <TooltipProvider>
                      <div className="bg-background/90 absolute left-4 top-4 z-10 flex flex-wrap items-center gap-2 rounded-xl border p-2 shadow-lg backdrop-blur-md transition-all">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            type="text"
                            placeholder="Search tasks..."
                            value={graphSearchQuery}
                            onChange={e => setGraphSearchQuery(e.target.value)}
                            className="h-8 w-44 rounded-lg pl-8 pr-2 text-xs"
                          />
                          {searchResults.length > 0 && (
                            <div className="absolute left-0 top-full z-20 mt-1.5 max-h-48 w-64 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg">
                              {searchResults.map(result => (
                                <button
                                  key={result.id}
                                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
                                  onClick={() => {
                                    focusAndSelectTask(result.id)
                                    setGraphSearchQuery('')
                                  }}
                                >
                                  <span className="font-mono text-[10px] opacity-70">#{result.step}</span>
                                  <span className="flex-1 truncate">{result.title}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="h-4 w-px bg-border" />

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:bg-muted hover:text-foreground"
                              disabled={isPending}
                              onClick={() =>
                                run(
                                  () =>
                                    savePersonalPlanLayoutAction({
                                      planId: detail.plan.planId,
                                      positions: positions(),
                                    }),
                                  'Personal layout saved.',
                                )
                              }
                            >
                              <Save className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Save Personal Layout</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:bg-muted hover:text-foreground"
                              disabled={isPending}
                              onClick={() =>
                                run(
                                  () =>
                                    publishSharedPlanLayoutAction({
                                      planId: detail.plan.planId,
                                      positions: positions(),
                                    }),
                                  'Shared layout written to the Git-tracked sidecar.',
                                )
                              }
                            >
                              <Share2 className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Publish Shared Layout (Git)</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:bg-muted hover:text-foreground"
                              type="button"
                              onClick={resetToFlow}
                            >
                              <RefreshCcw className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Reset to Flow Layout</TooltipContent>
                        </Tooltip>
                      </div>
                    </TooltipProvider>
                  </>
                )}
              </TabsContent>
              <TabsContent value="list" className="m-0 space-y-8 p-6">
                {tasksByStage.map(([stageNum, stageTasks]) => (
                  <div key={stageNum} className="space-y-4">
                    <div className="flex items-center gap-2 border-b pb-2">
                      <Layers className="size-4 text-muted-foreground" />
                      <h3 className="font-heading text-base font-semibold text-foreground">
                        Stage {Number(stageNum) + 1}
                      </h3>
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-semibold">
                        {stageTasks.length} task{stageTasks.length > 1 ? 's' : ''}
                      </Badge>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      {stageTasks.map(task => {
                        const isSelected = selectedTaskId === task.id
                        return (
                          <div
                            key={task.id}
                            className={cn(
                              'hover:border-muted-foreground/30 group relative cursor-pointer rounded-xl border bg-card p-4 text-left transition-all duration-200 hover:shadow-md',
                              isSelected
                                ? 'bg-primary/5 border-primary shadow-sm ring-1 ring-primary'
                                : 'border-border',
                            )}
                            onClick={() => {
                              setSelectedTaskId(task.id)
                              setSidebarTab('remarks')
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="bg-muted/50 flex size-6 shrink-0 items-center justify-center rounded-md border font-mono text-xs font-semibold">
                                  {task.step}
                                </span>
                                <h4 className="font-heading text-sm font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">
                                  {task.title}
                                </h4>
                              </div>
                              <Badge
                                variant={task.status === 'blocked' ? 'destructive' : 'outline'}
                                className="px-1.5 py-0 text-[10px] font-semibold"
                              >
                                {task.status}
                              </Badge>
                            </div>

                            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>

                            <div className="mt-4 space-y-1 border-t pt-3 text-[10px] text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <span className="text-foreground/80 font-semibold">Relationships:</span>
                                <span className="max-w-[240px] truncate">
                                  {taskRelationshipSummary(task.id, semanticFlow)}
                                </span>
                              </div>
                              {task.validationIntent && (
                                <div className="flex items-center gap-1">
                                  <span className="text-foreground/80 font-semibold">Validated by:</span>
                                  <span className="max-w-[240px] truncate">{task.validationIntent}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="history" className="m-0 p-5">
                <div className="space-y-3">
                  {detail.revisions.map((revision, index) => (
                    <div
                      key={revision.id}
                      className="hover:bg-muted/10 flex items-center justify-between rounded-xl border p-4 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-semibold">
                          {index === 0 ? 'Current snapshot' : `Earlier snapshot ${index}`}
                        </p>
                        <p className="text-muted-foreground/80 mt-1 font-mono text-xs">{revision.sourceHash}</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p className="font-medium text-foreground">{revision.createdAt.toLocaleString()}</p>
                        <p className="text-muted-foreground/80 mt-0.5 font-mono">
                          {revision.reducedAssurance ? 'Filesystem snapshot' : revision.gitCommit?.slice(0, 10)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="validations" className="m-0">
                <ValidationReviewPanel
                  detail={detail}
                  isPending={isPending}
                  run={run}
                  onDecideValidation={(validationId, decision) =>
                    decideValidationNodeAction({ planId: detail.plan.planId, validationId, decision })
                  }
                  onApproveFile={path => approveValidationFileAction({ planId: detail.plan.planId, path })}
                  onSubmitReview={() => submitValidationReviewAction({ planId: detail.plan.planId })}
                  onCancelBaseline={() => cancelBaselineExecutionAction({ planId: detail.plan.planId })}
                  onAcceptBaseline={() => acceptBaselineAction({ planId: detail.plan.planId })}
                  onSubmitFeedback={input =>
                    submitValidationFeedbackAction({
                      planId: detail.plan.planId,
                      ...input,
                    })
                  }
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {inspectorOpen ? (
          <aside className="animate-fade-in space-y-5">
            <Card className="overflow-hidden rounded-xl border shadow-md">
              <Tabs value={sidebarTab} onValueChange={v => setSidebarTab(v as 'remarks' | 'baselines' | 'approval')}>
                <div className="bg-muted/40 border-b px-3 py-2">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="remarks" className="gap-1 text-xs font-semibold">
                      Discussion
                      {openRemarksCount > 0 && (
                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                          {openRemarksCount}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="baselines" className="text-xs font-semibold" disabled={!detail.validation}>
                      Baselines
                    </TabsTrigger>
                    <TabsTrigger value="approval" className="text-xs font-semibold">
                      Approval
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Tab 1: Remarks & Discussion (Consolidated Details, Adding Remark, Threads, Retargeting) */}
                <TabsContent value="remarks" className="m-0 space-y-4 p-4">
                  {/* Task / Plan-wide Details Card */}
                  <div className="bg-muted/35 space-y-2.5 rounded-xl border p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-heading text-sm font-bold tracking-tight text-foreground">
                        {selectedTask ? `Task ${selectedTask.step}: ${selectedTask.title}` : 'Plan-wide details'}
                      </h3>
                      {selectedTask && (
                        <Badge
                          variant={selectedTask.status === 'blocked' ? 'destructive' : 'outline'}
                          className="py-0 text-[10px] font-bold capitalize"
                        >
                          {selectedTask.status}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {selectedTask ? selectedTask.description : 'Remarks captured here apply to the plan as a whole.'}
                    </p>

                    {selectedTask && selectedTask.acceptanceCriteria.length > 0 && (
                      <div className="border-border/40 space-y-1 border-t pt-2">
                        <p className="text-muted-foreground/80 text-[10px] font-bold uppercase tracking-wider">
                          Acceptance criteria
                        </p>
                        <ul className="list-disc space-y-0.5 pl-4 text-xs leading-normal text-muted-foreground">
                          {selectedTask.acceptanceCriteria.map(criterion => (
                            <li key={criterion}>{criterion}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {selectedTask && (
                      <div className="border-border/40 space-y-1.5 border-t pt-2 text-xs">
                        <p className="text-muted-foreground/80 text-[10px] font-bold uppercase tracking-wider">
                          Relationships
                        </p>
                        {taskRelationships.prerequisites.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] text-muted-foreground">Prerequisites:</span>
                            <div className="flex flex-wrap gap-1">
                              {taskRelationships.prerequisites.map(pre => (
                                <Button
                                  key={pre.id}
                                  variant="secondary"
                                  size="sm"
                                  className="h-5 gap-1 px-1.5 text-[10px] font-medium"
                                  onClick={() => focusAndSelectTask(pre.id)}
                                >
                                  <span className="font-mono opacity-70">#{pre.step}</span>
                                  <span className="max-w-[120px] truncate">{pre.title}</span>
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}
                        {taskRelationships.blocks.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] text-muted-foreground">Blocks:</span>
                            <div className="flex flex-wrap gap-1">
                              {taskRelationships.blocks.map(b => (
                                <Button
                                  key={b.id}
                                  variant="secondary"
                                  size="sm"
                                  className="h-5 gap-1 px-1.5 text-[10px] font-medium"
                                  onClick={() => focusAndSelectTask(b.id)}
                                >
                                  <span className="font-mono opacity-70">#{b.step}</span>
                                  <span className="max-w-[120px] truncate">{b.title}</span>
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}
                        {taskRelationships.relatesTo.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] text-muted-foreground">Relates to:</span>
                            <div className="flex flex-wrap gap-1">
                              {taskRelationships.relatesTo.map(r => (
                                <Button
                                  key={r.id}
                                  variant="secondary"
                                  size="sm"
                                  className="h-5 gap-1 px-1.5 text-[10px] font-medium"
                                  onClick={() => focusAndSelectTask(r.id)}
                                >
                                  <span className="font-mono opacity-70">#{r.step}</span>
                                  <span className="max-w-[120px] truncate">{r.title}</span>
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}
                        {taskRelationships.prerequisites.length === 0 &&
                          taskRelationships.blocks.length === 0 &&
                          taskRelationships.relatesTo.length === 0 && (
                            <p className="text-[10px] italic text-muted-foreground">No displayed relationships.</p>
                          )}
                      </div>
                    )}
                  </div>

                  {/* Add Remark Form */}
                  <div className="space-y-3 border-t pt-3">
                    <div className="flex items-center justify-between">
                      <p className="text-muted-foreground/80 text-[10px] font-bold uppercase tracking-wider">
                        Add Remark
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                        onClick={() => setSelectedTaskId(selectedTask ? null : (detail.plan.tasks[0]?.id ?? null))}
                      >
                        <MessageSquare className="mr-1 size-3" />
                        {selectedTask ? 'Switch to Plan-wide' : 'Switch to Selected Task'}
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="remark" className="sr-only">
                        Remark body
                      </Label>
                      <Textarea
                        id="remark"
                        value={remarkBody}
                        onChange={event => setRemarkBody(event.target.value)}
                        placeholder={`Type a comment for ${selectedTask ? `Task ${selectedTask.step}` : 'the Plan'}... (Supports markdown)`}
                        className="min-h-[85px] rounded-xl text-xs"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="blocking"
                          checked={blocking}
                          onCheckedChange={value => setBlocking(value === true)}
                        />
                        <Label
                          htmlFor="blocking"
                          className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground"
                        >
                          Blocking remark
                        </Label>
                      </div>
                      <Button
                        size="sm"
                        className="h-8 px-3 text-xs font-semibold"
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
                          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                        ) : (
                          <MessageSquare className="mr-1.5 size-3.5" />
                        )}
                        Comment
                      </Button>
                    </div>
                  </div>

                  {/* Modernized Remark Threads (Timeline/Chat style) */}
                  <div className="space-y-3 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-muted-foreground/80 text-[10px] font-bold uppercase tracking-wider">
                        Remarks History
                      </h4>
                      <Badge variant="secondary" className="px-1 font-mono text-[9px] font-bold">
                        {visibleThreads.length} Thread{visibleThreads.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>

                    <div className="after:bg-border/40 relative max-h-[360px] space-y-4 overflow-y-auto pl-4 pr-1 after:absolute after:inset-y-1 after:left-1.5 after:w-0.5">
                      {visibleThreads.length === 0 ? (
                        <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                          No remarks for this target.
                        </div>
                      ) : (
                        visibleThreads.map(thread => (
                          <PlanRemarkThreadItem
                            key={thread.id}
                            thread={thread}
                            planId={detail.plan.planId}
                            isPending={isPending}
                            run={run}
                          />
                        ))
                      )}
                    </div>
                  </div>

                  {/* Retargeting block */}
                  {detail.orphanedThreadIds.length > 0 && (
                    <div className="space-y-3 border-t pt-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Retarget removed-node remarks
                      </h4>
                      <div className="space-y-1.5">
                        {detail.orphanedThreadIds.map(threadId => (
                          <Button
                            key={threadId}
                            variant="outline"
                            size="sm"
                            className="h-8 w-full justify-start rounded-lg text-xs"
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
                            Retarget {threadId.slice(0, 12)}... to selected task
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Tab 2: Baseline & Validation (Baseline execution, runs list, and control) */}
                <TabsContent value="baselines" className="m-0 space-y-4 p-4">
                  <div>
                    <h3 className="font-heading text-sm font-bold">Baseline Evidence Execution</h3>
                    <p className="mt-1 text-[11px] leading-normal text-muted-foreground">
                      Required browser and environment combinations must have accepted evidence before implementation
                      begins.
                    </p>
                  </div>

                  {detail.validation && (
                    <div className="max-h-[440px] space-y-3 overflow-y-auto pr-1">
                      {detail.validation.baselineAttempts.length === 0 ? (
                        <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                          No baseline attempts have been submitted yet.
                        </div>
                      ) : (
                        detail.validation.baselineAttempts.map(attempt => (
                          <BaselineAttemptCard
                            key={attempt.id}
                            attempt={attempt}
                            planId={detail.plan.planId}
                            isPending={isPending}
                            run={run}
                            regressionJustification={regressionJustification}
                            onRegressionJustificationChange={setRegressionJustification}
                          />
                        ))
                      )}
                    </div>
                  )}

                  <div className="grid gap-2 border-t pt-4">
                    {['validations_approved', 'baseline_changes_requested'].includes(detail.plan.lifecycle) && (
                      <p className="bg-muted/20 rounded-xl border p-3 text-xs leading-relaxed text-muted-foreground">
                        Validation review is approved. The connected agent starts required baselines through MCP.
                      </p>
                    )}
                    {detail.plan.lifecycle === 'baseline_running' && (
                      <>
                        <p className="bg-muted/20 rounded-xl border p-3 text-xs leading-relaxed text-muted-foreground">
                          Baseline runs are active. The connected agent reconciles run evidence through MCP.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 rounded-xl font-semibold"
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
                    )}
                    {detail.plan.lifecycle === 'baseline_review' && (
                      <Button
                        size="sm"
                        className="h-9 rounded-xl font-semibold"
                        disabled={isPending}
                        onClick={() =>
                          run(() => acceptBaselineAction({ planId: detail.plan.planId }), 'Baselines accepted.')
                        }
                      >
                        Accept complete baseline
                      </Button>
                    )}
                    {detail.plan.lifecycle === 'baseline_accepted' && (
                      <p className="bg-muted/20 rounded-xl border p-3 text-xs leading-relaxed text-muted-foreground">
                        Baseline evidence is accepted. The connected agent unlocks implementation through MCP.
                      </p>
                    )}
                  </div>
                </TabsContent>

                {/* Tab 3: Approval & Actions (Revision approval, suspicious replacements, and layout settings) */}
                <TabsContent value="approval" className="m-0 space-y-4 p-4">
                  <div>
                    <h3 className="font-heading text-sm font-bold">Revision Approval</h3>
                    <p className="mt-1 text-[11px] leading-normal text-muted-foreground">
                      Approval binds to revision {detail.plan.revision} and its exact plan hash.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {suspiciousReplacement && (
                      <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
                        <Checkbox
                          id="replacement-confirmation"
                          checked={confirmReplacement}
                          onCheckedChange={value => setConfirmReplacement(value === true)}
                          className="mt-0.5"
                        />
                        <Label
                          htmlFor="replacement-confirmation"
                          className="cursor-pointer text-xs font-medium leading-normal text-amber-800 dark:text-amber-200"
                        >
                          Confirm that replaced node identities are intentional.
                        </Label>
                      </div>
                    )}
                    <Button
                      className="h-10 w-full rounded-xl font-bold"
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
                      <Check className="mr-2 size-4 stroke-[2.2]" />
                      {approved ? 'Revision approved' : 'Approve exact revision'}
                    </Button>
                    {approvalDisabledReason && (
                      <p
                        id="approval-disabled-reason"
                        className="text-center text-xs leading-normal text-muted-foreground"
                      >
                        {approvalDisabledReason}
                      </p>
                    )}
                    <Button
                      className="h-10 w-full rounded-xl font-bold"
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
                    {requestChangesDisabledReason && (
                      <p
                        id="request-changes-disabled-reason"
                        className="text-center text-xs leading-normal text-muted-foreground"
                      >
                        {requestChangesDisabledReason}
                      </p>
                    )}
                  </div>

                  {/* Layout controls as a distinct section within the same tab */}
                  {!detail.listFallback && activeTab === 'graph' && (
                    <div className="mt-2 space-y-3 border-t pt-4">
                      <div>
                        <h4 className="text-muted-foreground/80 text-[10px] font-bold uppercase tracking-wider">
                          Graph Layout Options
                        </h4>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Adjust nodes on the canvas and save your personal layout or publish it to Git.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5 rounded-lg text-xs font-semibold"
                          disabled={isPending}
                          onClick={() =>
                            run(
                              () =>
                                savePersonalPlanLayoutAction({ planId: detail.plan.planId, positions: positions() }),
                              'Personal layout saved.',
                            )
                          }
                        >
                          <Save className="size-3.5" />
                          Save Personal
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5 rounded-lg text-xs font-semibold"
                          disabled={isPending}
                          onClick={() =>
                            run(
                              () =>
                                publishSharedPlanLayoutAction({ planId: detail.plan.planId, positions: positions() }),
                              'Shared layout written to the Git-tracked sidecar.',
                            )
                          }
                        >
                          <Share2 className="size-3.5" />
                          Publish Shared
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-full gap-1.5 rounded-lg text-xs font-semibold"
                        type="button"
                        onClick={resetToFlow}
                      >
                        <RefreshCcw className="size-3.5" />
                        Reset to Flow Layout
                      </Button>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </Card>
          </aside>
        ) : null}
      </div>

      <Dialog open={shortcutsModalOpen} onOpenChange={setShortcutsModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="size-5 text-primary" />
              Keyboard Shortcuts
            </DialogTitle>
            <DialogDescription>Use these shortcuts to quickly navigate the workspace.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {SHORTCUT_SECTIONS.map((section, index) => (
              <ShortcutSection key={section.title} title={section.title} items={section.items} withBorder={index > 0} />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
        <DialogContent className="flex max-h-[80vh] max-w-3xl flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-5 text-primary" />
              Export Plan as Markdown
            </DialogTitle>
            <DialogDescription>Copy or download this plan as a formatted Markdown document.</DialogDescription>
          </DialogHeader>
          <div className="bg-muted/50 min-h-0 flex-1 select-all overflow-y-auto whitespace-pre-wrap rounded-md border p-4 font-mono text-xs">
            {planMarkdown}
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={copyToClipboard} className="gap-1.5">
              {copied ? (
                <>
                  <Check className="size-4 text-emerald-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="size-4" />
                  Copy to Clipboard
                </>
              )}
            </Button>
            <Button onClick={downloadMarkdown} className="gap-1.5">
              <Download className="size-4" />
              Download .md
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
