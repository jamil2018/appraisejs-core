import type { TemplateStepParameter } from '@prisma/client'
import type {
  InlineLocatorSaveResult,
  LocatorWorkspaceEnvironment,
} from '@/app/(base)/locators/create/create-locator-workspace-helpers'
import type { Locator, LocatorGroup, Module } from '@prisma/client'

export type DynamicParameterValue = string | number | boolean | Date
export type LocatorOption = Pick<Locator, 'id' | 'name' | 'locatorGroupId'>
export type LocatorGroupOption = Pick<LocatorGroup, 'id' | 'name' | 'route' | 'moduleId'>
export type LocatorSelectionMode = 'existing' | 'new'

export type DynamicParameterInputFieldProps = {
  param: TemplateStepParameter
  values: Record<string, DynamicParameterValue>
  errors: Record<string, string>
  defaultValueInput: boolean
  fieldClassName: string
  selectedLocatorGroups: Record<string, string>
  locatorSelectionModes: Record<string, LocatorSelectionMode>
  createdLocatorSelections: Record<string, InlineLocatorSaveResult>
  availableLocatorGroups: LocatorGroupOption[]
  availableLocatorOptions: LocatorOption[]
  createLocatorParamName: string | null
  environments: LocatorWorkspaceEnvironment[]
  modules: Array<Pick<Module, 'id' | 'name' | 'parentId'>>
  onInputChange: (name: string, value: DynamicParameterValue) => void
  onLocatorGroupChange: (paramName: string, groupId: string) => void
  onLocatorSelectionModeChange: (paramName: string, mode: LocatorSelectionMode) => void
  onInlineLocatorSave: (paramName: string, result: InlineLocatorSaveResult) => void
  onOpenCreateLocator: (paramName: string | null) => void
}
