import React from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from '@xyflow/react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ButtonEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}: EdgeProps) {
  const { setEdges } = useReactFlow()
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const onEdgeClick = () => {
    setEdges(edges => edges.filter(edge => edge.id !== id))
  }

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          className={`nodrag nopan pointer-events-auto absolute flex items-center justify-center`}
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
