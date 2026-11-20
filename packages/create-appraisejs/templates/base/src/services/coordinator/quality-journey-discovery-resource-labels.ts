import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { readVisibleResourceOwnerships } from '@/services/project-resource/project-resource-ownership-service'
import {
  computeStepDefinitionHashes,
  stepDefinitionSchema,
} from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'

type Resource = { id: string; kind: string; contentHash: string; sourceTargetProjectId: string | null }
type TrustedStep = { definitionHash: string; provenanceJson: string }
export type DiscoveryResourceLabel = { resourceId: string; label: string }
const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const displayTextControls = new RegExp('[\\p{C}\\p{Zl}\\p{Zp}]', 'gu')
const displayName = (value: string) => value.replace(displayTextControls, ' ').trim().slice(0, 200)

/** Supplemental display text only; frozen IDs, hashes and scope remain authoritative. */
export async function readDiscoveryResourceLabels(
  targetProjectId: string,
  resources: readonly Resource[],
  sourceOwnedSteps: ReadonlyMap<string, TrustedStep>,
  tx: Prisma.TransactionClient,
): Promise<DiscoveryResourceLabel[]> {
  const frozen = new Map(resources.map(resource => [resource.id, resource]))
  const ownIds = (kind: string, prefix: string) =>
    resources
      .filter(
        resource =>
          resource.kind === kind &&
          resource.sourceTargetProjectId === targetProjectId &&
          resource.id.startsWith(prefix),
      )
      .map(resource => resource.id.slice(prefix.length))
  const stepIds = resources
    .filter(resource => resource.kind === 'STEP_DEFINITION' && resource.id.startsWith('step:'))
    .flatMap(resource => {
      const boundary = resource.id.lastIndexOf(':')
      return boundary > 5 ? [{ id: resource.id.slice(5, boundary), version: resource.id.slice(boundary + 1) }] : []
    })
  const [modules, locators, steps, ownerships] = await Promise.all([
    tx.module.findMany({
      where: { id: { in: ownIds('MODULE', 'module:') }, targetProjectId, archivedAt: null },
      select: { id: true, name: true, updatedAt: true, targetProjectId: true, archivedAt: true },
    }),
    tx.locator.findMany({
      where: { id: { in: ownIds('LOCATOR', 'locator:') }, targetProjectId, archivedAt: null },
      select: { id: true, name: true, value: true, updatedAt: true, targetProjectId: true, archivedAt: true },
    }),
    stepIds.length
      ? tx.stepDefinition.findMany({
          where: { OR: stepIds, status: 'ready' },
          select: {
            id: true,
            version: true,
            status: true,
            definitionHash: true,
            definitionJson: true,
            provenanceJson: true,
          },
        })
      : [],
    stepIds.length ? readVisibleResourceOwnerships(targetProjectId, ['step-definition'], tx) : null,
  ])
  const labels: DiscoveryResourceLabel[] = []
  const add = (resourceId: string, value: string) => {
    const label = displayName(value)
    if (label) labels.push({ resourceId, label })
  }
  for (const row of modules) {
    const resourceId = `module:${row.id}`,
      resource = frozen.get(resourceId)
    if (
      resource?.kind === 'MODULE' &&
      resource.sourceTargetProjectId === targetProjectId &&
      row.targetProjectId === targetProjectId &&
      row.archivedAt === null &&
      resource.contentHash === hash({ id: row.id, name: row.name, updatedAt: row.updatedAt })
    )
      add(resourceId, row.name)
  }
  for (const row of locators) {
    const resourceId = `locator:${row.id}`,
      resource = frozen.get(resourceId)
    if (
      resource?.kind === 'LOCATOR' &&
      resource.sourceTargetProjectId === targetProjectId &&
      row.targetProjectId === targetProjectId &&
      row.archivedAt === null &&
      resource.contentHash ===
        hash({ id: row.id, value: row.value, updatedAt: row.updatedAt, targetProjectId: row.targetProjectId })
    )
      add(resourceId, row.name)
  }
  for (const row of steps) {
    const resourceId = `step:${row.id}:${row.version}`,
      resource = frozen.get(resourceId)
    const owner = ownerships?.get(`step-definition:${row.id}`)
    const source = sourceOwnedSteps.get(`${row.id}:${row.version}`)
    const sourceVerified = Boolean(
      source && source.definitionHash === row.definitionHash && source.provenanceJson === row.provenanceJson,
    )
    if (
      resource?.kind !== 'STEP_DEFINITION' ||
      row.status !== 'ready' ||
      resource.contentHash !== row.definitionHash ||
      resource.sourceTargetProjectId !== (owner?.targetProjectId ?? null) ||
      (!owner && !sourceVerified)
    )
      continue
    try {
      const definition = stepDefinitionSchema.parse(JSON.parse(row.definitionJson))
      if (
        definition.identity.id === row.id &&
        definition.identity.version === row.version &&
        computeStepDefinitionHashes(definition).definitionHash === resource.contentHash
      )
        add(resourceId, definition.human.signature)
    } catch {
      // Invalid definitions remain unlabeled; display metadata never repairs or expands frozen authority.
    }
  }
  return labels.sort((left, right) => left.resourceId.localeCompare(right.resourceId))
}
