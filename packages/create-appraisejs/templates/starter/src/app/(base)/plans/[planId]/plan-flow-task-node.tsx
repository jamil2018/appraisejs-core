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
    accent: 'border-l-destructive',
    icon: ShieldAlert,
    iconClass: 'text-destructive',
  },
  completed: {
    accent: 'border-l-emerald-500',
    icon: CheckCircle2,
    iconClass: 'text-emerald-500',
  },
  implemented: {
    accent: 'border-l-emerald-500',
    icon: CheckCircle2,
    iconClass: 'text-emerald-500',
  },
  verified: {
    accent: 'border-l-emerald-500',
    icon: CheckCircle2,
    iconClass: 'text-emerald-500',
  },
  in_progress: {
    accent: 'border-l-violet-500',
    icon: Loader2,
    iconClass: 'animate-spin text-violet-500',
  },
  running: {
    accent: 'border-l-violet-500',
    icon: Loader2,
    iconClass: 'animate-spin text-violet-500',
  },
  ready: {
    accent: 'border-l-slate-500',
    icon: Clock,
    iconClass: 'text-slate-500',
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
        'shadow-background/40 relative min-h-[104px] w-[280px] rounded-lg border border-l-4 bg-card p-3 text-card-foreground shadow-md backdrop-blur transition-all duration-200',
        statusStyle.accent,
        data.status === 'blocked' && 'border-destructive bg-card',
        selected &&
          'shadow-primary/20 scale-[1.02] border-primary shadow-lg ring-2 ring-primary ring-offset-2 ring-offset-background',
      )}
    >
      <Handle type="target" position={Position.Left} className="!size-2.5 !border-background !bg-muted-foreground" />
      {data.openRemarks > 0 ? (
        <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
          <MessageSquare className="size-3" />
          {data.openRemarks}
        </div>
      ) : null}
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-sm font-bold text-primary-foreground">
          {data.step}
        </span>
        <div className="min-w-0 flex-1 pr-9">
          <div className="flex items-start gap-2">
            <StatusIcon className={cn('mt-0.5 size-4 shrink-0', statusStyle.iconClass)} />
            <p className="text-sm font-semibold leading-5">{data.title}</p>
          </div>
          <Badge className="mt-2" variant={data.status === 'blocked' ? 'destructive' : 'outline'}>
            {data.status}
          </Badge>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!size-2.5 !border-background !bg-muted-foreground" />
    </div>
  )
}
