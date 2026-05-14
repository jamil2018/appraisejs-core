import { memo, useCallback, useEffect, useRef, useState } from 'react'

import { Handle, NodeProps, Position, useNodeId, useReactFlow } from '@xyflow/react'
import { Pencil, Plus, Trash } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { TemplateStepIcon, type StepParameterType } from '@prisma/client'

import { BaseNode } from '@/components/base-node'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { KeyToIconTransformer } from '@/lib/transformers/key-to-icon-transformer'
import { cn } from '@/lib/utils'
import { flowEdgeMutationGuardRef } from './button-edge'

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
  isSearchHighlighted?: boolean
  hasOutgoingConnection?: boolean
  isConnectionInProgress?: boolean
  isDeleteDisabled?: boolean
  parameters?: OptionsHeaderNodeParameter[]
}

interface OptionsHeaderNodeProps extends NodeProps {
  onEdit: (nodeId: string) => void
  onAddConnectedNode: (nodeId: string) => void
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getTemplateStepIcon(icon: OptionsHeaderNodeData['icon']) {
  return Object.values(TemplateStepIcon).includes(icon as TemplateStepIcon)
    ? (icon as TemplateStepIcon)
    : TemplateStepIcon.MOUSE
}

const OptionsHeaderNode = memo(({ selected, data, onEdit, onAddConnectedNode }: OptionsHeaderNodeProps) => {
  const { setNodes } = useReactFlow()
  const id = useNodeId()
  const [isToolbarVisible, setIsToolbarVisible] = useState(false)
  const hideToolbarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    label,
    gherkinStep,
    isFirstNode,
    icon,
    isMissingParams,
    isSearchHighlighted,
    hasOutgoingConnection,
    isConnectionInProgress,
    isDeleteDisabled,
    parameters = [],
  } = data as unknown as OptionsHeaderNodeData
  const sortedParameters = parameters.toSorted((left, right) => left.order - right.order)
  const nonEmptyParameters = sortedParameters.filter(parameter => parameter.value.trim().length > 0)

  const handleEdit = useCallback(() => {
    if (!id) return
    onEdit(id)
  }, [id, onEdit])

  const handleAddConnectedNode = useCallback(() => {
    if (!id || hasOutgoingConnection || isConnectionInProgress) return
    onAddConnectedNode(id)
  }, [hasOutgoingConnection, id, isConnectionInProgress, onAddConnectedNode])

  const handleDelete = useCallback(() => {
    if (!id) return
    if (flowEdgeMutationGuardRef.current.isNodeDeleteBlocked(id)) {
      flowEdgeMutationGuardRef.current.onBlocked()
      return
    }
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

    return stepParts.map(part => {
      const matchingParameter = nonEmptyParameters.find(parameter => parameter.value === part)
      if (!matchingParameter) {
        return (
          <span key={`text-${part || 'empty'}`} className="whitespace-pre-wrap">
            {part}
          </span>
        )
      }

      return (
        <TooltipProvider key={`chip-${matchingParameter.name}-${matchingParameter.value}`} delayDuration={40}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="border-primary/30 bg-primary/10 mx-0.5 inline-flex cursor-help px-1.5 py-0 align-baseline text-[11px] font-medium text-primary"
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
      data-first-node={isFirstNode ? 'true' : undefined}
      data-search-highlighted={isSearchHighlighted ? 'true' : undefined}
      onMouseEnter={showToolbarNow}
      onMouseLeave={hideToolbarWithDelay}
      onFocus={showToolbarNow}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          hideToolbarWithDelay()
        }
      }}
      className={cn(
        'border-border/70 shadow-background/30 w-36 overflow-visible bg-card p-0 pt-4 shadow-lg transition-[border-radius,box-shadow] duration-300 ease-out',
        isFirstNode && 'rounded-l-3xl rounded-r-md',
        isMissingParams && 'border-destructive/70 bg-destructive/10 ring-destructive/40 ring-1',
        isSearchHighlighted && 'shadow-[0_0_28px_rgba(16,185,129,0.34)] ring-2 ring-emerald-500/70',
      )}
    >
      {!isFirstNode && (
        <Handle type="target" position={Position.Left} className="!z-30 !h-2.5 !w-2.5 !border-0 !bg-zinc-400" />
      )}
      <AnimatePresence>
        {showToolbar && (
          <div className="absolute -top-12 left-1/2 z-10 -tranzinc-x-1/2">
            <motion.div
              className="border-border/70 bg-muted/80 flex items-center gap-1 rounded-md border p-1 shadow-md backdrop-blur"
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
                className="nodrag size-7"
                aria-label="Edit"
                onClick={handleEdit}
              >
                <Pencil aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="nodrag size-7"
                aria-label="Delete"
                onClick={handleDelete}
                disabled={isDeleteDisabled}
              >
                <Trash aria-hidden="true" />
              </Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {!hasOutgoingConnection && !isConnectionInProgress && (
          <div className="absolute left-full top-1/2 z-20 -tranzinc-y-1/2">
            <motion.div
              className="flex items-center"
              initial={{ opacity: 0, x: -6, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -6, scale: 0.96 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <motion.span
                aria-hidden="true"
                className="h-px w-12 bg-emerald-500/70 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                initial={{ scaleX: 0, transformOrigin: 'left' }}
                animate={{ scaleX: 1 }}
                exit={{ scaleX: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              />
              <motion.button
                type="button"
                className="nodrag nopan border-border/70 bg-muted/95 -ml-px flex size-5 items-center justify-center rounded border text-muted-foreground shadow-md transition-colors hover:border-emerald-400/70 hover:bg-emerald-500/20 hover:text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
                aria-label="Add connected node"
                onClick={handleAddConnectedNode}
                whileHover={{ scale: 1.12 }}
                whileTap={{ scale: 0.92 }}
                animate={{
                  boxShadow: [
                    '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)',
                    '0 0 0 4px rgba(16,185,129,0.12), 0 0 14px rgba(16,185,129,0.26)',
                    '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)',
                  ],
                }}
                transition={{
                  boxShadow: {
                    duration: 2.4,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  },
                }}
              >
                <Plus aria-hidden="true" className="size-3" />
              </motion.button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <div className="flex flex-col items-center gap-3 px-4 py-5 text-center">
        <div
          data-testid="node-step-icon"
          className="bg-primary/15 shadow-primary/20 flex size-20 shrink-0 items-center justify-center rounded-2xl text-primary shadow-lg [&>svg]:size-10"
        >
          {KeyToIconTransformer(getTemplateStepIcon(icon))}
        </div>
      </div>
      <div className="absolute left-1/2 top-full z-[5] mt-2 min-w-72 -tranzinc-x-[47%]">
        <h3 className="relative -left-2 w-full text-center text-lg font-bold leading-tight text-card-foreground">
          {label}
        </h3>
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
      <Handle type="source" position={Position.Right} className="!z-30 !h-2.5 !w-2.5 !border-0 !bg-zinc-400" />
    </BaseNode>
  )
})

OptionsHeaderNode.displayName = 'OptionsHeaderNode'

export default OptionsHeaderNode
