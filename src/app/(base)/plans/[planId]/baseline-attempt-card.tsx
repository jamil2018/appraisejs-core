import type { LucideIcon } from 'lucide-react'
import { CheckCircle2, Clock, ExternalLink, FileText, GitCompare, Image, Loader2, XCircle } from 'lucide-react'

import {
  acknowledgeBaselineFailureAction,
  justifyBaselineRegressionPassAction,
} from '@/actions/plan-review/plan-review-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

type PlanActionRunner = (
  operation: () => Promise<{ success?: boolean; error?: string }>,
  successMessage: string,
) => void

type BaselineAttempt = NonNullable<PlanReviewDetail['validation']>['baselineAttempts'][number]

type BaselineVisualStyle = {
  card: string
  badge: string
}

const baselineVisualStyles = {
  running: {
    card: 'border-l-sky-500 bg-sky-500/[0.03] animate-pulse',
    badge: 'border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300',
  },
  failed: {
    card: 'border-l-destructive bg-destructive/[0.03]',
    badge: 'border-destructive/30 bg-destructive/5 text-destructive',
  },
  completed: {
    card: 'border-l-emerald-500 bg-emerald-500/[0.03]',
    badge: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300',
  },
  default: {
    card: 'border-l-slate-400 bg-muted/10',
    badge: 'border-slate-500/30 bg-slate-500/5 text-slate-700 dark:text-slate-300',
  },
} satisfies Record<string, BaselineVisualStyle>

const baselineVisualRules: Array<{
  matches: (attempt: BaselineAttempt) => boolean
  style: BaselineVisualStyle
}> = [
  {
    matches: attempt => attempt.status === 'running' || attempt.status === 'scheduled',
    style: baselineVisualStyles.running,
  },
  {
    matches: attempt =>
      attempt.status === 'cancelled' ||
      attempt.status === 'interrupted' ||
      attempt.classification === 'invalid_baseline_failure' ||
      attempt.classification === 'validation_harness_failure',
    style: baselineVisualStyles.failed,
  },
  { matches: attempt => attempt.status === 'completed', style: baselineVisualStyles.completed },
]

function getBaselineAttemptVisualStyle(attempt: BaselineAttempt): BaselineVisualStyle {
  return baselineVisualRules.find(rule => rule.matches(attempt))?.style ?? baselineVisualStyles.default
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

function buildBaselineEvidenceLinks(attempt: BaselineAttempt) {
  const traceLinks = attempt.evidence.traceUrls.map((url, index) => ({
    label: `Trace ${index + 1}`,
    href: url,
    icon: GitCompare,
  }))
  const screenshotLinks = attempt.evidence.screenshotUrls.map((url, index) => ({
    label: `Screenshot ${index + 1}`,
    href: url,
    icon: Image,
  }))

  return [
    { label: 'Logs', href: attempt.evidence.logsUrl, icon: FileText },
    { label: 'Report', href: attempt.evidence.reportUrl, icon: ExternalLink },
    ...traceLinks,
    ...screenshotLinks,
  ]
}

export function BaselineAttemptCard({
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
  const visualStyle = getBaselineAttemptVisualStyle(attempt)
  const evidenceLinks = buildBaselineEvidenceLinks(attempt)

  return (
    <div
      className={cn(
        'group space-y-3 rounded-xl border border-l-4 p-3.5 text-xs transition-all duration-200 hover:shadow-sm',
        visualStyle.card,
      )}
    >
      <div className="border-border/40 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <span className="flex min-w-0 items-center gap-2 font-bold">
          <BaselineStatusIcon
            status={attempt.status}
            classification={attempt.classification}
            className="size-4 shrink-0"
          />
          <span className="text-foreground/90 truncate text-xs">
            {attempt.browser} / {attempt.environment}
          </span>
        </span>
        <Badge
          variant="outline"
          className={cn('px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider', visualStyle.badge)}
        >
          {attempt.classification?.replaceAll('_', ' ') ?? attempt.status}
        </Badge>
      </div>

      <p className="text-muted-foreground/80 flex items-center justify-between font-mono text-[10px]">
        <span>ID: {attempt.validationId.slice(0, 12)}...</span>
        <span>Run: #{attempt.testRunId}</span>
      </p>

      <BaselineEvidenceLinks links={evidenceLinks} />
      <BaselineAttemptFollowUp
        attempt={attempt}
        planId={planId}
        isPending={isPending}
        run={run}
        regressionJustification={regressionJustification}
        onRegressionJustificationChange={onRegressionJustificationChange}
      />
    </div>
  )
}

function BaselineStatusIcon({
  status,
  classification,
  className,
}: {
  status: string
  classification?: string
  className?: string
}) {
  const iconClass = cn(getBaselineIconClass(status, classification), className)

  if (status === 'running' || status === 'scheduled') {
    return <Loader2 className={iconClass} />
  }
  if (
    status === 'cancelled' ||
    status === 'interrupted' ||
    classification === 'invalid_baseline_failure' ||
    classification === 'validation_harness_failure'
  ) {
    return <XCircle className={iconClass} />
  }
  if (status === 'completed') {
    return <CheckCircle2 className={iconClass} />
  }
  return <Clock className={iconClass} />
}

function BaselineEvidenceLinks({ links }: { links: Array<{ label: string; href: string; icon: LucideIcon }> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {links.map(link => (
        <BaselineEvidenceLink key={`${link.label}-${link.href}`} link={link} />
      ))}
    </div>
  )
}

function BaselineEvidenceLink({ link }: { link: { label: string; href: string; icon: LucideIcon } }) {
  const EvidenceIcon = link.icon
  return (
    <Button
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
}

function BaselineAttemptFollowUp({
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
  if (attempt.classification === 'pre_existing_unrelated_failure') {
    return (
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
    )
  }

  if (attempt.classification === 'validation_harness_failure') {
    return (
      <div className="border-destructive/30 bg-destructive/10 rounded-lg border p-2.5 text-[11px] font-medium leading-normal text-destructive">
        Runtime harness wiring failed. Fix step definitions, imports, Cucumber config, or setup, then republish.
      </div>
    )
  }

  if (attempt.classification === 'accepted_regression_pass' && !attempt.regressionJustification) {
    return (
      <RegressionJustificationForm
        planId={planId}
        attemptId={attempt.id}
        isPending={isPending}
        run={run}
        regressionJustification={regressionJustification}
        onRegressionJustificationChange={onRegressionJustificationChange}
      />
    )
  }

  return null
}

function RegressionJustificationForm({
  planId,
  attemptId,
  isPending,
  run,
  regressionJustification,
  onRegressionJustificationChange,
}: {
  planId: string
  attemptId: string
  isPending: boolean
  run: PlanActionRunner
  regressionJustification: string
  onRegressionJustificationChange: (value: string) => void
}) {
  return (
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
                attemptId,
                justification: regressionJustification,
              }),
            'Regression coverage justified.',
          )
        }
      >
        Save justification
      </Button>
    </div>
  )
}
