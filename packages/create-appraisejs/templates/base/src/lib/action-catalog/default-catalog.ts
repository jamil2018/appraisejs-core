import { defaultOperationRegistry } from '@/lib/operation-catalog/default-operation-registry'
import { projectOperationAsAction } from '@/lib/operation-catalog/action-projection'

import { createActionCatalog, type ActionCategory, type ActionDescriptorDefinition } from './action-catalog'

function readAllOperations() {
  const summaries = []
  let cursor: number | null = 0
  while (cursor != null) {
    const page = defaultOperationRegistry.list({ surface: 'agent' }, cursor, 100)
    summaries.push(...page.items)
    cursor = page.nextCursor
  }
  const definitions = []
  for (let index = 0; index < summaries.length; index += 50) {
    definitions.push(
      ...defaultOperationRegistry.read(summaries.slice(index, index + 50).map(({ id, version }) => ({ id, version }))),
    )
  }
  return definitions
}

const operations = readAllOperations()
const categoryIds = new Set<string>(['browser'])
for (const operation of operations) {
  for (const category of operation.categories) {
    const parts = category.split('.')
    for (let index = 1; index <= parts.length; index += 1) categoryIds.add(parts.slice(0, index).join('.'))
  }
}

const categories: ActionCategory[] = [...categoryIds].sort().map(id => ({
  id,
  ...(id.includes('.') ? { parentCategoryId: id.slice(0, id.lastIndexOf('.')) } : {}),
  title: id
    .slice(id.lastIndexOf('.') + 1)
    .split('-')
    .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' '),
  description: `Compatibility projection for canonical ${id} operations.`,
}))

const actions: ActionDescriptorDefinition[] = operations.map(projectOperationAsAction)

/** @deprecated Use defaultOperationRegistry. This is a bounded compatibility projection only. */
export const defaultActionCatalog = createActionCatalog({ categories, actions })
