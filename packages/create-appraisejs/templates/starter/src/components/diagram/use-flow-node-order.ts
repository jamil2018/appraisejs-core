'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { NodeOrderMap, TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'

type DiagramNodeOrder = NodeOrderMap | TemplateTestCaseNodeOrderMap

type UseFlowNodeOrderParams<TNodeOrder extends DiagramNodeOrder> = {
  initialNodesOrder: TNodeOrder
  onNodeOrderChange: (nodeOrder: TNodeOrder) => void
  normalizeNodeOrder: (nodeOrder: DiagramNodeOrder) => TNodeOrder
  debounceMs?: number
}

export function useFlowNodeOrder<TNodeOrder extends DiagramNodeOrder>({
  initialNodesOrder,
  onNodeOrderChange,
  normalizeNodeOrder,
  debounceMs = 200,
}: UseFlowNodeOrderParams<TNodeOrder>) {
  const [nodesOrder, setNodesOrder] = useState<TNodeOrder>(initialNodesOrder)
  const hasHandledInitialRenderRef = useRef(false)

  useEffect(() => {
    if (!hasHandledInitialRenderRef.current) {
      hasHandledInitialRenderRef.current = true
      return
    }

    const timeoutId = window.setTimeout(() => {
      onNodeOrderChange(nodesOrder)
    }, debounceMs)

    return () => window.clearTimeout(timeoutId)
  }, [debounceMs, nodesOrder, onNodeOrderChange])

  const handleNodeOrderChange = useCallback(
    (nodeOrder: DiagramNodeOrder) => {
      setNodesOrder(normalizeNodeOrder(nodeOrder))
    },
    [normalizeNodeOrder],
  )

  return {
    nodesOrder,
    handleNodeOrderChange,
  }
}
