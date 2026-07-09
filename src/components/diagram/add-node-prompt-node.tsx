import type { Node, NodeProps } from '@xyflow/react'
import { memo } from 'react'

import { BaseNode } from '@/components/base-node'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { ADD_NODE_PROMPT_NODE_TYPE, type AddNodePromptNodeData } from './flow-diagram-helpers'

export type AddNodePromptFlowNode = Node<AddNodePromptNodeData, typeof ADD_NODE_PROMPT_NODE_TYPE>

type AddNodePromptNodeComponentProps = NodeProps<AddNodePromptFlowNode> & {
  onOpenAddNode: () => void
}

export const AddNodePromptNode = memo(function AddNodePromptNode({
  selected,
  onOpenAddNode,
}: AddNodePromptNodeComponentProps) {
  return (
    <BaseNode
      selected={selected}
      className="max-w-64 border-dashed border-white/[0.18] bg-[rgba(18,37,64,0.72)] px-3 py-2.5 shadow-sm"
    >
      <p className="mb-2 text-xs text-muted-foreground">No steps yet. Add your first node to build the flow.</p>
      <Button type="button" className={cn('nodrag h-8 w-full text-xs')} variant="outline" onClick={onOpenAddNode}>
        Add node
      </Button>
    </BaseNode>
  )
})

AddNodePromptNode.displayName = 'AddNodePromptNode'
