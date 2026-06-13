import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type PlanFlowTaskNode = Node<{
  step: number
  title: string
  status: string
}>

export function PlanFlowTaskNode({ data, selected }: NodeProps<PlanFlowTaskNode>) {
  return (
    <div
      className={cn(
        'min-h-[92px] w-[260px] rounded-lg border bg-card p-3 text-card-foreground shadow-sm',
        data.status === 'blocked' && 'bg-destructive/10 border-destructive',
        selected && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
      )}
    >
      <Handle type="target" position={Position.Left} className="!size-2.5 !border-background !bg-muted-foreground" />
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-sm font-bold text-primary-foreground">
          {data.step}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-5">{data.title}</p>
          <Badge className="mt-2" variant={data.status === 'blocked' ? 'destructive' : 'outline'}>
            {data.status}
          </Badge>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!size-2.5 !border-background !bg-muted-foreground" />
    </div>
  )
}
