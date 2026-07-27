import FlowDiagram from '@/components/diagram/flow-diagram'
import { LinearStepEditor } from '@/components/diagram/linear-step-editor'
import type { FlowBlock, NodeOrderMap } from '@/types/diagram/diagram'
import type { StepDefinitionOption } from '@/types/step-definition-option'
import type { FlowInvocationController } from '@/components/diagram/flow-invocation-controller'
import type { StepInvocationResources } from '@/components/diagram/step-invocation-resources'

type TestCaseFlowProps = {
  initialNodesOrder: NodeOrderMap
  stepDefinitions: StepDefinitionOption[]
  resources: StepInvocationResources
  onNodeOrderChange: (nodesOrder: NodeOrderMap) => void
  flowBlocks?: FlowBlock[]
  layoutRefreshKey?: string | number | boolean
  onFlowBlocksChange?: (flowBlocks: FlowBlock[]) => void
  invocationController: FlowInvocationController
  view?: 'graph' | 'linear'
}

const EMPTY_FLOW_BLOCKS: FlowBlock[] = []

const TestCaseFlow = ({
  initialNodesOrder,
  stepDefinitions,
  resources,
  onNodeOrderChange,
  flowBlocks = EMPTY_FLOW_BLOCKS,
  layoutRefreshKey,
  onFlowBlocksChange,
  invocationController,
  view = 'graph',
}: TestCaseFlowProps) => {
  const nodesOrder = initialNodesOrder
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {view === 'linear' ? (
        <LinearStepEditor
          nodeOrder={nodesOrder}
          stepDefinitions={stepDefinitions}
          locators={resources.locators}
          locatorGroups={resources.locatorGroups}
          environments={resources.environments}
          modules={resources.modules}
          onInlineLocatorSave={resources.onInlineLocatorSave}
          onNodeOrderChange={next => onNodeOrderChange(next as NodeOrderMap)}
          flowBlocks={flowBlocks}
          onFlowBlocksChange={onFlowBlocksChange}
          invocationController={invocationController}
        />
      ) : (
        <FlowDiagram
          nodeOrder={nodesOrder}
          stepDefinitions={stepDefinitions}
          defaultValueInput={false}
          onNodeOrderChange={next => onNodeOrderChange(next as NodeOrderMap)}
          locators={resources.locators}
          locatorGroups={resources.locatorGroups}
          environments={resources.environments}
          modules={resources.modules}
          onInlineLocatorSave={resources.onInlineLocatorSave}
          enableNodeSearch
          enableNodeGrouping
          flowBlocks={flowBlocks}
          layoutRefreshKey={layoutRefreshKey}
          onFlowBlocksChange={onFlowBlocksChange}
          invocationController={invocationController}
        />
      )}
    </div>
  )
}

export default TestCaseFlow
