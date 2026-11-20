import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  builtInStepDefinitions,
  canonicalStepDefinitionJson,
  computeStepDefinitionHashes,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'

const mocks = vi.hoisted(() => ({
  module: { findMany: vi.fn() },
  locator: { findMany: vi.fn() },
  stepDefinition: { findMany: vi.fn() },
  ownerships: vi.fn(),
}))
vi.mock('@/config/db-config', () => ({ default: mocks }))
vi.mock('@/services/project-resource/project-resource-ownership-service', () => ({
  readVisibleResourceOwnerships: mocks.ownerships,
}))
import prisma from '@/config/db-config'
import { readDiscoveryResourceLabels } from './quality-journey-discovery-resource-labels'

const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const updatedAt = new Date('2026-11-19T00:00:00Z')
const moduleRow = { id: 'module-1', name: 'Login flows', updatedAt, targetProjectId: 'project', archivedAt: null }
const locatorRow = {
  id: 'locator-1',
  name: 'Email\nfield',
  value: '#private-selector',
  updatedAt,
  targetProjectId: 'project',
  archivedAt: null,
}
const definition = builtInStepDefinitions[0]!
const stepRow = {
  id: definition.identity.id,
  version: definition.identity.version,
  status: 'ready',
  definitionHash: computeStepDefinitionHashes(definition).definitionHash,
  definitionJson: canonicalStepDefinitionJson(definition),
  provenanceJson: canonicalStepDefinitionJson(definition.provenance),
}
const resources = [
  {
    id: 'module:module-1',
    kind: 'MODULE',
    contentHash: hash({ id: moduleRow.id, name: moduleRow.name, updatedAt }),
    sourceTargetProjectId: 'project',
  },
  {
    id: 'locator:locator-1',
    kind: 'LOCATOR',
    contentHash: hash({ id: locatorRow.id, value: locatorRow.value, updatedAt, targetProjectId: 'project' }),
    sourceTargetProjectId: 'project',
  },
  {
    id: `step:${stepRow.id}:${stepRow.version}`,
    kind: 'STEP_DEFINITION',
    contentHash: stepRow.definitionHash,
    sourceTargetProjectId: null,
  },
]
const sourceSteps = new Map([
  [
    `${stepRow.id}:${stepRow.version}`,
    { definitionHash: stepRow.definitionHash, provenanceJson: stepRow.provenanceJson },
  ],
])

beforeEach(() => {
  vi.clearAllMocks()
  mocks.module.findMany.mockResolvedValue([moduleRow])
  mocks.locator.findMany.mockResolvedValue([locatorRow])
  mocks.stepDefinition.findMany.mockResolvedValue([stepRow])
  mocks.ownerships.mockResolvedValue(new Map())
})

describe('Discovery Resource Explorer labels', () => {
  it('adds only safe display text for exact scoped current resources without altering frozen descriptors', async () => {
    const before = structuredClone(resources)
    const labels = await readDiscoveryResourceLabels('project', resources, sourceSteps, prisma)
    expect(labels).toEqual(
      expect.arrayContaining([
        { resourceId: 'module:module-1', label: 'Login flows' },
        { resourceId: 'locator:locator-1', label: 'Email field' },
        { resourceId: `step:${stepRow.id}:${stepRow.version}`, label: definition.human.signature.trim().slice(0, 200) },
      ]),
    )
    expect(labels).toHaveLength(3)
    expect(JSON.stringify(labels)).not.toContain('#private-selector')
    expect(JSON.stringify(labels)).not.toContain('definitionJson')
    expect(resources).toEqual(before)
    expect(mocks.locator.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['locator-1'] }, targetProjectId: 'project', archivedAt: null } }),
    )
    expect(mocks.stepDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ id: stepRow.id, version: stepRow.version }], status: 'ready' } }),
    )
  })

  it('omits archived, cross-project, stale and unfrozen rows even if a broad adapter returns them', async () => {
    mocks.module.findMany.mockResolvedValue([
      { ...moduleRow, targetProjectId: 'foreign' },
      { ...moduleRow, id: 'unfrozen-module' },
    ])
    mocks.locator.findMany.mockResolvedValue([
      { ...locatorRow, archivedAt: updatedAt },
      { ...locatorRow, value: '#changed' },
      { ...locatorRow, targetProjectId: 'foreign' },
    ])
    expect(await readDiscoveryResourceLabels('project', resources, new Map(), prisma)).toEqual([])
  })

  it('does not expose a step label when visibility or its actual canonical definition equality is unverified', async () => {
    mocks.module.findMany.mockResolvedValue([])
    mocks.locator.findMany.mockResolvedValue([])
    mocks.ownerships.mockResolvedValue(null)
    expect(await readDiscoveryResourceLabels('project', resources, new Map(), prisma)).toEqual([])
    mocks.ownerships.mockResolvedValue(new Map([[`step-definition:${stepRow.id}`, { targetProjectId: null }]]))
    mocks.stepDefinition.findMany.mockResolvedValue([
      {
        ...stepRow,
        definitionJson: canonicalStepDefinitionJson({
          ...definition,
          human: { ...definition.human, signature: 'Changed expression' },
        }),
      },
    ])
    expect(await readDiscoveryResourceLabels('project', resources, sourceSteps, prisma)).toEqual([])
  })

  it('omits foreign frozen source labels instead of reading imported locator/module names', async () => {
    const foreign = resources.map(resource => ({ ...resource, sourceTargetProjectId: 'foreign' }))
    expect(await readDiscoveryResourceLabels('project', foreign, sourceSteps, prisma)).toEqual([])
    expect(mocks.module.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [] }, targetProjectId: 'project', archivedAt: null } }),
    )
  })
})
