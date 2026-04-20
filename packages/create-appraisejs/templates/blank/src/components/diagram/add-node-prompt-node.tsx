import type { Node, NodeProps } from '@xyflow/react'
import { memo, useCallback } from 'react'

import { BaseNode } from '@/components/base-node'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { ADD_NODE_PROMPT_NODE_TYPE, type AddNodePromptNodeData } from './flow-diagram-helpers'

export type AddNodePromptFlowNode = Node<AddNodePromptNodeData, typeof ADD_NODE_PROMPT_NODE_TYPE>

export type AddNodePromptNodeComponentProps = NodeProps<AddNodePromptFlowNode> & {
  onOpenAddNode: () => void
}

export const AddNodePromptNode = memo(function AddNodePromptNode({
  selected,
  onOpenAddNode,
}: AddNodePromptNodeComponentProps) {
  const handleClick = useCallback(() => {
    onOpenAddNode()
  }, [onOpenAddNode])

  return (
    <BaseNode selected={selected} className="max-w-80 border-dashed border-muted-foreground/50 bg-muted/30 px-4 py-3">
      <p className="mb-3 text-sm text-muted-foreground">No steps yet. Add your first node to build the flow.</p>
      <Button type="button" className={cn('nodrag w-full')} variant="outline" onClick={handleClick}>
        Add node
      </Button>
    </BaseNode>
  )
})

AddNodePromptNode.displayName = 'AddNodePromptNode'
