import { defaultOperationRegistry } from './default-operation-registry'

/** Trusted operation registry surface used by Validation AST semantic checks.
 * It deliberately exposes canonical operation descriptors, never the removed
 * action projection compatibility vocabulary. */
export const operationValidationRegistry = {
  manifestHash: defaultOperationRegistry.manifestHash,
  read(refs: Array<{ id: string; version?: string }>) {
    return defaultOperationRegistry.read(refs)
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
