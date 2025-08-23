import FlowDiagram from '@/components/diagram/flow-diagram'
import { TemplateTestCaseNodeOrderMap, NodeOrderMap } from '@/types/diagram/diagram'
import { Locator, TemplateStep, TemplateStepParameter, StepParameterType } from '@prisma/client'
import React, { useCallback, useEffect, useRef, useState } from 'react'

function useDebouncedCallback<T extends unknown[]>(callback: (...args: T) => void, delay: number) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  return (...args: T) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      callback(...args)
    }, delay)
  }
}

const TemplateTestCaseFlow = ({
  initialNodesOrder,
  templateStepParams,
  templateSteps,
  locators,
  onNodeOrderChange,
  defaultValueInput = false,
}: {
  initialNodesOrder: TemplateTestCaseNodeOrderMap
  templateStepParams: TemplateStepParameter[]
  templateSteps: TemplateStep[]
  locators: Locator[]
  onNodeOrderChange: (nodesOrder: TemplateTestCaseNodeOrderMap) => void
  defaultValueInput?: boolean
}) => {
  const [nodesOrder, setNodesOrder] = useState<TemplateTestCaseNodeOrderMap>(initialNodesOrder)

  const handleNodeOrderChange = useCallback(
    (nodeOrder: NodeOrderMap | TemplateTestCaseNodeOrderMap) => {
      // Convert NodeOrderMap to TemplateTestCaseNodeOrderMap if needed
      const convertedNodeOrder: TemplateTestCaseNodeOrderMap = {}
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
              defaultValue: 'value' in param ? param.value : param.defaultValue,
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
        onNodeOrderChange={handleNodeOrderChange}
        templateSteps={templateSteps}
        locators={locators}
        defaultValueInput={defaultValueInput}
      />
    </>
  )
}

export default TemplateTestCaseFlow
