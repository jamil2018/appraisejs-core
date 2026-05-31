export type CompanionSessionStatus = 'starting' | 'ready' | 'picked' | 'saving' | 'closed' | 'error'
export type CompanionPickedLocatorStrategy = 'test-id' | 'role' | 'label' | 'placeholder' | 'id' | 'css' | 'xpath'
export interface CompanionLaunchSource {
  environmentId?: string
  environmentName?: string
  url: string
}
export interface CompanionPickedLocatorPayload {
  selector: string
  currentUrl: string
  pathname: string
  pageTitle: string
  tagName: string
  text?: string
  accessibleName?: string
  strategy?: CompanionPickedLocatorStrategy
}
export interface CompanionSessionFile {
  sessionId: string
  status: CompanionSessionStatus
  launchSource: CompanionLaunchSource
  currentUrl: string
  currentPathname: string
  pageTitle: string
  companionPid: number | null
  crashLogPath?: string
  pickedLocator?: CompanionPickedLocatorPayload
  error?: string
  startedAt: string
  updatedAt: string
}
