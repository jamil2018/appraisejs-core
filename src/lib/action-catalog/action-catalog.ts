import { createHash } from 'node:crypto'
import { z } from 'zod'

import { actionIdSchema, actionVersionSchema } from '@/lib/action-contracts'
import { canonicalContractJson } from '@/lib/catalog-contracts'

export const ACTION_CATALOG_CONTRACT_VERSION = '1' as const
export const actionCategoryIdSchema = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/)
const idSchema = actionCategoryIdSchema
const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
export const actionAssertionConcernSchema = z.enum(['accessibility', 'persistence'])
export const actionNumericUnitSchema = z.enum(['milliseconds', 'seconds'])

export const actionCategorySchema = z.object({
  id: idSchema,
  parentCategoryId: idSchema.optional(),
  title: z.string().min(1),
  description: z.string().min(1),
})

const actionInputSchema = z.object({
  name: idSchema,
  type: z.string().min(1),
  required: z.boolean(),
  description: z.string().min(1),
  constraints: z.record(z.string(), z.unknown()).optional(),
  numeric: z
    .object({
      unit: actionNumericUnitSchema,
      minimum: z.number().finite().optional(),
      maximum: z.number().finite().optional(),
    })
    .optional(),
})

export const actionDescriptorDefinitionSchema = z.object({
  id: actionIdSchema,
  version: actionVersionSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  categories: z.array(idSchema).min(1),
  inputs: z.array(actionInputSchema),
  outputs: z.array(z.object({ name: idSchema, type: z.string().min(1), description: z.string().min(1) })),
  requirements: z.object({
    runtime: z.enum(['browser', 'api', 'node', 'database']),
    capabilities: z.array(idSchema),
  }),
  examples: z.array(z.object({ description: z.string().min(1), inputs: z.record(z.string(), z.unknown()) })),
  deprecated: z.boolean(),
  replacementActionId: actionIdSchema.optional(),
  assertionConcerns: z.array(actionAssertionConcernSchema).default([]),
})

export const actionDescriptorSchema = actionDescriptorDefinitionSchema.extend({ contentHash: hashSchema })

export type ActionCategory = z.infer<typeof actionCategorySchema>
export type ActionDescriptorDefinition = z.infer<typeof actionDescriptorDefinitionSchema>
export type ActionDescriptor = z.infer<typeof actionDescriptorSchema>

export type ActionCatalogFilter = {
  categoryId?: string
  capability?: string
  inputType?: string
  runtime?: ActionDescriptor['requirements']['runtime']
  deprecated?: boolean
  idPrefix?: string
}

function contentHash(value: unknown) {
  return `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
}

function prepareCategories(input: ActionCategory[]) {
  const categories = input.map(item => actionCategorySchema.parse(item)).sort((a, b) => a.id.localeCompare(b.id))
  const categoryIds = new Set(categories.map(category => category.id))
  if (categoryIds.size !== categories.length) throw new Error('Category IDs must be unique.')
  for (const category of categories) {
    if (category.parentCategoryId && !categoryIds.has(category.parentCategoryId))
      throw new Error(`Unknown parent category "${category.parentCategoryId}" for "${category.id}".`)
    const ancestors = new Set([category.id])
    let parentId = category.parentCategoryId
    while (parentId) {
      if (ancestors.has(parentId)) throw new Error(`Category hierarchy contains a cycle at "${parentId}".`)
      ancestors.add(parentId)
      parentId = categories.find(candidate => candidate.id === parentId)?.parentCategoryId
    }
  }
  return { categories, categoryIds }
}

function prepareActions(input: ActionDescriptorDefinition[], categoryIds: Set<string>) {
  const actions = input
    .map(item => actionDescriptorDefinitionSchema.parse(item))
    .map(action => {
      const unknownCategory = action.categories.find(categoryId => !categoryIds.has(categoryId))
      if (unknownCategory) throw new Error(`Unknown category "${unknownCategory}" for action "${action.id}".`)
      if (action.deprecated && !action.replacementActionId)
        throw new Error(`Deprecated action "${action.id}" must declare replacementActionId.`)
      return action
    })
    .sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version))
  const actionRefs = new Set(actions.map(action => `${action.id}@${action.version}`))
  if (actionRefs.size !== actions.length) throw new Error('Action IDs and versions must be unique.')
  const actionIds = new Set(actions.map(action => action.id))
  const invalidReplacement = actions.find(
    action => action.replacementActionId && !actionIds.has(action.replacementActionId),
  )
  if (invalidReplacement)
    throw new Error(
      `Unknown replacement action "${invalidReplacement.replacementActionId}" for "${invalidReplacement.id}".`,
    )
  return actions
}

export function createActionCatalog(input: {
  version?: typeof ACTION_CATALOG_CONTRACT_VERSION
  categories: ActionCategory[]
  actions: ActionDescriptorDefinition[]
}) {
  const version = input.version ?? ACTION_CATALOG_CONTRACT_VERSION
  const { categories, categoryIds } = prepareCategories(input.categories)
  const actions = prepareActions(input.actions, categoryIds)
  const descriptors: ActionDescriptor[] = actions.map(action => ({ ...action, contentHash: contentHash(action) }))
  const catalogHash = contentHash({
    version,
    categories,
    actions: descriptors.map(action => actionDescriptorDefinitionSchema.parse(action)),
  })

  function matches(action: ActionDescriptor, filter: ActionCatalogFilter) {
    const predicates = [
      () => !filter.categoryId || action.categories.includes(filter.categoryId),
      () => !filter.capability || action.requirements.capabilities.includes(filter.capability),
      () => !filter.inputType || action.inputs.some(item => item.type === filter.inputType),
      () => !filter.runtime || action.requirements.runtime === filter.runtime,
      () => filter.deprecated === undefined || action.deprecated === filter.deprecated,
      () => !filter.idPrefix || action.id.startsWith(filter.idPrefix),
    ]
    return predicates.every(predicate => predicate())
  }

  function categoryIncludes(candidateId: string, ancestorId: string): boolean {
    if (candidateId === ancestorId) return true
    const candidate = categories.find(category => category.id === candidateId)
    return candidate?.parentCategoryId ? categoryIncludes(candidate.parentCategoryId, ancestorId) : false
  }

  return {
    version,
    catalogHash,
    listCategories(parentCategoryId?: string, knownCatalogHash?: string) {
      if (knownCatalogHash === catalogHash) return { status: 'unchanged' as const, catalogHash, categories: [] }
      const selected = categories.filter(category => category.parentCategoryId === parentCategoryId)
      return {
        status: 'current' as const,
        catalogHash,
        categories: selected.map(category => ({
          ...category,
          childCategoryCount: categories.filter(child => child.parentCategoryId === category.id).length,
          actionCount: descriptors.filter(action =>
            action.categories.some(actionCategoryId => categoryIncludes(actionCategoryId, category.id)),
          ).length,
          contentHash: contentHash(category),
        })),
      }
    },
    listActions(filter: ActionCatalogFilter = {}, cursor = 0, limit = 50) {
      if (!Number.isInteger(cursor) || cursor < 0) throw new Error('Cursor must be a non-negative integer.')
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Limit must be between 1 and 100.')
      const filtered = descriptors.filter(action => matches(action, filter))
      const items = filtered.slice(cursor, cursor + limit).map(action => ({
        id: action.id,
        version: action.version,
        title: action.title,
        description: action.description,
        categories: action.categories,
        runtime: action.requirements.runtime,
        capabilities: action.requirements.capabilities,
        deprecated: action.deprecated,
        replacementActionId: action.replacementActionId,
        contentHash: action.contentHash,
      }))
      return { catalogHash, items, nextCursor: cursor + items.length < filtered.length ? cursor + items.length : null }
    },
    readActions(refs: Array<{ id: string; version?: string }>) {
      return refs.map(ref => {
        const matches = descriptors.filter(
          action => action.id === ref.id && (!ref.version || action.version === ref.version),
        )
        if (!matches.length) throw new Error(`Action "${ref.id}${ref.version ? `@${ref.version}` : ''}" was not found.`)
        if (!ref.version && matches.length > 1) throw new Error(`Action "${ref.id}" requires an explicit version.`)
        return matches[0]!
      })
    },
  }
}
