import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

// This suite exercises the real typed source reader and complete descriptor.
// Unused operation execution definitions are an explicit inert boundary.
vi.mock('@/lib/operation-catalog', () => ({ defaultOperationDefinitions: [] }))
vi.mock('../../../packages/cucumber-runtime/src/step-definitions', async () => {
  const contracts = await import('../../../packages/cucumber-runtime/src/step-definitions/contracts')
  return { computeStepReferenceHash: contracts.computeStepReferenceHash,
    stepDefinitionSchema: contracts.stepDefinitionSchema, stepInvocationSchema: contracts.stepInvocationSchema }
})

import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashResourceResolutionBundle, resourceResolutionBundleSchema } from '@/lib/quality-journey/discovery-contracts'
import { sharedSourceDigest } from '@/lib/quality-journey/shared-resource-contract'
import { acquireSharedResourceUseInTransaction, resolveResourceResolutionUseRequestInTransaction } from './quality-journey-shared-resource-use-service'

const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
type Row = Record<string, unknown>
const scope = { journeyId: 'journey-resolution-use', targetProjectId: 'target-resolution-use',
  coordinatorSessionId: 'session-resolution-use', generation: 3,
  credentials: { journeyId: 'journey-resolution-use', targetProjectId: 'target-resolution-use',
    coordinatorSessionId: 'session-resolution-use', coordinatorGeneration: 3, coordinatorPrincipalId: 'principal-resolution-use' } }

function detached(row: Row, select?: Row): Row {
  const project = (source: Row, fields?: Row): Row => fields ? Object.fromEntries(Object.entries(fields).map(([key, field]) => {
    if (!Object.hasOwn(source, key)) throw new Error(`MISSING_SELECTED_FIELD:${key}`)
    const nested = typeof field === 'object' && field !== null ? field as { select?: Row } : null
    return [key, nested?.select ? project(source[key] as Row, nested.select) : source[key]]
  })) : source
  const copy = structuredClone(project(row, select))
  return new Proxy(copy, { get(value, key) {
    if (key === 'then') return undefined
    if (typeof key === 'string' && !Object.hasOwn(value, key)) throw new Error(`UNSELECTED_FIELD:${key}`)
    return Reflect.get(value, key)
  } })
}

function fixture() {
  const inputArtifacts = [{ kind: 'ANALYSIS_CHARTER_REVISION', artifactId: 'analysis-artifact',
    revisionId: 'analysis-revision', contentHash: hash('analysis') },
  { kind: 'JOURNEY_APPROVAL', artifactId: 'approval-artifact', contentHash: hash('approval') }]
  const resources = [{ id: 'locator:locator-resolution-use', kind: 'LOCATOR', contentHash: hash('locator-inventory'),
    sourceTargetProjectId: scope.targetProjectId },
  { id: 'module:module-resolution-use', kind: 'MODULE', contentHash: hash('module-inventory'),
    sourceTargetProjectId: scope.targetProjectId },
  { id: 'module:unselected-module', kind: 'MODULE', contentHash: hash('unselected-inventory'),
    sourceTargetProjectId: scope.targetProjectId }]
  const frozen = { resources, operationIds: [] }
  const revision: Row = { id: 'discovery-resolution-use', journeyId: scope.journeyId, targetProjectId: scope.targetProjectId,
    cycleId: 'cycle-resolution-use', status: 'COLLECTING', invalidatedAt: null, supersededAt: null,
    resourceResolutionSubmittedAt: new Date(0), analysisRevisionId: 'analysis-row', analysisDecisionId: 'decision-row',
    analysisArtifactId: 'analysis-record', analysisRevisionArtifactId: 'analysis-artifact',
    analysisRevisionContentHash: hash('analysis'), analysisApprovalArtifactId: 'approval-artifact',
    analysisApprovalContentHash: hash('approval'), resourceWorkItemId: 'resource-work',
    approvedRequirementSetHash: hash({ requirementIds: ['requirement-one'] }), environmentRegistryHash: hash('environments'),
    locatorRegistryHash: hash('groups'), resourceRegistryHash: hash(resources), stepDefinitionRegistryHash: hash([]),
    operationRegistryHash: hash([]), resourceScopeJson: canonicalContractJson(frozen), scoutScopeJson: '{}' }
  const shared = { journeyId: scope.journeyId, targetProjectId: scope.targetProjectId, cycleId: revision.cycleId,
    approvedRequirementSetHash: revision.approvedRequirementSetHash, environmentRegistryHash: revision.environmentRegistryHash,
    locatorRegistryHash: revision.locatorRegistryHash, resourceRegistryHash: revision.resourceRegistryHash,
    stepDefinitionRegistryHash: revision.stepDefinitionRegistryHash, operationRegistryHash: revision.operationRegistryHash, inputArtifacts }
  revision.resourceInputHash = hash({ ...shared, role: 'RESOURCE_EXPLORER', scope: frozen })
  revision.scopeHash = hash({ ...shared, scoutScope: {}, resourceScope: frozen })
  const bundle = resourceResolutionBundleSchema.parse({ schemaVersion: 'appraise.quality-journey/v1',
    journeyId: scope.journeyId, targetProjectId: scope.targetProjectId, cycleId: revision.cycleId,
    analysisRevision: { artifactId: 'analysis-artifact', revisionId: 'analysis-revision', contentHash: hash('analysis') },
    analysisApproval: { artifactId: 'approval-artifact', contentHash: hash('approval') }, workItemId: 'resource-work',
    attemptId: 'resource-attempt', authorizationId: 'resource-authorization', inputHash: revision.resourceInputHash,
    assignmentScopeHash: hash('assignment'), approvedRequirementSetHash: revision.approvedRequirementSetHash,
    inputArtifacts, evidenceReceipts: [{ artifactId: 'evidence-one', contentHash: hash('evidence') }],
    bundleId: 'bundle-resolution-use', resolvedAt: '2026-10-26T00:00:00.000Z', destinationModuleId: 'module-resolution-use',
    approvedRequirementIds: ['requirement-one'], reusable: [
      { resourceId: 'module:module-resolution-use', resourceKind: 'MODULE', requirementId: 'requirement-one', rank: 1,
        explanation: 'Selected destination', evidenceReceiptIds: ['evidence-one'], reasonCode: 'COMPATIBLE' },
      { resourceId: 'locator:locator-resolution-use', resourceKind: 'LOCATOR', requirementId: 'requirement-one', rank: 2,
        explanation: 'Selected locator', evidenceReceiptIds: ['evidence-one'], reasonCode: 'COMPATIBLE' }],
    incompatible: [], stale: [], crossTarget: [], missing: [] })
  revision.resourceResolutionJson = canonicalContractJson(bundle)
  revision.resourceResolutionHash = hashResourceResolutionBundle(bundle)
  const rows: Record<string, Row> = {
    qualityJourney: { activeDiscoveryRevisionId: revision.id, activeCycleId: revision.cycleId },
    qualityJourneyAnalysisRevision: { id: 'analysis-row', journeyId: scope.journeyId, targetProjectId: scope.targetProjectId,
      artifactId: 'analysis-artifact', artifactRecordId: 'analysis-record', artifactRevisionId: 'analysis-revision', contentHash: hash('analysis') },
    qualityJourneyAnalysisDecision: { journeyId: scope.journeyId, analysisRevisionId: 'analysis-row', decision: 'APPROVED',
      artifact: { journeyId: scope.journeyId, targetProjectId: scope.targetProjectId, artifactId: 'approval-artifact', contentHash: hash('approval') } },
    qualityJourneyWorkItem: { journeyId: scope.journeyId, targetProjectId: scope.targetProjectId,
      cycleId: revision.cycleId, role: 'RESOURCE_EXPLORER', inputHash: revision.resourceInputHash },
    qualityJourneyWorkAttempt: { workItemId: 'resource-work', authorizationId: 'resource-authorization', leaseId: 'resource-lease', assignmentGeneration: 2 },
    qualityJourneyWorkAuthorization: { journeyId: scope.journeyId, targetProjectId: scope.targetProjectId,
      workItemId: 'resource-work', role: 'RESOURCE_EXPLORER' },
    qualityJourneyWorkAttemptSessionBinding: { journeyId: scope.journeyId, targetProjectId: scope.targetProjectId,
      sessionId: scope.coordinatorSessionId, coordinatorGeneration: 3, workItemId: 'resource-work',
      authorizationId: 'resource-authorization', role: 'RESOURCE_EXPLORER', inputHash: revision.resourceInputHash,
      leaseId: 'resource-lease', assignmentGeneration: 2 },
  }
  const modules = new Map<string, Row>([
    ['module-resolution-use', { id: 'module-resolution-use', targetProjectId: scope.targetProjectId, name: 'Selected module', parentId: 'ancestor-module', archivedAt: null }],
    ['ancestor-module', { id: 'ancestor-module', targetProjectId: scope.targetProjectId, name: 'Archived ancestor', parentId: null, archivedAt: new Date(0) }],
  ])
  const group: Row = { id: 'group-resolution-use', targetProjectId: scope.targetProjectId, name: 'Selected group', route: '/old',
    moduleId: 'module-resolution-use', archivedAt: null }
  const locator: Row = { id: 'locator-resolution-use', targetProjectId: scope.targetProjectId, name: 'Selected locator', value: '#selected',
    updatedAt: new Date(0), locatorGroupId: group.id, archivedAt: null }
  let duringRead: (() => void) | undefined
  const tx: Record<string, unknown> = {
    qualityJourneyDiscoveryRevision: { findUnique: vi.fn(async () => { duringRead?.(); return detached(revision) }) },
    targetProject: { findUnique: vi.fn(async () => ({ id: scope.targetProjectId })) },
    module: { findUnique: vi.fn(async ({ where, select }: { where: { id: string }; select: Row }) => {
      const row = modules.get(where.id); return row ? detached(row, select) : null
    }) },
    locatorGroup: { findUnique: vi.fn(async ({ select }: { select: Row }) => detached(group, select)) },
    locator: { findUnique: vi.fn(async ({ select }: { select: Row }) => detached(locator, select)) },
  }
  for (const [model, row] of Object.entries(rows)) tx[model] = { findUnique: vi.fn(async ({ select }: { select?: Row }) => detached(row, select)),
    findFirst: vi.fn(async ({ select }: { select?: Row }) => detached(row, select)) }
  const client = new Proxy(tx, { get(value, key) {
    if (!Object.hasOwn(value, key)) throw new Error(`UNEXPECTED_MODEL_OR_WRITE:${String(key)}`)
    return Reflect.get(value, key)
  } }) as unknown as Prisma.TransactionClient
  return { tx: client, revision, rows, modules, group, locator,
    input: { scope: structuredClone(scope), discoveryRevisionId: String(revision.id), resourceResolutionHash: String(revision.resourceResolutionHash) },
    mutateDuringRead: (effect: () => void) => { duringRead = effect } }
}

describe('Discovery selected RESOURCE_RESOLUTION canonical Use composition', () => {
  it('reconstructs the retained selected source and hashes full live ancestry without claiming inventory rows', async () => {
    const f = fixture()
    const request = await resolveResourceResolutionUseRequestInTransaction(f.tx, f.input)
    expect(request.source).toEqual({ sourceKind: 'RESOURCE_RESOLUTION', sourceOwnerId: f.input.discoveryRevisionId,
      expectedSourceDigest: sharedSourceDigest({ sourceKind: 'RESOURCE_RESOLUTION', sourceOwnerId: f.input.discoveryRevisionId,
        sourceHash: f.input.resourceResolutionHash }) })
    expect(request.expectedDependencyDigest).toMatch(/^[0-9a-f]{64}$/)
    expect(f.modules.has('unselected-module')).toBe(false)
  })

  it('detects full Group route and archived Module ancestor changes beyond the old locator inventory hash', async () => {
    const f = fixture()
    const first = await resolveResourceResolutionUseRequestInTransaction(f.tx, f.input)
    f.group.route = '/changed'
    const groupChanged = await resolveResourceResolutionUseRequestInTransaction(f.tx, f.input)
    expect(groupChanged.expectedDependencyDigest).not.toBe(first.expectedDependencyDigest)
    f.modules.get('ancestor-module')!.name = 'Changed ancestor'
    const ancestorChanged = await resolveResourceResolutionUseRequestInTransaction(f.tx, f.input)
    expect(ancestorChanged.expectedDependencyDigest).not.toBe(groupChanged.expectedDependencyDigest)
    expect(ancestorChanged.source).toEqual(first.source)
  })

  it('treats an expected source hash as a comparison and refuses a different retained resolution', async () => {
    const f = fixture(); f.input.resourceResolutionHash = hash('caller-claim')
    await expect(resolveResourceResolutionUseRequestInTransaction(f.tx, f.input)).rejects.toMatchObject({ details: { reason: 'SOURCE_DIGEST_STALE' } })
  })

  it('refuses a foreign retained attempt generation before deriving a usable request', async () => {
    const f = fixture(); f.rows.qualityJourneyWorkAttemptSessionBinding.coordinatorGeneration = 4
    await expect(resolveResourceResolutionUseRequestInTransaction(f.tx, f.input)).rejects.toMatchObject({ details: { reason: 'RESOURCE_RESOLUTION_GENERATION_MISMATCH' } })
  })

  it('refuses foreign live relationship endpoints and missing selected scalar fields', async () => {
    const foreign = fixture(); foreign.group.targetProjectId = 'foreign-target'
    await expect(resolveResourceResolutionUseRequestInTransaction(foreign.tx, foreign.input)).rejects.toMatchObject({ details: { reason: 'RESOURCE_MISSING_OR_FOREIGN' } })
    const missing = fixture(); delete missing.locator.updatedAt
    await expect(resolveResourceResolutionUseRequestInTransaction(missing.tx, missing.input)).rejects.toThrow('MISSING_SELECTED_FIELD:updatedAt')
  })

  it('snapshots original scope and source inputs before the first retained-source await', async () => {
    const f = fixture(); const original = structuredClone(f.input)
    f.mutateDuringRead(() => { f.input.scope.generation = 99; f.input.scope.credentials.coordinatorGeneration = 99
      f.input.discoveryRevisionId = 'different-discovery'; f.input.resourceResolutionHash = hash('changed') })
    const request = await resolveResourceResolutionUseRequestInTransaction(f.tx, f.input)
    expect(request.scope).toEqual(original.scope)
    expect(request.source.sourceOwnerId).toBe(original.discoveryRevisionId)
  })

  it('keeps the explicit expected dependency comparison at the existing acquisition boundary', async () => {
    const f = fixture(); const request = await resolveResourceResolutionUseRequestInTransaction(f.tx, f.input)
    f.locator.updatedAt = new Date(1000)
    await expect(acquireSharedResourceUseInTransaction(f.tx, request)).rejects.toMatchObject({ details: { reason: 'DEPENDENCIES_STALE' } })
  })

  it('refuses missing canonical source models rather than constructing a thin-client grant', async () => {
    const f = fixture()
    await expect(resolveResourceResolutionUseRequestInTransaction({} as never, f.input)).rejects.toThrow()
  })
})
