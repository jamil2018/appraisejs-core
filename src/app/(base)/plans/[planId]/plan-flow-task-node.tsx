import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { CheckCircle2, Clock, Loader2, MessageSquare, ShieldAlert } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type PlanFlowTaskNode = Node<{
  step: number
  title: string
  status: string
  openRemarks: number
}>

const statusStyles = {
  blocked: {
    accent: 'border-l-destructive/80 bg-gradient-to-br from-destructive/10 via-card to-card',
    dot: 'bg-destructive animate-pulse',
    badge: 'border-destructive/30 bg-destructive/5 text-destructive font-semibold',
    icon: ShieldAlert,
    iconClass: 'text-destructive',
  },
  completed: {
    accent: 'border-l-emerald-500 bg-gradient-to-br from-emerald-500/10 via-card to-card',
    dot: 'bg-emerald-500',
    badge: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 font-semibold',
    icon: CheckCircle2,
    iconClass: 'text-emerald-500',
  },
  implemented: {
    accent: 'border-l-emerald-500 bg-gradient-to-br from-emerald-500/10 via-card to-card',
    dot: 'bg-emerald-500',
    badge: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 font-semibold',
    icon: CheckCircle2,
    iconClass: 'text-emerald-500',
  },
  verified: {
    accent: 'border-l-emerald-500 bg-gradient-to-br from-emerald-500/10 via-card to-card',
    dot: 'bg-emerald-500',
    badge: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 font-semibold',
    icon: CheckCircle2,
    iconClass: 'text-emerald-500',
  },
  in_progress: {
    accent: 'border-l-violet-500 bg-gradient-to-br from-violet-500/10 via-card to-card',
    dot: 'bg-violet-500 animate-pulse',
    badge: 'border-violet-500/30 bg-violet-500/5 text-violet-700 dark:text-violet-400 font-semibold',
    icon: Loader2,
    iconClass: 'animate-spin text-violet-500',
  },
  running: {
    accent: 'border-l-violet-500 bg-gradient-to-br from-violet-500/10 via-card to-card',
    dot: 'bg-violet-500 animate-pulse',
    badge: 'border-violet-500/30 bg-violet-500/5 text-violet-700 dark:text-violet-400 font-semibold',
    icon: Loader2,
    iconClass: 'animate-spin text-violet-500',
  },
  ready: {
    accent: 'border-l-slate-400 dark:border-l-slate-600 bg-gradient-to-br from-slate-500/5 via-card to-card',
    dot: 'bg-slate-400 dark:bg-slate-600',
    badge: 'border-slate-500/30 bg-slate-500/5 text-slate-700 dark:text-slate-300 font-semibold',
    icon: Clock,
    iconClass: 'text-slate-500 dark:text-slate-400',
  },
} as const

function getStatusStyle(status: string) {
  return statusStyles[status as keyof typeof statusStyles] ?? statusStyles.ready
}

export function PlanFlowTaskNode({ data, selected }: NodeProps<PlanFlowTaskNode>) {
  const statusStyle = getStatusStyle(data.status)
  const StatusIcon = statusStyle.icon

  return (
    <div
      className={cn(
        'border-border/80 hover:border-primary/30 group relative min-h-[110px] w-[300px] cursor-pointer rounded-xl border border-l-[6px] p-4 text-card-foreground shadow-sm backdrop-blur transition-all duration-300 hover:scale-[1.01] hover:shadow-md',
        statusStyle.accent,
        selected &&
          'shadow-primary/20 scale-[1.03] border-primary border-l-primary shadow-xl ring-2 ring-primary ring-offset-2 ring-offset-background',
      )}
    >
      {/* Target Connection Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!size-3 !border-2 !border-background !bg-muted-foreground transition-colors hover:!bg-primary"
      />

      {/* Remark Badge overlay */}
      {data.openRemarks > 0 ? (
        <div className="absolute right-3 top-3 flex animate-pulse items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 shadow-sm dark:text-amber-300">
          <MessageSquare className="size-3" />
          {data.openRemarks}
        </div>
      ) : null}

      <div className="flex items-start gap-3.5">
        {/* Step Number Circle */}
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary font-mono text-sm font-bold text-primary-foreground shadow-sm transition-transform duration-300 group-hover:scale-105">
          {data.step}
        </span>

        {/* Task Details */}
        <div className="min-w-0 flex-1 space-y-2.5 pr-6">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <StatusIcon className={cn('size-4 shrink-0', statusStyle.iconClass)} />
              <span className="text-muted-foreground/70 text-[10px] font-bold uppercase tracking-wider">
                Step {data.step}
              </span>
            </div>
            <p className="line-clamp-2 text-sm font-bold leading-snug tracking-tight transition-colors group-hover:text-primary">
              {data.title}
            </p>
          </div>

          <Badge variant="outline" className={cn('gap-1.5 py-0 pl-1.5 pr-2 text-[10px] capitalize', statusStyle.badge)}>
            <span className={cn('size-1.5 rounded-full', statusStyle.dot)} />
            {data.status.replaceAll('_', ' ')}
          </Badge>
        </div>
      </div>

      {/* Source Connection Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!size-3 !border-2 !border-background !bg-muted-foreground transition-colors hover:!bg-primary"
      />
    </div>
  )
}
