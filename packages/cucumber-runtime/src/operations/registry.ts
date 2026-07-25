import {
  OPERATION_CONTRACT_VERSION,
  operationContentHash,
  operationDefinitionSchema,
  type OperationDefinition,
  type OperationDescriptor,
} from './contracts.ts'

export type OperationFilter = {
  category?: string
  capability?: string
  runtime?: OperationDescriptor['runtime']
  inputType?: OperationDescriptor['inputs'][number]['type']
  surface?: 'human' | 'agent'
  deprecated?: boolean
  idPrefix?: string
}

const projectionSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

function withProjectionAliases(definition: OperationDefinition): OperationDefinition {
  const aliases = [
    ...definition.aliases,
    ...definition.humanProjections.flatMap(projection => [
      { kind: 'cucumber-signature' as const, value: projection.signature, surface: 'human' as const },
      {
        kind: 'step-definition-slug' as const,
        value: `${projectionSlug(projection.group)}/${projectionSlug(projection.title)}`,
        surface: 'human' as const,
      },
    ]),
  ]
  return {
    ...definition,
    aliases: aliases.filter(
      (alias, index) =>
        aliases.findIndex(
          candidate =>
            candidate.kind === alias.kind && candidate.value === alias.value && candidate.surface === alias.surface,
        ) === index,
    ),
  }
}

export function createOperationRegistry(definitions: OperationDefinition[]) {
  const parsed = definitions
    .map(definition => operationDefinitionSchema.parse(withProjectionAliases(definition)))
    .sort((left, right) => left.id.localeCompare(right.id) || left.version.localeCompare(right.version))
  const refs = parsed.map(definition => `${definition.id}@${definition.version}`)
  if (new Set(refs).size !== refs.length) throw new Error('Operation IDs and versions must be unique.')

  const aliases = new Map<string, string>()
  for (const definition of parsed) {
    for (const alias of definition.aliases) {
      const key = `${alias.kind}:${alias.surface}:${alias.value}`
      const owner = aliases.get(key)
      if (owner && owner !== `${definition.id}@${definition.version}`)
        throw new Error(
          `Ambiguous operation alias "${alias.value}" is claimed by ${owner} and ${definition.id}@${definition.version}.`,
        )
      aliases.set(key, `${definition.id}@${definition.version}`)
    }
  }

  const descriptors: OperationDescriptor[] = parsed.map(definition => ({
    ...definition,
    descriptorHash: operationContentHash(definition),
  }))
  const manifestHash = operationContentHash({ contractVersion: OPERATION_CONTRACT_VERSION, operations: parsed })

  const matches = (operation: OperationDescriptor, filter: OperationFilter) =>
    (!filter.category || operation.categories.includes(filter.category)) &&
    (!filter.capability || operation.capabilities.includes(filter.capability)) &&
    (!filter.runtime || operation.runtime === filter.runtime) &&
    (!filter.inputType ||
      operation.inputs.some((input: OperationDescriptor['inputs'][number]) => input.type === filter.inputType)) &&
    (!filter.surface || operation[`${filter.surface}Surface`].status === 'supported') &&
    (filter.deprecated === undefined || operation.deprecated === filter.deprecated) &&
    (!filter.idPrefix || operation.id.startsWith(filter.idPrefix))

  return {
    contractVersion: OPERATION_CONTRACT_VERSION,
    manifestHash,
    list(filter: OperationFilter = {}, cursor = 0, limit = 50, knownManifestHash?: string) {
      if (!Number.isInteger(cursor) || cursor < 0) throw new Error('Cursor must be a non-negative integer.')
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Limit must be between 1 and 100.')
      if (knownManifestHash === manifestHash)
        return { status: 'unchanged' as const, manifestHash, items: [], nextCursor: null }
      const selected = descriptors.filter(operation => matches(operation, filter))
      const items = selected.slice(cursor, cursor + limit).map(operation => ({
        id: operation.id,
        version: operation.version,
        title: operation.title,
        description: operation.description,
        categories: operation.categories,
        capabilities: operation.capabilities,
        runtime: operation.runtime,
        deprecated: operation.deprecated,
        descriptorHash: operation.descriptorHash,
        humanSurface: operation.humanSurface.status,
        agentSurface: operation.agentSurface.status,
      }))
      return {
        status: 'current' as const,
        manifestHash,
        items,
        nextCursor: cursor + items.length < selected.length ? cursor + items.length : null,
      }
    },
    read(refsToRead: Array<{ id: string; version?: string }>) {
      if (refsToRead.length < 1 || refsToRead.length > 50) throw new Error('Read between 1 and 50 operations.')
      return refsToRead.map(ref => {
        const found = descriptors.filter(item => item.id === ref.id && (!ref.version || item.version === ref.version))
        if (found.length === 0)
          throw new Error(`Operation "${ref.id}${ref.version ? `@${ref.version}` : ''}" was not found.`)
        if (!ref.version && found.length > 1) throw new Error(`Operation "${ref.id}" requires an explicit version.`)
        return found[0]!
      })
    },
    resolveAlias(kind: OperationDefinition['aliases'][number]['kind'], value: string, surface: 'human' | 'agent') {
      const candidates = [`${kind}:${surface}:${value}`, `${kind}:both:${value}`]
        .map(key => aliases.get(key))
        .filter((item): item is string => Boolean(item))
      const unique = [...new Set(candidates)]
      if (unique.length > 1) throw new Error(`Alias "${value}" resolves ambiguously for ${surface} authoring.`)
      if (unique.length === 0) return null
      const [id, version] = unique[0]!.split('@')
      return descriptors.find(item => item.id === id && item.version === version) ?? null
    },
  }
}
