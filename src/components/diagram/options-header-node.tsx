import { memo, useCallback, useEffect, useRef, useState } from 'react'

import { Handle, NodeProps, Position, useNodeId, useReactFlow } from '@xyflow/react'
import { Pencil, Trash } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { TemplateStepIcon, type StepParameterType } from '@prisma/client'

import { BaseNode } from '@/components/base-node'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
  const nonEmptyParameters = sortedParameters.filter(parameter => parameter.value.trim().length > 0)

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

  const renderGherkinWithParamChips = useCallback(() => {
    if (!nonEmptyParameters.length) {
      return gherkinStep
    }

    const allTokens = nonEmptyParameters
      .map(parameter => parameter.value)
      .sort((left, right) => right.length - left.length)
      .map(escapeRegExp)

    const tokenRegex = new RegExp(`(${allTokens.join('|')})`, 'g')
    const stepParts = gherkinStep.split(tokenRegex)

    return stepParts.map((part, index) => {
      const matchingParameter = nonEmptyParameters.find(parameter => parameter.value === part)
      if (!matchingParameter) {
        return (
          <span key={`text-${index}`} className="whitespace-pre-wrap">
            {part}
          </span>
        )
      }

      return (
        <TooltipProvider key={`chip-${matchingParameter.name}-${index}`} delayDuration={40}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="mx-0.5 inline-flex cursor-help border-primary/30 bg-primary/10 px-1.5 py-0 text-[11px] font-medium align-baseline text-primary"
              >
                {matchingParameter.value}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="font-mono text-[10px] font-medium">
              {matchingParameter.name}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    })
  }, [gherkinStep, nonEmptyParameters])

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
        'w-36 overflow-visible border-border/70 bg-card p-0 pt-4 shadow-lg shadow-background/30',
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
      <div className="flex flex-col items-center gap-3 border-b border-border/70 px-4 py-5 text-center">
        <div
          data-testid="node-step-icon"
          className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-lg shadow-primary/20 [&>svg]:size-10"
        >
          {KeyToIconTransformer(getTemplateStepIcon(icon))}
        </div>
      </div>
      <div className="absolute left-1/2 top-full z-[5] mt-2 min-w-72 -translate-x-[47%]">
        <h3 className="relative -left-2 w-full text-center text-lg font-bold leading-tight text-card-foreground">{label}</h3>
        <AnimatePresence>
          {showToolbar && (
            <motion.div
              data-testid="node-gherkin-row"
              className="mt-2 text-sm leading-relaxed text-muted-foreground"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {renderGherkinWithParamChips()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Handle type="source" position={Position.Right} />
    </BaseNode>
  )
})

OptionsHeaderNode.displayName = 'OptionsHeaderNode'

export default OptionsHeaderNode
