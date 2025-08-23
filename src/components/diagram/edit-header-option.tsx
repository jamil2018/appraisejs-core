import { NodeHeaderAction, NodeHeaderActionProps } from '@/components/node-header'
import { useCallback } from 'react'
import { useNodeId } from '@xyflow/react'
import { Pencil } from 'lucide-react'
import React from 'react'

export interface NodeHeaderEditActionProps extends Omit<NodeHeaderActionProps, 'onClick'> {
  onClick?: (nodeId: string, event: React.MouseEvent) => void
}

/**
 * A copy action button that passes the node's id to the `onClick` handler when
 * clicked.
 */
export const NodeHeaderEditAction = React.forwardRef<HTMLButtonElement, NodeHeaderEditActionProps>(
  ({ onClick, ...props }, ref) => {
    const id = useNodeId()

    const handleClick = useCallback(
      (event: React.MouseEvent) => {
        if (!onClick || !id) return

        onClick(id, event)
      },
      [onClick, id],
    )

    return (
      <NodeHeaderAction ref={ref} onClick={handleClick} variant="ghost" {...props}>
        <Pencil />
      </NodeHeaderAction>
    )
  },
)

NodeHeaderEditAction.displayName = 'NodeHeaderEditAction'
