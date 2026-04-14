import FlowDiagram from '@/components/diagram/flow-diagram'
import { toTemplateTestCaseNodeOrderMap } from '@/components/diagram/flow-host-helpers'
import { useFlowNodeOrder } from '@/components/diagram/use-flow-node-order'
import type { TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'
import type { Locator, LocatorGroup, TemplateStep, TemplateStepParameter } from '@prisma/client'

type TemplateTestCaseFlowProps = {
  initialNodesOrder: TemplateTestCaseNodeOrderMap
  templateStepParams: TemplateStepParameter[]
  templateSteps: TemplateStep[]
  locators: Locator[]
  locatorGroups: LocatorGroup[]
  onNodeOrderChange: (nodesOrder: TemplateTestCaseNodeOrderMap) => void
  defaultValueInput?: boolean
}

const TemplateTestCaseFlow = ({
  initialNodesOrder,
  templateStepParams,
  templateSteps,
  locators,
  locatorGroups,
  onNodeOrderChange,
  defaultValueInput = false,
}: TemplateTestCaseFlowProps) => {
  const { nodesOrder, handleNodeOrderChange } = useFlowNodeOrder({
    initialNodesOrder,
    onNodeOrderChange,
    normalizeNodeOrder: toTemplateTestCaseNodeOrderMap,
  })

  return (
    <FlowDiagram
      nodeOrder={nodesOrder}
      templateStepParams={templateStepParams}
      onNodeOrderChange={handleNodeOrderChange}
      templateSteps={templateSteps}
      locators={locators}
      locatorGroups={locatorGroups}
      defaultValueInput={defaultValueInput}
    />
  )
}

export default TemplateTestCaseFlow
