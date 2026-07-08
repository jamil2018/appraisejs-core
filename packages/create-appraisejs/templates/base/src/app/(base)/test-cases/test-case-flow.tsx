import FlowDiagram from '@/components/diagram/flow-diagram'
import type { FlowDiagramStepBlock } from '@/components/diagram/flow-diagram-types'
import { toNodeOrderMap } from '@/components/diagram/flow-host-helpers'
import { useFlowNodeOrder } from '@/components/diagram/use-flow-node-order'
import type { FlowBlock, NodeOrderMap } from '@/types/diagram/diagram'
import type { Environment, Locator, LocatorGroup, Module, TemplateStep, TemplateStepParameter } from '@prisma/client'

type TestCaseFlowProps = {
  initialNodesOrder: NodeOrderMap
  templateStepParams: TemplateStepParameter[]
  templateSteps: TemplateStep[]
  locators: Array<Pick<Locator, 'id' | 'name' | 'locatorGroupId'>>
  locatorGroups: Array<Pick<LocatorGroup, 'id' | 'name' | 'route' | 'moduleId'>>
  environments: Array<Pick<Environment, 'id' | 'name'>>
  modules: Array<Pick<Module, 'id' | 'name' | 'parentId'>>
  stepBlocks?: FlowDiagramStepBlock[]
  onNodeOrderChange: (nodesOrder: NodeOrderMap) => void
  flowBlocks?: FlowBlock[]
  layoutRefreshKey?: string | number | boolean
  onFlowBlocksChange?: (flowBlocks: FlowBlock[]) => void
}

const EMPTY_FLOW_BLOCKS: FlowBlock[] = []
const EMPTY_STEP_BLOCKS: FlowDiagramStepBlock[] = []

const TestCaseFlow = ({
  initialNodesOrder,
  templateStepParams,
  templateSteps,
  locators,
  locatorGroups,
  environments,
  modules,
  stepBlocks = EMPTY_STEP_BLOCKS,
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
        templateStepParams={templateStepParams}
        defaultValueInput={false}
        onNodeOrderChange={handleNodeOrderChange}
        templateSteps={templateSteps}
        locators={locators}
        locatorGroups={locatorGroups}
        environments={environments}
        modules={modules}
        stepBlocks={stepBlocks}
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
