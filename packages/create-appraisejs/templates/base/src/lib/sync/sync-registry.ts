type BaseSyncScriptDefinition = {
  id: string
  label: string
  description: string
  orderLabel: string
  scriptFile: string
  dependencies: string[]
}

export const SYNC_ALL_REQUEST_ID = 'sync-all' as const

export const syncScriptDefinitions = [
  {
    id: 'sync-modules',
    label: 'Sync Modules',
    description: 'Syncs modules to DB.',
    orderLabel: 'Modules',
    scriptFile: 'sync-modules.ts',
    dependencies: [],
  },
  {
    id: 'sync-environments',
    label: 'Sync Environments',
    description: 'Syncs environments to DB.',
    orderLabel: 'Environments',
    scriptFile: 'sync-environments.ts',
    dependencies: [],
  },
  {
    id: 'sync-tags',
    label: 'Sync Tags',
    description: 'Syncs tags to DB.',
    orderLabel: 'Tags',
    scriptFile: 'sync-tags.ts',
    dependencies: [],
  },
  {
    id: 'sync-step-definitions',
    label: 'Sync Step Definitions',
    description: 'Publishes canonical built-in Step Definitions.',
    orderLabel: 'Step Definitions',
    scriptFile: 'sync-step-definitions.ts',
    dependencies: [],
  },
  {
    id: 'sync-locator-groups',
    label: 'Sync Locator Groups',
    description: 'Syncs locator groups to DB.',
    orderLabel: 'Locator Groups',
    scriptFile: 'sync-locator-groups.ts',
    dependencies: ['sync-modules'],
  },
  {
    id: 'sync-locators',
    label: 'Sync Locators',
    description: 'Syncs locators to DB.',
    orderLabel: 'Locators',
    scriptFile: 'sync-locators.ts',
    dependencies: ['sync-locator-groups'],
  },
  {
    id: 'sync-test-suites',
    label: 'Sync Test Suites',
    description: 'Syncs test suites to DB.',
    orderLabel: 'Test Suites',
    scriptFile: 'sync-test-suites.ts',
    dependencies: ['sync-modules', 'sync-tags'],
  },
  {
    id: 'sync-test-cases',
    label: 'Sync Test Cases',
    description: 'Syncs test cases to DB.',
    orderLabel: 'Test Cases',
    scriptFile: 'sync-test-cases.ts',
    dependencies: ['sync-test-suites', 'sync-step-definitions', 'sync-tags'],
  },
] as const satisfies readonly BaseSyncScriptDefinition[]

export type SyncScriptId = (typeof syncScriptDefinitions)[number]['id']
export type SyncRequestId = SyncScriptId | typeof SYNC_ALL_REQUEST_ID
export type SyncScriptDefinition = (typeof syncScriptDefinitions)[number]

const syncScriptDefinitionMap = new Map<SyncScriptId, (typeof syncScriptDefinitions)[number]>(
  syncScriptDefinitions.map(definition => [definition.id, definition]),
)

function isSyncScriptId(value: string): value is SyncScriptId {
  return syncScriptDefinitionMap.has(value as SyncScriptId)
}

export function isSyncRequestId(value: string): value is SyncRequestId {
  return value === SYNC_ALL_REQUEST_ID || isSyncScriptId(value)
}

export function getSyncScriptDefinition(scriptId: SyncScriptId) {
  const definition = syncScriptDefinitionMap.get(scriptId)

  if (!definition) {
    throw new Error(`Unknown sync script: ${scriptId}`)
  }

  return definition
}

function resolveSyncExecutionOrder(requestedScriptId: SyncScriptId): SyncScriptId[] {
  const visiting = new Set<SyncScriptId>()
  const visited = new Set<SyncScriptId>()
  const executionOrder: SyncScriptId[] = []

  const visit = (scriptId: SyncScriptId) => {
    if (visited.has(scriptId)) {
      return
    }

    if (visiting.has(scriptId)) {
      throw new Error(`Circular sync dependency detected for ${scriptId}`)
    }

    visiting.add(scriptId)

    for (const dependencyId of getSyncScriptDefinition(scriptId).dependencies) {
      visit(dependencyId as SyncScriptId)
    }

    visiting.delete(scriptId)
    visited.add(scriptId)
    executionOrder.push(scriptId)
  }

  visit(requestedScriptId)

  return executionOrder
}

export function resolveRequestedSyncExecutionOrder(requestedScriptId: SyncRequestId): SyncScriptId[] {
  if (requestedScriptId === SYNC_ALL_REQUEST_ID) {
    return syncScriptDefinitions.map(definition => definition.id)
  }

  return resolveSyncExecutionOrder(requestedScriptId)
}
