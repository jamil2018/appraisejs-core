import FlowDiagram from '@/components/diagram/flow-diagram'
import { LinearStepEditor } from '@/components/diagram/linear-step-editor'
import type { FlowBlock, TemplateTestCaseNodeOrderMap } from '@/types/diagram/diagram'
import type { StepDefinitionOption } from '@/types/step-definition-option'
import type { FlowInvocationController } from '@/components/diagram/flow-invocation-controller'
import type { StepInvocationResources } from '@/components/diagram/step-invocation-resources'

type TemplateTestCaseFlowProps = {
  initialNodesOrder: TemplateTestCaseNodeOrderMap
  stepDefinitions: StepDefinitionOption[]
  resources: StepInvocationResources
  onNodeOrderChange: (nodesOrder: TemplateTestCaseNodeOrderMap) => void
  flowBlocks?: FlowBlock[]
  onFlowBlocksChange?: (flowBlocks: FlowBlock[]) => void
  defaultValueInput?: boolean
  invocationController: FlowInvocationController
  view?: 'graph' | 'linear'
}

const EMPTY_FLOW_BLOCKS: FlowBlock[] = []

const TemplateTestCaseFlow = ({
  initialNodesOrder,
  stepDefinitions,
  resources,
  onNodeOrderChange,
  flowBlocks = EMPTY_FLOW_BLOCKS,
  onFlowBlocksChange,
  defaultValueInput = false,
  invocationController,
  view = 'graph',
}: TemplateTestCaseFlowProps) => {
  const nodesOrder = initialNodesOrder
  return view === 'linear' ? (
    <LinearStepEditor
      nodeOrder={nodesOrder}
      stepDefinitions={stepDefinitions}
      locators={resources.locators}
      locatorGroups={resources.locatorGroups}
      environments={resources.environments}
      modules={resources.modules}
      onInlineLocatorSave={resources.onInlineLocatorSave}
      onNodeOrderChange={next => onNodeOrderChange(next as TemplateTestCaseNodeOrderMap)}
      flowBlocks={flowBlocks}
      onFlowBlocksChange={onFlowBlocksChange}
      invocationController={invocationController}
    />
  ) : (
    <FlowDiagram
      nodeOrder={nodesOrder}
      stepDefinitions={stepDefinitions}
      onNodeOrderChange={next => onNodeOrderChange(next as TemplateTestCaseNodeOrderMap)}
      locators={resources.locators}
      locatorGroups={resources.locatorGroups}
      environments={resources.environments}
      modules={resources.modules}
      onInlineLocatorSave={resources.onInlineLocatorSave}
      defaultValueInput={defaultValueInput}
      enableNodeGrouping
      flowBlocks={flowBlocks}
      onFlowBlocksChange={onFlowBlocksChange}
      invocationController={invocationController}
    />
  )
}

export default TemplateTestCaseFlow
