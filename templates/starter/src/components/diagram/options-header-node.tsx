import { memo, useCallback, useEffect, useRef, useState } from 'react'

import { Handle, NodeProps, Position, useNodeId, useReactFlow } from '@xyflow/react'
import { Pencil, Trash } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
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
  const [isToolbarVisible, setIsToolbarVisible] = useState(false)
  const hideToolbarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const clearHideToolbarTimeout = useCallback(() => {
    if (!hideToolbarTimeoutRef.current) return
    clearTimeout(hideToolbarTimeoutRef.current)
    hideToolbarTimeoutRef.current = null
  }, [])

  const showToolbarNow = useCallback(() => {
    clearHideToolbarTimeout()
    setIsToolbarVisible(true)
  }, [clearHideToolbarTimeout])

  const hideToolbarWithDelay = useCallback(() => {
    clearHideToolbarTimeout()
    hideToolbarTimeoutRef.current = setTimeout(() => {
      setIsToolbarVisible(false)
    }, 320)
  }, [clearHideToolbarTimeout])

  const showToolbar = selected || isToolbarVisible

  useEffect(() => clearHideToolbarTimeout, [clearHideToolbarTimeout])

  return (
    <BaseNode
      selected={selected}
      data-testid="options-header-node"
      data-missing-params={isMissingParams ? 'true' : undefined}
      onMouseEnter={showToolbarNow}
      onMouseLeave={hideToolbarWithDelay}
      onFocus={showToolbarNow}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          hideToolbarWithDelay()
        }
      }}
      className={cn(
        'w-80 overflow-visible border-border/70 bg-card p-0 pt-4 shadow-lg shadow-background/30',
        isMissingParams && 'border-destructive/70 bg-destructive/10 ring-1 ring-destructive/40',
      )}
    >
      {!isFirstNode && <Handle type="target" position={Position.Left} />}
      <AnimatePresence>
        {showToolbar && (
          <div className="absolute -top-12 left-1/2 z-10 -translate-x-1/2">
            <motion.div
              className="flex items-center gap-1 rounded-md border border-border/70 bg-muted/80 p-1 shadow-md backdrop-blur"
              onMouseEnter={showToolbarNow}
              onMouseLeave={hideToolbarWithDelay}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10, transition: { duration: 0.4, ease: 'easeOut' } }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="nodrag h-7 w-7"
                aria-label="Edit"
                onClick={handleEdit}
              >
                <Pencil aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="nodrag h-7 w-7"
                aria-label="Delete"
                onClick={handleDelete}
              >
                <Trash aria-hidden="true" />
              </Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <div className="flex items-center gap-4 border-b border-border/70 px-4 py-4">
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
