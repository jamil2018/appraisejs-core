import { useCallback } from 'react'
import { useNodeId } from '@xyflow/react'
import { Pencil } from 'lucide-react'
import React from 'react'

import { Button, ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type NodeHeaderActionProps = ButtonProps & {
  label: string
}

export interface NodeHeaderEditActionProps extends Omit<NodeHeaderActionProps, 'onClick'> {
  onClick?: (nodeId: string, event: React.MouseEvent) => void
}

/**
 * A copy action button that passes the node's id to the `onClick` handler when
 * clicked.
 */
export const NodeHeaderEditAction = React.forwardRef<HTMLButtonElement, NodeHeaderEditActionProps>(
  ({ className, label, onClick, title, ...props }, ref) => {
    const id = useNodeId()

    const handleClick = useCallback(
      (event: React.MouseEvent) => {
        if (!onClick || !id) return

        onClick(id, event)
      },
      [onClick, id],
    )

    return (
      <Button
        ref={ref}
        aria-label={label}
        title={title ?? label}
        onClick={handleClick}
        variant="ghost"
        className={cn(className, 'nodrag size-6 p-1')}
        {...props}
      >
        <Pencil />
      </Button>
    )
  },
)

NodeHeaderEditAction.displayName = 'NodeHeaderEditAction'
