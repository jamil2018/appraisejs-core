import React from 'react'
import { BaseEdge, EdgeLabelRenderer, getStraightPath, useReactFlow, type EdgeProps } from '@xyflow/react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

type FlowEdgeMutationGuard = {
  isEdgeDeleteBlocked: (edge: { id: string; source: string; target: string }) => boolean
  isNodeDeleteBlocked: () => boolean
  onBlocked: () => void
}

export const flowEdgeMutationGuardRef: { current: FlowEdgeMutationGuard } = {
  current: {
    isEdgeDeleteBlocked: () => false,
    isNodeDeleteBlocked: () => false,
    onBlocked: () => {},
  },
}

export default function ButtonEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
  markerEnd,
}: EdgeProps) {
  const { setEdges } = useReactFlow()
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  })

  const onEdgeClick = () => {
    if (flowEdgeMutationGuardRef.current.isEdgeDeleteBlocked({ id, source, target })) {
      flowEdgeMutationGuardRef.current.onBlocked()
      return
    }
    setEdges(edges => edges.filter(edge => edge.id !== id))
  }

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          className={`nodrag nopan pointer-events-auto absolute z-30 flex items-center justify-center`}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          }}
        >
          <Button
            variant="outline"
            onClick={onEdgeClick}
            title="Delete Edge"
            size="icon"
            className="h-7 w-7 rounded-full p-0"
          >
            <Trash2 className="text-muted-foreground" />
          </Button>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
