import FlowDiagram from '@/components/diagram/flow-diagram'
import { toTemplateTestCaseNodeOrderMap } from '@/components/diagram/flow-host-helpers'
import { useFlowNodeOrder } from '@/components/diagram/use-flow-node-order'
import type { FlowBlock, TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'
import type { Environment, Locator, LocatorGroup, Module } from '@prisma/client'
import type { StepDefinitionOption } from '@/types/step-definition-option'

type TemplateTestCaseFlowProps = {
  initialNodesOrder: TemplateTestCaseNodeOrderMap
  stepDefinitions: StepDefinitionOption[]
  locators: Array<Pick<Locator, 'id' | 'name' | 'locatorGroupId'>>
  locatorGroups: Array<Pick<LocatorGroup, 'id' | 'name' | 'route' | 'moduleId'>>
  environments: Array<Pick<Environment, 'id' | 'name'>>
  modules: Array<Pick<Module, 'id' | 'name' | 'parentId'>>
  onNodeOrderChange: (nodesOrder: TemplateTestCaseNodeOrderMap) => void
  flowBlocks?: FlowBlock[]
  onFlowBlocksChange?: (flowBlocks: FlowBlock[]) => void
  defaultValueInput?: boolean
}

const EMPTY_FLOW_BLOCKS: FlowBlock[] = []

const TemplateTestCaseFlow = ({
  initialNodesOrder,
  stepDefinitions,
  locators,
  locatorGroups,
  environments,
  modules,
  onNodeOrderChange,
  flowBlocks = EMPTY_FLOW_BLOCKS,
  onFlowBlocksChange,
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
      stepDefinitions={stepDefinitions}
      onNodeOrderChange={handleNodeOrderChange}
      locators={locators}
      locatorGroups={locatorGroups}
      environments={environments}
      modules={modules}
      defaultValueInput={defaultValueInput}
      enableNodeGrouping
      flowBlocks={flowBlocks}
      onFlowBlocksChange={onFlowBlocksChange}
    />
  )
}

export default TemplateTestCaseFlow
