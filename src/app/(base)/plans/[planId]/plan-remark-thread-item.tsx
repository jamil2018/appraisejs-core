import type { ReactNode } from 'react'
import { ArrowDown, Check, ShieldAlert, X } from 'lucide-react'

import { transitionPlanRemarkAction } from '@/actions/plan-review/plan-review-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'
import { getThreadStatus, isThreadOpen } from '@/services/plan-review/plan-review-helpers'

import { getRelativeTimeString, getRemarkInitials, MarkdownRemark } from './plan-remark-formatting'

type PlanActionRunner = (
  operation: () => Promise<{ success?: boolean; error?: string }>,
  successMessage: string,
) => void

type RemarkThread = NonNullable<PlanReviewDetail['review']>['threads'][number]
type RemarkTransitionAction = 'resolved' | 'dismissed' | 'downgraded'

const remarkTransitions: Array<{
  action: RemarkTransitionAction
  label: string
  tooltip: string
  message: string
  renderIcon: () => ReactNode
}> = [
  {
    action: 'resolved',
    label: 'Resolve',
    tooltip: 'Mark as resolved',
    message: 'Remark resolved.',
    renderIcon: () => <Check className="size-3 text-emerald-500" />,
  },
  {
    action: 'dismissed',
    label: 'Dismiss',
    tooltip: 'Dismiss remark',
    message: 'Remark dismissed.',
    renderIcon: () => <X className="size-3 text-muted-foreground" />,
  },
  {
    action: 'downgraded',
    label: 'Downgrade',
    tooltip: 'Downgrade priority',
    message: 'Remark downgraded.',
    renderIcon: () => <ArrowDown className="size-3 text-amber-500" />,
  },
]

export function PlanRemarkThreadItem({
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
  const open = isThreadOpen(thread)
  const blockingOpen = thread.blocking && open

  return (
    <div className="group relative">
      <div className="absolute -left-[19px] top-1.5 flex size-4 items-center justify-center rounded-full border border-border bg-background shadow-sm">
        <span
          className={cn(
            'size-1.5 rounded-full',
            blockingOpen ? 'animate-pulse bg-destructive' : 'bg-muted-foreground/60',
          )}
        />
      </div>

      <div
        className={cn(
          'space-y-2.5 rounded-xl border bg-card p-3 shadow-sm transition-all duration-200 hover:shadow-md',
          blockingOpen ? 'bg-destructive/[0.02] border-destructive/20' : 'border-border/80',
        )}
      >
        <RemarkThreadHeader thread={thread} blockingOpen={blockingOpen} />
        <RemarkThreadEventList events={thread.events} />
        {open ? <RemarkThreadActions planId={planId} threadId={thread.id} isPending={isPending} run={run} /> : null}
      </div>
    </div>
  )
}

function RemarkThreadHeader({ thread, blockingOpen }: { thread: RemarkThread; blockingOpen: boolean }) {
  return (
    <div className="border-border/40 flex items-center justify-between gap-2 border-b pb-1.5">
      <div className="flex items-center gap-1">
        {thread.blocking ? <ShieldAlert className="size-3 animate-bounce text-destructive" /> : null}
        <Badge
          variant={blockingOpen ? 'destructive' : 'outline'}
          className="px-1.5 py-0 text-[9px] font-bold uppercase tracking-wider"
        >
          {thread.blocking ? 'Blocking' : 'Non-blocking'}
        </Badge>
      </div>
      <span className="text-muted-foreground/75 text-[10px] font-bold uppercase tracking-wider">
        {getThreadStatus(thread)}
      </span>
    </div>
  )
}

function RemarkThreadEventList({ events }: { events: RemarkThread['events'] }) {
  return (
    <div className="space-y-3">
      {events.map(event => (
        <RemarkThreadEvent key={event.id} event={event} />
      ))}
    </div>
  )
}

function RemarkThreadEvent({ event }: { event: RemarkThread['events'][number] }) {
  return (
    <div className="flex gap-2 text-xs">
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-[9px] font-bold text-secondary-foreground shadow-sm"
        title={event.actor}
      >
        {getRemarkInitials(event.actor)}
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
          <div className="text-muted-foreground/70 pl-1 text-[10px] capitalize italic">{event.action} the thread</div>
        )}
      </div>
    </div>
  )
}

function RemarkThreadActions({
  planId,
  threadId,
  isPending,
  run,
}: {
  planId: string
  threadId: string
  isPending: boolean
  run: PlanActionRunner
}) {
  return (
    <TooltipProvider>
      <div className="border-border/40 mt-2 flex items-center gap-1.5 border-t pt-2">
        <span className="text-muted-foreground/70 mr-1 text-[9px] font-semibold uppercase">Action:</span>
        {remarkTransitions.map(transition => (
          <RemarkTransitionButton
            key={transition.action}
            label={transition.label}
            tooltip={transition.tooltip}
            icon={transition.renderIcon()}
            disabled={isPending}
            onClick={() =>
              run(
                () =>
                  transitionPlanRemarkAction({
                    planId,
                    threadId,
                    action: transition.action,
                  }),
                transition.message,
              )
            }
          />
        ))}
      </div>
    </TooltipProvider>
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
