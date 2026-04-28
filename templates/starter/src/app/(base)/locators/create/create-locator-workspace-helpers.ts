import type { GroupResolutionMode as PickerGroupResolutionMode, LocatorPickerSession } from '@/types/locator-picker'
import type { ActionResponseData } from '@/types/form/actionHandler'
import type { Environment, Locator, LocatorGroup, Module } from '@prisma/client'

import { inferGroupSuggestion, normalizeRoute, suggestLocatorName } from '@/lib/locator-picker/suggestions'

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

export function statusTone(status: LocatorPickerSession['status']) {
  switch (status) {
    case 'picked':
      return 'default'
    case 'saving':
      return 'secondary'
    case 'closed':
      return 'outline'
    case 'error':
      return 'destructive'
    case 'ready':
      return 'secondary'
    case 'starting':
    default:
      return 'secondary'
  }
}

export function formatStatus(status: LocatorPickerSession['status']) {
  return status === 'picked' ? 'Picked' : `${status.charAt(0).toUpperCase()}${status.slice(1)}`
}

export function createInitialWorkspaceState(
  environments: LocatorWorkspaceEnvironment[],
  initialValues?: LocatorWorkspaceInitialValues,
): LocatorWorkspaceState {
  const initialRoute = normalizeRoute(initialValues?.route ?? '/')

  return {
    sourceType: environments.length > 0 ? 'environment' : 'url',
    environmentId: environments[0]?.id ?? '',
    url: '',
    locatorName: initialValues?.locatorName ?? '',
    selector: initialValues?.selector ?? '',
    resolutionMode: initialValues?.resolutionMode ?? 'existing',
    existingLocatorGroupId: initialValues?.existingLocatorGroupId ?? '',
    newLocatorGroupName: initialValues?.newLocatorGroupName ?? '',
    route: initialRoute,
    moduleId: initialValues?.moduleId ?? '',
    lastAutoLocatorName: initialValues?.locatorName ?? '',
    lastAutoSelector: initialValues?.selector ?? '',
    lastAutoExistingGroupId: initialValues?.existingLocatorGroupId ?? '',
    lastAutoGroupName: initialValues?.newLocatorGroupName ?? '',
    lastAutoRoute: initialRoute,
    lastAutoModuleId: initialValues?.moduleId ?? '',
  }
}

export function getPickerPayloadSignature(session: LocatorPickerSession | null) {
  const pickedLocator = session?.pickedLocator
  if (!session || !pickedLocator) {
    return ''
  }

  return `${session.updatedAt}:${pickedLocator.currentUrl}:${pickedLocator.selector}`
}

export function applyPickedLocatorToWorkspaceState(
  currentState: LocatorWorkspaceState,
  session: LocatorPickerSession,
  locatorGroups: LocatorWorkspaceLocatorGroup[],
  modules: LocatorWorkspaceModule[],
): LocatorWorkspaceState {
  const pickedLocator = session.pickedLocator
  if (!pickedLocator) {
    return currentState
  }

  const nextState = { ...currentState }

  if (currentState.selector === '' || currentState.selector === currentState.lastAutoSelector) {
    nextState.selector = pickedLocator.selector
    nextState.lastAutoSelector = pickedLocator.selector
  }

  const suggestedName = suggestLocatorName(pickedLocator)
  if (suggestedName && (currentState.locatorName === '' || currentState.locatorName === currentState.lastAutoLocatorName)) {
    nextState.locatorName = suggestedName
    nextState.lastAutoLocatorName = suggestedName
  }

  const suggestion = inferGroupSuggestion(pickedLocator.pathname, pickedLocator.pageTitle, locatorGroups, modules)

  if (currentState.route === '/' || currentState.route === '' || currentState.route === currentState.lastAutoRoute) {
    nextState.route = suggestion.route
    nextState.lastAutoRoute = suggestion.route
  }

  if (suggestion.mode === 'existing') {
    nextState.resolutionMode = currentState.resolutionMode === 'create' ? 'existing' : currentState.resolutionMode

    const nextExistingGroupId = suggestion.existingLocatorGroupId ?? ''
    if (
      currentState.existingLocatorGroupId === '' ||
      currentState.existingLocatorGroupId === currentState.lastAutoExistingGroupId
    ) {
      nextState.existingLocatorGroupId = nextExistingGroupId
      nextState.lastAutoExistingGroupId = nextExistingGroupId
    }
  } else {
    if (
      currentState.resolutionMode === 'create' ||
      currentState.existingLocatorGroupId === '' ||
      currentState.existingLocatorGroupId === currentState.lastAutoExistingGroupId
    ) {
      nextState.resolutionMode = 'create'
    }

    if (currentState.newLocatorGroupName === '' || currentState.newLocatorGroupName === currentState.lastAutoGroupName) {
      nextState.newLocatorGroupName = suggestion.suggestedGroupName
      nextState.lastAutoGroupName = suggestion.suggestedGroupName
    }

    if (currentState.moduleId === '' || currentState.moduleId === currentState.lastAutoModuleId) {
      const nextModuleId = suggestion.suggestedModuleId ?? ''
      nextState.moduleId = nextModuleId
      nextState.lastAutoModuleId = nextModuleId
    }
  }

  return nextState
}

export function createWorkspaceAutoFillSnapshot(state: LocatorWorkspaceState) {
  return {
    lastAutoLocatorName: state.locatorName,
    lastAutoSelector: state.selector,
    lastAutoExistingGroupId: state.existingLocatorGroupId,
    lastAutoGroupName: state.newLocatorGroupName,
    lastAutoRoute: state.route,
    lastAutoModuleId: state.moduleId,
  }
}

export function canSaveLocator(state: LocatorWorkspaceState) {
  return (
    state.locatorName.trim() !== '' &&
    state.selector.trim() !== '' &&
    ((state.resolutionMode === 'existing' && state.existingLocatorGroupId !== '') ||
      (state.resolutionMode === 'create' && state.newLocatorGroupName.trim() !== '' && state.moduleId !== ''))
  )
}

export function canLaunchPicker(state: LocatorWorkspaceState) {
  return state.sourceType === 'environment' ? state.environmentId !== '' : state.url.trim() !== ''
}

export function getLocatorSourceType(value: string): LocatorSourceType {
  return locatorSourceTypes.find(sourceType => sourceType === value) ?? 'environment'
}

export function getLocatorWorkspaceResolutionMode(value: string): GroupResolutionMode {
  return locatorWorkspaceResolutionModes.find(resolutionMode => resolutionMode === value) ?? 'existing'
}

function isEnvironmentRow(value: unknown): value is Environment {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'baseUrl' in value &&
    typeof value.baseUrl === 'string' &&
    'apiBaseUrl' in value &&
    (typeof value.apiBaseUrl === 'string' || value.apiBaseUrl === null) &&
    'username' in value &&
    (typeof value.username === 'string' || value.username === null) &&
    'password' in value &&
    (typeof value.password === 'string' || value.password === null) &&
    'createdAt' in value &&
    value.createdAt instanceof Date &&
    'updatedAt' in value &&
    value.updatedAt instanceof Date
  )
}

function isLocatorGroupRow(value: unknown): value is LocatorGroup {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'route' in value &&
    typeof value.route === 'string' &&
    'moduleId' in value &&
    typeof value.moduleId === 'string' &&
    'createdAt' in value &&
    value.createdAt instanceof Date &&
    'updatedAt' in value &&
    value.updatedAt instanceof Date
  )
}

function isModuleRow(value: unknown): value is Module {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'parentId' in value &&
    (typeof value.parentId === 'string' || value.parentId === null) &&
    'createdAt' in value &&
    value.createdAt instanceof Date &&
    'updatedAt' in value &&
    value.updatedAt instanceof Date
  )
}

function isLocatorRow(value: unknown): value is Locator & { locatorGroup?: LocatorGroup | null } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'value' in value &&
    typeof value.value === 'string' &&
    'locatorGroupId' in value &&
    (typeof value.locatorGroupId === 'string' || value.locatorGroupId === null) &&
    'createdAt' in value &&
    value.createdAt instanceof Date &&
    'updatedAt' in value &&
    value.updatedAt instanceof Date
  )
}

function isLocatorPickerSession(value: unknown): value is LocatorPickerSession {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sessionId' in value &&
    typeof value.sessionId === 'string' &&
    'launchSource' in value &&
    typeof value.launchSource === 'object' &&
    value.launchSource !== null &&
    'url' in value.launchSource &&
    typeof value.launchSource.url === 'string' &&
    'browserName' in value &&
    value.browserName === 'chromium' &&
    'status' in value &&
    typeof value.status === 'string' &&
    'currentUrl' in value &&
    typeof value.currentUrl === 'string' &&
    'currentPathname' in value &&
    typeof value.currentPathname === 'string' &&
    'pageTitle' in value &&
    typeof value.pageTitle === 'string' &&
    'companionPid' in value &&
    (typeof value.companionPid === 'number' || value.companionPid === null) &&
    'startedAt' in value &&
    typeof value.startedAt === 'string' &&
    'updatedAt' in value &&
    typeof value.updatedAt === 'string'
  )
}

export function getEnvironmentRows(data: ActionResponseData | undefined): Environment[] {
  return Array.isArray(data) ? data.filter(isEnvironmentRow) : []
}

export function getLocatorGroupRows(data: ActionResponseData | undefined): LocatorGroup[] {
  return Array.isArray(data) ? data.filter(isLocatorGroupRow) : []
}

export function getModuleRows(data: ActionResponseData | undefined): Module[] {
  return Array.isArray(data) ? data.filter(isModuleRow) : []
}

export function getLocatorRow(data: ActionResponseData | undefined) {
  return isLocatorRow(data) ? data : null
}

export function getLocatorPickerSession(data: ActionResponseData | undefined) {
  return isLocatorPickerSession(data) ? data : null
}

export function getInlineLocatorSaveResult(data: ActionResponseData | undefined): InlineLocatorSaveResult | null {
  if (
    typeof data === 'object' &&
    data !== null &&
    'locatorId' in data &&
    typeof data.locatorId === 'string' &&
    'locatorName' in data &&
    typeof data.locatorName === 'string' &&
    'locatorGroupId' in data &&
    typeof data.locatorGroupId === 'string' &&
    'locatorGroupName' in data &&
    typeof data.locatorGroupName === 'string' &&
    'selector' in data &&
    typeof data.selector === 'string' &&
    'route' in data &&
    typeof data.route === 'string' &&
    'moduleId' in data &&
    typeof data.moduleId === 'string'
  ) {
    return {
      locatorId: data.locatorId,
      locatorName: data.locatorName,
      locatorGroupId: data.locatorGroupId,
      locatorGroupName: data.locatorGroupName,
      selector: data.selector,
      route: data.route,
      moduleId: data.moduleId,
    }
  }

  return null
}
