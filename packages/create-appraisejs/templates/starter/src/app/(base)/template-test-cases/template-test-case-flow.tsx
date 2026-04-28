import FlowDiagram from '@/components/diagram/flow-diagram'
import { toTemplateTestCaseNodeOrderMap } from '@/components/diagram/flow-host-helpers'
import { useFlowNodeOrder } from '@/components/diagram/use-flow-node-order'
import type { TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'
import type { Environment, Locator, LocatorGroup, Module, TemplateStep, TemplateStepParameter } from '@prisma/client'

type TemplateTestCaseFlowProps = {
  initialNodesOrder: TemplateTestCaseNodeOrderMap
  templateStepParams: TemplateStepParameter[]
  templateSteps: TemplateStep[]
  locators: Array<Pick<Locator, 'id' | 'name' | 'locatorGroupId'>>
  locatorGroups: Array<Pick<LocatorGroup, 'id' | 'name' | 'route' | 'moduleId'>>
  environments: Array<Pick<Environment, 'id' | 'name'>>
  modules: Array<Pick<Module, 'id' | 'name' | 'parentId'>>
  onNodeOrderChange: (nodesOrder: TemplateTestCaseNodeOrderMap) => void
  defaultValueInput?: boolean
}

const TemplateTestCaseFlow = ({
  initialNodesOrder,
  templateStepParams,
  templateSteps,
  locators,
  locatorGroups,
  environments,
  modules,
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
      environments={environments}
      modules={modules}
      defaultValueInput={defaultValueInput}
    />
  )
}

export default TemplateTestCaseFlow
