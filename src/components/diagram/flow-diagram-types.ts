import type { NodeOrderMap, TemplateTestCaseNodeOrderMap, FlowBlock } from '@/types/diagram/diagram'
import type { Environment, Locator, LocatorGroup, Module } from '@prisma/client'
import type { StepDefinitionOption } from '@/types/step-definition-option'
import type { InlineLocatorSaveResult } from '@/app/(base)/locators/create/create-locator-workspace-helpers'

export type FlowDiagramProps = {
  nodeOrder: NodeOrderMap | TemplateTestCaseNodeOrderMap
  stepDefinitions: StepDefinitionOption[]
  locators: Array<Pick<Locator, 'id' | 'name' | 'locatorGroupId'>>
  locatorGroups: Array<Pick<LocatorGroup, 'id' | 'name' | 'route' | 'moduleId'>>
  environments: Array<Pick<Environment, 'id' | 'name'>>
  modules: Array<Pick<Module, 'id' | 'name' | 'parentId'>>
  onInlineLocatorSave?: (result: InlineLocatorSaveResult) => void
  defaultValueInput?: boolean
  parameterMode?: 'values' | 'hidden'
  enableNodeSearch?: boolean
  enableNodeGrouping?: boolean
  flowBlocks?: FlowBlock[]
  layoutRefreshKey?: string | number | boolean
  onFlowBlocksChange?: (flowBlocks: FlowBlock[]) => void
  onNodeOrderChange: (nodeOrder: NodeOrderMap | TemplateTestCaseNodeOrderMap) => void
}
