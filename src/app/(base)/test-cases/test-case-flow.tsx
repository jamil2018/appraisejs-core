import FlowDiagram from '@/components/diagram/flow-diagram'
import { NodeOrderMap, TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'
import { Locator, TemplateStep, TemplateStepParameter, StepParameterType } from '@prisma/client'
import React, { useCallback, useEffect, useState, useRef } from 'react'

function useDebouncedCallback<T extends unknown[]>(callback: (...args: T) => void, delay: number) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  return (...args: T) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      callback(...args)
    }, delay)
  }
}

const TestCaseFlow = ({
  initialNodesOrder,
  templateStepParams,
  templateSteps,
  locators,
  onNodeOrderChange,
}: {
  initialNodesOrder: NodeOrderMap
  templateStepParams: TemplateStepParameter[]
  templateSteps: TemplateStep[]
  locators: Locator[]
  onNodeOrderChange: (nodesOrder: NodeOrderMap) => void
}) => {
  const [nodesOrder, setNodesOrder] = useState<NodeOrderMap>(initialNodesOrder)

  const handleNodeOrderChange = useCallback(
    (nodeOrder: NodeOrderMap | TemplateTestCaseNodeOrderMap) => {
      // Convert TemplateTestCaseNodeOrderMap to NodeOrderMap if needed
      const convertedNodeOrder: NodeOrderMap = {}
      Object.entries(nodeOrder).forEach(([key, nodeData]) => {
        convertedNodeOrder[key] = {
          ...nodeData,
          parameters: nodeData.parameters.map(
            (param: {
              name: string
              value?: string
              defaultValue?: string
              type: StepParameterType
              order: number
            }) => ({
              ...param,
              value: 'defaultValue' in param ? param.defaultValue : param.value,
            }),
          ),
        }
      })
      setNodesOrder(convertedNodeOrder)
    },
    [setNodesOrder],
  )

  const debouncedSaveNodesOrder = useDebouncedCallback(onNodeOrderChange, 200)

  useEffect(() => {
    debouncedSaveNodesOrder(nodesOrder)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodesOrder])

  return (
    <>
      <FlowDiagram
        nodeOrder={nodesOrder}
        templateStepParams={templateStepParams}
        defaultValueInput={false}
        onNodeOrderChange={handleNodeOrderChange}
        templateSteps={templateSteps}
        locators={locators}
      />
    </>
  )
}

export default TestCaseFlow
