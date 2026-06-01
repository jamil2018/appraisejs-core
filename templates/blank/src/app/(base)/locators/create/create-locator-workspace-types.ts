import type { ActionResponseData } from '@/types/form/actionHandler'
import type { GroupResolutionMode as PickerGroupResolutionMode, LocatorPickerSession } from '@/types/locator-picker'
import type { Environment, Locator, LocatorGroup, Module } from '@prisma/client'

export type { ActionResponseData, Environment, Locator, LocatorGroup, LocatorPickerSession, Module }

export type LocatorSourceType = 'environment' | 'url'
export type LocatorWorkspaceMode = 'create' | 'modify'
export type GroupResolutionMode = PickerGroupResolutionMode
export type LocatorWorkspaceDisplayMode = 'page' | 'inline'

export type LocatorWorkspaceEnvironment = Pick<Environment, 'id' | 'name'>
export type LocatorWorkspaceLocatorGroup = Pick<LocatorGroup, 'id' | 'name' | 'route' | 'moduleId'>
export type LocatorWorkspaceModule = Pick<Module, 'id' | 'name' | 'parentId'>

export type InlineLocatorSaveResult = {
  locatorId: string
  locatorName: string
  locatorGroupId: string
  locatorGroupName: string
  selector: string
  route: string
  moduleId: string
}

export const locatorSourceTypes = ['environment', 'url'] as const
export const locatorWorkspaceResolutionModes = ['existing', 'create'] as const

export type LocatorWorkspaceInitialValues = {
  locatorName?: string
  selector?: string
  resolutionMode?: GroupResolutionMode
  existingLocatorGroupId?: string
  newLocatorGroupName?: string
  route?: string
  moduleId?: string
}

export type CreateLocatorWorkspaceProps = {
  environments: LocatorWorkspaceEnvironment[]
  locatorGroups: LocatorWorkspaceLocatorGroup[]
  modules: LocatorWorkspaceModule[]
  mode?: LocatorWorkspaceMode
  displayMode?: LocatorWorkspaceDisplayMode
  locatorId?: string
  initialValues?: LocatorWorkspaceInitialValues
  onSaveSuccess?: (result: InlineLocatorSaveResult) => void | Promise<void>
  onClose?: () => void
}

export type LocatorWorkspaceState = {
  sourceType: LocatorSourceType
  environmentId: string
  url: string
  locatorName: string
  selector: string
  resolutionMode: GroupResolutionMode
  existingLocatorGroupId: string
  newLocatorGroupName: string
  route: string
  moduleId: string
  lastAutoLocatorName: string
  lastAutoSelector: string
  lastAutoExistingGroupId: string
  lastAutoGroupName: string
  lastAutoRoute: string
  lastAutoModuleId: string
}
