import type {
  ActionResponseData,
  Environment,
  InlineLocatorSaveResult,
  Locator,
  LocatorGroup,
  LocatorPickerSession,
  Module,
} from './create-locator-workspace-types'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null
}

function hasStringProp(value: UnknownRecord, property: string) {
  return typeof value[property] === 'string'
}

function hasNullableStringProp(value: UnknownRecord, property: string) {
  return typeof value[property] === 'string' || value[property] === null
}

function hasDateProp(value: UnknownRecord, property: string) {
  return value[property] instanceof Date
}

function hasStringProps<T extends string>(
  value: UnknownRecord,
  properties: readonly T[],
): value is UnknownRecord & Record<T, string> {
  return properties.every(property => hasStringProp(value, property))
}

function hasNullableStringProps(value: UnknownRecord, properties: string[]) {
  return properties.every(property => hasNullableStringProp(value, property))
}

function hasDateProps(value: UnknownRecord) {
  return hasDateProp(value, 'createdAt') && hasDateProp(value, 'updatedAt')
}

function isEnvironmentRow(value: unknown): value is Environment {
  return (
    isRecord(value) &&
    hasStringProps(value, ['id', 'name', 'baseUrl']) &&
    hasNullableStringProps(value, ['apiBaseUrl', 'username', 'passwordEnvironmentVariable']) &&
    hasStringProp(value, 'credentialState') &&
    hasDateProps(value)
  )
}

function isLocatorGroupRow(value: unknown): value is LocatorGroup {
  return isRecord(value) && hasStringProps(value, ['id', 'name', 'route', 'moduleId']) && hasDateProps(value)
}

function isModuleRow(value: unknown): value is Module {
  return (
    isRecord(value) &&
    hasStringProps(value, ['id', 'name']) &&
    hasNullableStringProp(value, 'parentId') &&
    hasDateProps(value)
  )
}

function isLocatorRow(value: unknown): value is Locator & { locatorGroup?: LocatorGroup | null } {
  return (
    isRecord(value) &&
    hasStringProps(value, ['id', 'name', 'value']) &&
    hasNullableStringProp(value, 'locatorGroupId') &&
    hasDateProps(value)
  )
}

function isLocatorPickerSession(value: unknown): value is LocatorPickerSession {
  if (!isRecord(value) || !isRecord(value.launchSource)) {
    return false
  }

  return (
    value.browserName === 'chromium' &&
    hasStringProp(value.launchSource, 'url') &&
    hasStringProps(value, [
      'sessionId',
      'status',
      'currentUrl',
      'currentPathname',
      'pageTitle',
      'startedAt',
      'updatedAt',
    ]) &&
    (typeof value.companionPid === 'number' || value.companionPid === null) &&
    'companionPid' in value
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
    isRecord(data) &&
    hasStringProps(data, [
      'locatorId',
      'locatorName',
      'locatorGroupId',
      'locatorGroupName',
      'selector',
      'route',
      'moduleId',
    ])
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
