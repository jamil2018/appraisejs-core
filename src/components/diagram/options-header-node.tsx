import { memo, useCallback } from 'react'

import { Handle, NodeProps, Position, useNodeId, useReactFlow } from '@xyflow/react'
import { Pencil, Trash } from 'lucide-react'
import { TemplateStepIcon, type StepParameterType } from '@prisma/client'

import { BaseNode } from '@/components/base-node'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { KeyToIconTransformer } from '@/lib/transformers/key-to-icon-transformer'
import { cn } from '@/lib/utils'

type OptionsHeaderNodeParameter = {
  name: string
  value: string
  type?: StepParameterType
  order: number
}

interface OptionsHeaderNodeData {
  label: string
  gherkinStep: string
  isFirstNode?: boolean
  icon?: TemplateStepIcon | string
  isMissingParams?: boolean
  parameters?: OptionsHeaderNodeParameter[]
}

interface OptionsHeaderNodeProps extends NodeProps {
  onEdit: (nodeId: string) => void
}

function getTemplateStepIcon(icon: OptionsHeaderNodeData['icon']) {
  return Object.values(TemplateStepIcon).includes(icon as TemplateStepIcon)
    ? (icon as TemplateStepIcon)
    : TemplateStepIcon.MOUSE
}

const OptionsHeaderNode = memo(({ selected, data, onEdit }: OptionsHeaderNodeProps) => {
  const { setNodes } = useReactFlow()
  const id = useNodeId()

  const { label, gherkinStep, isFirstNode, icon, isMissingParams, parameters = [] } =
    data as unknown as OptionsHeaderNodeData
  const sortedParameters = [...parameters].sort((left, right) => left.order - right.order)

  const handleEdit = useCallback(() => {
    if (!id) return
    onEdit(id)
  }, [id, onEdit])

  const handleDelete = useCallback(() => {
    if (!id) return
    setNodes(prevNodes => prevNodes.filter(node => node.id !== id))
  }, [id, setNodes])

  return (
    <BaseNode
      selected={selected}
      data-testid="options-header-node"
      data-missing-params={isMissingParams ? 'true' : undefined}
      className={cn(
        'w-80 overflow-hidden border-border/70 bg-card p-0 shadow-lg shadow-background/30',
        isMissingParams && 'border-destructive/70 bg-destructive/10 ring-1 ring-destructive/40',
      )}
    >
      {!isFirstNode && <Handle type="target" position={Position.Left} />}
      <div className="flex items-center justify-end gap-2 border-b border-border/70 bg-muted/20 px-3 py-2">
        <Button type="button" variant="outline" size="sm" className="nodrag h-7 px-2" onClick={handleEdit}>
          <Pencil data-icon="inline-start" />
          Edit
        </Button>
        <Button type="button" variant="outline" size="sm" className="nodrag h-7 px-2" onClick={handleDelete}>
          <Trash data-icon="inline-start" />
          Delete
        </Button>
      </div>
      <div className="flex items-center gap-4 px-4 py-5">
        <div
          data-testid="node-step-icon"
          className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary [&>svg]:size-8"
        >
          {KeyToIconTransformer(getTemplateStepIcon(icon))}
        </div>
        <h3 className="min-w-0 flex-1 text-base font-semibold leading-tight text-card-foreground">{label}</h3>
      </div>
      {sortedParameters.length > 0 && (
        <div data-testid="node-param-chip-row" className="flex flex-wrap gap-2 border-t border-border/50 px-4 py-3">
          {sortedParameters.map(parameter => (
            <Badge
              key={`${parameter.order}-${parameter.name}`}
              data-testid="node-param-chip"
              variant="outline"
              className="max-w-full border-primary/25 bg-primary/10 font-mono font-medium text-primary"
            >
              <span className="truncate">
                {parameter.name}: {parameter.value}
              </span>
            </Badge>
          ))}
        </div>
      )}
      <div className="border-t border-border/70 bg-muted/20 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
        {gherkinStep}
      </div>
      <Handle type="source" position={Position.Right} />
    </BaseNode>
  )
})

OptionsHeaderNode.displayName = 'OptionsHeaderNode'

export default OptionsHeaderNode
