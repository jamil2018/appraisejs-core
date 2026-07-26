import FlowDiagram from '@/components/diagram/flow-diagram'
import { toNodeOrderMap } from '@/components/diagram/flow-host-helpers'
import { useFlowNodeOrder } from '@/components/diagram/use-flow-node-order'
import type { FlowBlock, NodeOrderMap } from '@/types/diagram/diagram'
import type { Environment, Locator, LocatorGroup, Module } from '@prisma/client'
import type { StepDefinitionOption } from '@/types/step-definition-option'

type TestCaseFlowProps = {
  initialNodesOrder: NodeOrderMap
  stepDefinitions: StepDefinitionOption[]
  locators: Array<Pick<Locator, 'id' | 'name' | 'locatorGroupId'>>
  locatorGroups: Array<Pick<LocatorGroup, 'id' | 'name' | 'route' | 'moduleId'>>
  environments: Array<Pick<Environment, 'id' | 'name'>>
  modules: Array<Pick<Module, 'id' | 'name' | 'parentId'>>
  onNodeOrderChange: (nodesOrder: NodeOrderMap) => void
  flowBlocks?: FlowBlock[]
  layoutRefreshKey?: string | number | boolean
  onFlowBlocksChange?: (flowBlocks: FlowBlock[]) => void
}

const EMPTY_FLOW_BLOCKS: FlowBlock[] = []

const TestCaseFlow = ({
  initialNodesOrder,
  stepDefinitions,
  locators,
  locatorGroups,
  environments,
  modules,
  onNodeOrderChange,
  flowBlocks = EMPTY_FLOW_BLOCKS,
  layoutRefreshKey,
  onFlowBlocksChange,
}: TestCaseFlowProps) => {
  const { nodesOrder, handleNodeOrderChange } = useFlowNodeOrder({
    initialNodesOrder,
    onNodeOrderChange,
    normalizeNodeOrder: toNodeOrderMap,
  })

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <FlowDiagram
        nodeOrder={nodesOrder}
        stepDefinitions={stepDefinitions}
        defaultValueInput={false}
        onNodeOrderChange={handleNodeOrderChange}
        locators={locators}
        locatorGroups={locatorGroups}
        environments={environments}
        modules={modules}
        enableNodeSearch
        enableNodeGrouping
        flowBlocks={flowBlocks}
        layoutRefreshKey={layoutRefreshKey}
        onFlowBlocksChange={onFlowBlocksChange}
      />
    </div>
  )
}

export default TestCaseFlow
