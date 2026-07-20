import { operationContentHash } from '../../packages/cucumber-runtime/src/operations/index'
import { defaultOperationRegistry } from '../../src/lib/operation-catalog/default-operation-registry'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const operationArchitectureDigest = operationContentHash

export function readAllOperationDescriptors() {
  const references = []
  let cursor: number | null = 0
  while (cursor != null) {
    const page = defaultOperationRegistry.list({}, cursor, 100)
    references.push(...page.items)
    cursor = page.nextCursor
  }

  const descriptors = []
  for (let index = 0; index < references.length; index += 50) {
    descriptors.push(
      ...defaultOperationRegistry.read(references.slice(index, index + 50).map(({ id, version }) => ({ id, version }))),
    )
  }
  return descriptors
}

export function runArchitectureScript(importMetaUrl: string, main: () => Promise<void>) {
  if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(importMetaUrl)) {
    main().catch(error => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
  }
}
