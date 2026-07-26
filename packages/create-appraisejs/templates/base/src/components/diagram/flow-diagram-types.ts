import type { NodeOrderMap, TemplateTestCaseNodeOrderMap, FlowBlock } from '@/types/diagram/diagram'
import type { Environment, Locator, LocatorGroup, Module } from '@prisma/client'
import type { StepDefinitionOption } from '@/types/step-definition-option'

export type FlowDiagramProps = {
  nodeOrder: NodeOrderMap | TemplateTestCaseNodeOrderMap
  stepDefinitions: StepDefinitionOption[]
  locators: Array<Pick<Locator, 'id' | 'name' | 'locatorGroupId'>>
  locatorGroups: Array<Pick<LocatorGroup, 'id' | 'name' | 'route' | 'moduleId'>>
  environments: Array<Pick<Environment, 'id' | 'name'>>
  modules: Array<Pick<Module, 'id' | 'name' | 'parentId'>>
  defaultValueInput?: boolean
  parameterMode?: 'values' | 'hidden'
  enableNodeSearch?: boolean
  enableNodeGrouping?: boolean
  flowBlocks?: FlowBlock[]
  layoutRefreshKey?: string | number | boolean
  onFlowBlocksChange?: (flowBlocks: FlowBlock[]) => void
  onNodeOrderChange: (nodeOrder: NodeOrderMap | TemplateTestCaseNodeOrderMap) => void
}
