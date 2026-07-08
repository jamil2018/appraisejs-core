import type { NodeOrderMap, TemplateTestCaseNodeOrderMap, FlowBlock } from '@/types/diagram/diagram'
import type { Environment, Locator, LocatorGroup, Module, TemplateStep, TemplateStepParameter } from '@prisma/client'

export type FlowDiagramStepBlock = {
  id: string
  name: string
  steps: Array<{
    id: string
    order: number
    templateStep: TemplateStep & {
      parameters: TemplateStepParameter[]
    }
  }>
}

export type FlowDiagramProps = {
  nodeOrder: NodeOrderMap | TemplateTestCaseNodeOrderMap
  templateStepParams: TemplateStepParameter[]
  templateSteps: TemplateStep[]
  locators: Array<Pick<Locator, 'id' | 'name' | 'locatorGroupId'>>
  locatorGroups: Array<Pick<LocatorGroup, 'id' | 'name' | 'route' | 'moduleId'>>
  environments: Array<Pick<Environment, 'id' | 'name'>>
  modules: Array<Pick<Module, 'id' | 'name' | 'parentId'>>
  defaultValueInput?: boolean
  enableNodeSearch?: boolean
  enableNodeGrouping?: boolean
  stepBlocks?: FlowDiagramStepBlock[]
  flowBlocks?: FlowBlock[]
  layoutRefreshKey?: string | number | boolean
  onFlowBlocksChange?: (flowBlocks: FlowBlock[]) => void
  onNodeOrderChange: (nodeOrder: NodeOrderMap | TemplateTestCaseNodeOrderMap) => void
}

export const EMPTY_FLOW_BLOCKS: FlowBlock[] = []
