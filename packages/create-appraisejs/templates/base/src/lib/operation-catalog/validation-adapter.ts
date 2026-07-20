import { projectOperationAsAction } from './action-projection'
import { defaultOperationRegistry } from './default-operation-registry'

export const operationValidationCatalog = {
  catalogHash: defaultOperationRegistry.manifestHash,
  readActions(refs: Array<{ id: string; version?: string }>) {
    return defaultOperationRegistry.read(refs).map(projectOperationAsAction)
  },
}

export function listOperationCapabilities(runtime?: 'browser' | 'api' | 'node' | 'database') {
  const capabilities = new Set<string>()
  let cursor: number | null = 0
  while (cursor != null) {
    const page = defaultOperationRegistry.list({ runtime, surface: 'agent' }, cursor, 100)
    page.items.forEach(operation => operation.capabilities.forEach(capability => capabilities.add(capability)))
    cursor = page.nextCursor
  }
  return [...capabilities].sort()
}
