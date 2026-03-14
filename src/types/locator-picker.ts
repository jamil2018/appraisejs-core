import type { BrowserEngine } from '@prisma/client'

export type LocatorPickerStatus = 'starting' | 'ready' | 'selecting' | 'selected' | 'saving' | 'closed' | 'error'

export type SelectorStrategy = 'test-id' | 'role' | 'label' | 'placeholder' | 'text' | 'id' | 'css' | 'xpath'

export type GroupResolutionMode = 'existing' | 'create'

export interface SelectorCandidate {
  selector: string
  strategy: SelectorStrategy
  description: string
  count: number
  isUnique: boolean
  isVisible: boolean
  score: number
}

export interface PickedElement {
  tagName: string
  id?: string
  text?: string
  accessibleName?: string
  role?: string
  labelText?: string
  placeholder?: string
  classes: string[]
  attributes: Record<string, string>
  currentUrl: string
  pathname: string
  pageTitle: string
  frameUrl: string
  outerHTML: string
  isInFrame: boolean
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
  browserEngine: BrowserEngine
  status: LocatorPickerStatus
  selectionMode: boolean
  currentUrl: string
  currentPathname: string
  pageTitle: string
  pickedElement?: PickedElement
  selectorCandidates: SelectorCandidate[]
  suggestedLocatorName?: string
  groupSuggestion?: LocatorPickerGroupSuggestion
  startedAt: string
  updatedAt: string
  error?: string
}

export interface StartLocatorPickerSessionRequest {
  environmentId?: string
  url?: string
  browserEngine?: BrowserEngine
}

export interface SavePickedLocatorRequest {
  sessionId: string
  locatorName: string
  selector: string
  resolutionMode: GroupResolutionMode
  existingLocatorGroupId?: string
  newLocatorGroupName?: string
  route?: string
  moduleId?: string
}
