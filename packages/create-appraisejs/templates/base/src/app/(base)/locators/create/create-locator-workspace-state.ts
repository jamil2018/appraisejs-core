import { inferGroupSuggestion, normalizeRoute, suggestLocatorName } from '@/lib/locator-picker/suggestions'

import type {
  GroupResolutionMode,
  LocatorPickerSession,
  LocatorSourceType,
  LocatorWorkspaceEnvironment,
  LocatorWorkspaceInitialValues,
  LocatorWorkspaceLocatorGroup,
  LocatorWorkspaceModule,
  LocatorWorkspaceState,
} from './create-locator-workspace-types'
import { locatorSourceTypes, locatorWorkspaceResolutionModes } from './create-locator-workspace-types'

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
  const {
    locatorName = '',
    selector = '',
    resolutionMode = 'existing',
    existingLocatorGroupId = '',
    newLocatorGroupName = '',
    route = '/',
    moduleId = '',
  } = initialValues ?? {}
  const initialRoute = normalizeRoute(route)

  return {
    sourceType: environments.length > 0 ? 'environment' : 'url',
    environmentId: environments[0]?.id ?? '',
    url: '',
    locatorName,
    selector,
    resolutionMode,
    existingLocatorGroupId,
    newLocatorGroupName,
    route: initialRoute,
    moduleId,
    lastAutoLocatorName: locatorName,
    lastAutoSelector: selector,
    lastAutoExistingGroupId: existingLocatorGroupId,
    lastAutoGroupName: newLocatorGroupName,
    lastAutoRoute: initialRoute,
    lastAutoModuleId: moduleId,
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

  applyPickedSelector(nextState, currentState, pickedLocator.selector)
  applySuggestedLocatorName(nextState, currentState, suggestLocatorName(pickedLocator))

  const suggestion = inferGroupSuggestion(pickedLocator.pathname, pickedLocator.pageTitle, locatorGroups, modules)
  applySuggestedRoute(nextState, currentState, suggestion.route)

  if (suggestion.mode === 'existing') {
    applyExistingGroupSuggestion(nextState, currentState, suggestion.existingLocatorGroupId)
  } else {
    applyNewGroupSuggestion(nextState, currentState, suggestion.suggestedGroupName, suggestion.suggestedModuleId)
  }

  return nextState
}

function canReplaceAutoValue(currentValue: string, lastAutoValue: string) {
  return currentValue === '' || currentValue === lastAutoValue
}

function canReplaceRoute(currentState: LocatorWorkspaceState) {
  return currentState.route === '/' || canReplaceAutoValue(currentState.route, currentState.lastAutoRoute)
}

function canSwitchToCreateMode(currentState: LocatorWorkspaceState) {
  return (
    currentState.resolutionMode === 'create' ||
    canReplaceAutoValue(currentState.existingLocatorGroupId, currentState.lastAutoExistingGroupId)
  )
}

function applyPickedSelector(
  nextState: LocatorWorkspaceState,
  currentState: LocatorWorkspaceState,
  pickedSelector: string,
) {
  if (!canReplaceAutoValue(currentState.selector, currentState.lastAutoSelector)) {
    return
  }

  nextState.selector = pickedSelector
  nextState.lastAutoSelector = pickedSelector
}

function applySuggestedLocatorName(
  nextState: LocatorWorkspaceState,
  currentState: LocatorWorkspaceState,
  suggestedName: string,
) {
  if (!suggestedName || !canReplaceAutoValue(currentState.locatorName, currentState.lastAutoLocatorName)) {
    return
  }

  nextState.locatorName = suggestedName
  nextState.lastAutoLocatorName = suggestedName
}

function applySuggestedRoute(
  nextState: LocatorWorkspaceState,
  currentState: LocatorWorkspaceState,
  suggestedRoute: string,
) {
  if (!canReplaceRoute(currentState)) {
    return
  }

  nextState.route = suggestedRoute
  nextState.lastAutoRoute = suggestedRoute
}

function applyExistingGroupSuggestion(
  nextState: LocatorWorkspaceState,
  currentState: LocatorWorkspaceState,
  suggestedLocatorGroupId: string | undefined,
) {
  nextState.resolutionMode = currentState.resolutionMode === 'create' ? 'existing' : currentState.resolutionMode

  if (!canReplaceAutoValue(currentState.existingLocatorGroupId, currentState.lastAutoExistingGroupId)) {
    return
  }

  const nextExistingGroupId = suggestedLocatorGroupId ?? ''
  nextState.existingLocatorGroupId = nextExistingGroupId
  nextState.lastAutoExistingGroupId = nextExistingGroupId
}

function applyNewGroupSuggestion(
  nextState: LocatorWorkspaceState,
  currentState: LocatorWorkspaceState,
  suggestedGroupName: string,
  suggestedModuleId: string | undefined,
) {
  if (canSwitchToCreateMode(currentState)) {
    nextState.resolutionMode = 'create'
  }

  if (canReplaceAutoValue(currentState.newLocatorGroupName, currentState.lastAutoGroupName)) {
    nextState.newLocatorGroupName = suggestedGroupName
    nextState.lastAutoGroupName = suggestedGroupName
  }

  if (canReplaceAutoValue(currentState.moduleId, currentState.lastAutoModuleId)) {
    const nextModuleId = suggestedModuleId ?? ''
    nextState.moduleId = nextModuleId
    nextState.lastAutoModuleId = nextModuleId
  }
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
