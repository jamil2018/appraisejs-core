export type LocatorPickerStatus = 'starting' | 'ready' | 'picked' | 'saving' | 'closed' | 'error'

export type GroupResolutionMode = 'existing' | 'create'

export type PickedLocatorStrategy = 'test-id' | 'role' | 'label' | 'placeholder' | 'id' | 'css' | 'xpath'

export interface PickedLocatorPayload {
  sessionId: string
  selector: string
  currentUrl: string
  pathname: string
  pageTitle: string
  tagName: string
  text?: string
  accessibleName?: string
  strategy?: PickedLocatorStrategy
}

export interface LocatorPickerGroupSuggestion {
  mode: GroupResolutionMode
  route: string
  existingLocatorGroupId?: string
  existingLocatorGroupName?: string
  suggestedGroupName: string
  suggestedModuleId?: string
  suggestedModulePath?: string
  requiresModuleSelection: boolean
}

export interface LocatorPickerSession {
  sessionId: string
  launchSource: {
    environmentId?: string
    environmentName?: string
    url: string
  }
  browserName: 'chromium'
  status: LocatorPickerStatus
  currentUrl: string
  currentPathname: string
  pageTitle: string
  companionPid: number | null
  crashLogPath?: string
  pickedLocator?: PickedLocatorPayload
  startedAt: string
  updatedAt: string
  error?: string
}

export interface StartLocatorPickerSessionRequest {
  environmentId?: string
  url?: string
}

export interface SavePickedLocatorRequest {
  sessionId?: string
  locatorName: string
  selector: string
  resolutionMode: GroupResolutionMode
  existingLocatorGroupId?: string
  newLocatorGroupName?: string
  route?: string
  moduleId?: string
}
