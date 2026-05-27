'use client'

import { useUpdateNodeInternals } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { memo, useCallback, useEffect, useRef, type RefObject } from 'react'
import { FlowDiagramView } from './flow-diagram-view'
import type { FlowDiagramProps } from './flow-diagram-types'
import { EMPTY_FLOW_BLOCKS } from './flow-diagram-types'
import { useFlowDiagram } from './use-flow-diagram'

const layoutRefreshDelays = [0, 80, 180, 360]

type FlowLayoutRefreshProps = {
  nodeIds: string[]
  containerRef: RefObject<HTMLDivElement | null>
  refreshKey?: string | number | boolean
}

function FlowLayoutRefresh({ nodeIds, containerRef, refreshKey }: FlowLayoutRefreshProps) {
  const updateNodeInternals = useUpdateNodeInternals()
  const frameRef = useRef<number | null>(null)
  const timeoutRefs = useRef<number[]>([])

  const clearScheduledRefreshes = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    timeoutRefs.current.forEach(timeoutId => window.clearTimeout(timeoutId))
    timeoutRefs.current = []
  }, [])

  const refreshNodeInternals = useCallback(() => {
    if (nodeIds.length === 0) {
      return
    }

    updateNodeInternals(nodeIds)
  }, [nodeIds, updateNodeInternals])

  const scheduleLayoutRefresh = useCallback(() => {
    if (typeof window === 'undefined') {
      return
    }

    clearScheduledRefreshes()
    layoutRefreshDelays.forEach(delay => {
      if (delay === 0) {
        frameRef.current = window.requestAnimationFrame(refreshNodeInternals)
        return
      }

      timeoutRefs.current.push(window.setTimeout(refreshNodeInternals, delay))
    })
  }, [clearScheduledRefreshes, refreshNodeInternals])

  useEffect(() => {
    scheduleLayoutRefresh()

    return clearScheduledRefreshes
  }, [clearScheduledRefreshes, refreshKey, scheduleLayoutRefresh])

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const container = containerRef.current
    if (!container) {
      return
    }

    const resizeObserver = new ResizeObserver(scheduleLayoutRefresh)
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [containerRef, scheduleLayoutRefresh])

  return null
}

const FlowDiagram = (props: FlowDiagramProps) => {
  const model = useFlowDiagram({
    ...props,
    flowBlocks: props.flowBlocks ?? EMPTY_FLOW_BLOCKS,
  })

  return <FlowDiagramView model={model} FlowLayoutRefresh={FlowLayoutRefresh} />
}

export default memo(FlowDiagram)
