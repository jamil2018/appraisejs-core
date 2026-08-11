import type { PrismaClient } from '@prisma/client'

import {
  builtInStepDefinitions,
  computeStepDefinitionHashes,
  canonicalStepDefinitionJson,
  stepDefinitionContentHash,
  stepPublicationReceiptSchema,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'
import { StepDefinitionRegistryError, StepDefinitionRegistryService } from './step-definition-registry-service'
import { readyStepDefinitionSearchIndexHash, type ReadyStepDefinitionRow } from './ready-step-definition-search-index'

export type BuiltInReadinessReceipt = {
  /** Source and indexed ready content, never just mutable identities. */
  manifestHash: string
  /** Current index hash for the exact built-in rows after repair. */
  readyIndexHash: string
  seeded: number
  repaired: number
  unchanged: number
  conflicting: number
}

type PersistedBuiltIn = {
  id: string
  version: string
  definitionHash: string
  humanProjectionHash: string | null
  agentContractHash: string | null
  executionHash: string | null
  publicationReceipt: { receiptJson: string } | null
}

function sourceRows(): ReadyStepDefinitionRow[] {
  return builtInStepDefinitions
    .map(definition => ({
      id: definition.identity.id,
      version: definition.identity.version,
      title: definition.intent.title,
      description: definition.intent.description ?? '',
      definitionJson: canonicalStepDefinitionJson(definition),
    }))
    .sort((left, right) => `${left.id}@${left.version}`.localeCompare(`${right.id}@${right.version}`))
}

function sourceManifestHash(readyIndexHash: string) {
  return stepDefinitionContentHash({
    readyIndexHash,
    definitions: builtInStepDefinitions
      .map(definition => ({
        id: definition.identity.id,
        version: definition.identity.version,
        definitionHash: computeStepDefinitionHashes(definition).definitionHash,
        contentHash: stepDefinitionContentHash(definition),
      }))
      .sort((left, right) => `${left.id}@${left.version}`.localeCompare(`${right.id}@${right.version}`)),
  })
}

function hasCurrentReceipt(row: PersistedBuiltIn) {
  if (!row.publicationReceipt) return false
  try {
    return stepPublicationReceiptSchema.safeParse(JSON.parse(row.publicationReceipt.receiptJson)).success
  } catch {
    return false
  }
}

function assertReadyIndexMatchesSource(rows: ReadyStepDefinitionRow[]) {
  const source = sourceRows()
  const sourceIdentities = new Set(source.map(row => `${row.id}@${row.version}`))
  const indexedBuiltIns = rows
    .filter(row => sourceIdentities.has(`${row.id}@${row.version}`))
    .sort((left, right) => `${left.id}@${left.version}`.localeCompare(`${right.id}@${right.version}`))
  const expectedIndexHash = readyStepDefinitionSearchIndexHash(source)
  const readyIndexHash = readyStepDefinitionSearchIndexHash(indexedBuiltIns)
  if (indexedBuiltIns.length !== source.length || readyIndexHash !== expectedIndexHash)
    throw new StepDefinitionRegistryError(
      'immutable_definition',
      'The ready Step Definition index does not match immutable built-in source content.',
      { expectedIndexHash, readyIndexHash, expectedCount: source.length, actualCount: indexedBuiltIns.length },
    )
  return readyIndexHash
}

/** Ensures source-owned built-ins exist without ever replacing a conflicting
 * ready definition. A partial registration is a repair; a pristine registry is
 * a seed. The final receipt binds source hashes to the ready search index. */
export async function ensureBuiltInStepDefinitionReadiness(database: PrismaClient): Promise<BuiltInReadinessReceipt> {
  const registry = new StepDefinitionRegistryService(database)
  const sourceIdentities = builtInStepDefinitions.map(definition => ({
    id: definition.identity.id,
    version: definition.identity.version,
  }))
  const existingRows = (await database.stepDefinition.findMany({
    where: { OR: sourceIdentities.map(identity => ({ ...identity, status: 'ready' })) },
    select: {
      id: true,
      version: true,
      definitionHash: true,
      humanProjectionHash: true,
      agentContractHash: true,
      executionHash: true,
      publicationReceipt: { select: { receiptJson: true } },
    },
  })) as PersistedBuiltIn[]
  const existing = new Map(existingRows.map(row => [`${row.id}@${row.version}`, row]))
  const pristine = existing.size === 0
  let seeded = 0
  let repaired = 0
  let unchanged = 0
  let conflicting = 0

  for (const definition of builtInStepDefinitions) {
    const key = `${definition.identity.id}@${definition.identity.version}`
    const prior = existing.get(key)
    try {
      await registry.registerBuiltIn(definition, `builtin:${key}`)
      if (!prior) {
        if (pristine) seeded += 1
        else repaired += 1
      } else if (hasCurrentReceipt(prior)) {
        unchanged += 1
      } else {
        repaired += 1
      }
    } catch (error) {
      if (error instanceof StepDefinitionRegistryError) {
        conflicting += 1
        continue
      }
      throw error
    }
  }

  if (conflicting)
    throw new StepDefinitionRegistryError(
      'immutable_definition',
      `${conflicting} built-in Step Definition registration(s) conflict with immutable project state.`,
      { seeded, repaired, unchanged, conflicting },
    )

  const readyRows = (await database.stepDefinition.findMany({
    where: { status: 'ready', OR: sourceIdentities },
    select: { id: true, version: true, title: true, description: true, definitionJson: true },
    orderBy: [{ id: 'asc' }, { version: 'asc' }],
  })) as ReadyStepDefinitionRow[]
  const readyIndexHash = assertReadyIndexMatchesSource(readyRows)
  return { manifestHash: sourceManifestHash(readyIndexHash), readyIndexHash, seeded, repaired, unchanged, conflicting }
}
