import FlowDiagram from '@/components/diagram/flow-diagram'
import { toNodeOrderMap } from '@/components/diagram/flow-host-helpers'
import { useFlowNodeOrder } from '@/components/diagram/use-flow-node-order'
import type { NodeOrderMap } from '@/types/diagram/diagram'
import type { Locator, LocatorGroup, TemplateStep, TemplateStepParameter } from '@prisma/client'

type TestCaseFlowProps = {
  initialNodesOrder: NodeOrderMap
  templateStepParams: TemplateStepParameter[]
  templateSteps: TemplateStep[]
  locators: Locator[]
  locatorGroups: LocatorGroup[]
  onNodeOrderChange: (nodesOrder: NodeOrderMap) => void
}

const TestCaseFlow = ({
  initialNodesOrder,
  templateStepParams,
  templateSteps,
  locators,
  locatorGroups,
  onNodeOrderChange,
}: TestCaseFlowProps) => {
  const { nodesOrder, handleNodeOrderChange } = useFlowNodeOrder({
    initialNodesOrder,
    onNodeOrderChange,
    normalizeNodeOrder: toNodeOrderMap,
  })

  return (
    <FlowDiagram
      nodeOrder={nodesOrder}
      templateStepParams={templateStepParams}
      defaultValueInput={false}
      onNodeOrderChange={handleNodeOrderChange}
      templateSteps={templateSteps}
      locators={locators}
      locatorGroups={locatorGroups}
    />
  )
}

export default TestCaseFlow
