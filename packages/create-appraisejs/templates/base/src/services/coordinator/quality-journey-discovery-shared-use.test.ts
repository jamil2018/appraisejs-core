import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const control = vi.hoisted(() => ({
  trace: [] as string[],
  failUse: false,
  failValidate: false,
  externalReplay: false,
  replayOutcome: null as unknown,
  duringAuth: undefined as (() => void) | undefined,
}))
vi.mock('@/config/db-config', () => ({
  default: new Proxy(
    {},
    {
      get() {
        throw new Error('DEFAULT_DATABASE_FORBIDDEN')
      },
    },
  ),
}))
vi.mock('@/lib/operation-catalog', () => ({ defaultOperationDefinitions: [] }))
vi.mock('@/lib/quality-journey', async () => {
  const contracts = await import('@/lib/quality-journey/discovery-contracts')
  return {
    hashResourceResolutionBundle: contracts.hashResourceResolutionBundle,
    hashTargetObservationBundle: contracts.hashTargetObservationBundle,
    resourceResolutionBundleSchema: contracts.resourceResolutionBundleSchema,
    targetObservationBundleSchema: contracts.targetObservationBundleSchema,
  }
})
vi.mock('../../../packages/cucumber-runtime/src/step-definitions/index.ts', async () => {
  const contracts = await import('../../../packages/cucumber-runtime/src/step-definitions/contracts')
  return { ...contracts, builtInStepDefinitions: [] }
})
vi.mock('./quality-journey-coordinator-session', () => ({
  assertCoordinatorMutationSession: vi.fn(async () => {
    control.duringAuth?.()
  }),
  assertCoordinatorAttemptSession: vi.fn(),
  assertCurrentCoordinatorSession: vi.fn(),
}))
vi.mock('./quality-journey-e2-retirement-service', () => ({
  assertE2BusinessAdmission: vi.fn(async () => {
    control.trace.push('ADMISSION')
    return { kind: 'E2_V1', admissionVersion: 1 }
  }),
  commitE2RetirementRequest: vi.fn(async () => {
    control.trace.push('FINAL_RETIREMENT')
    return { status: 'RETIRE_REQUESTED' }
  }),
}))
vi.mock('@/services/project-resource/project-resource-ownership-service', () => ({
  readVisibleResourceOwnerships: vi.fn(async () => null),
}))
vi.mock('./quality-journey-discovery-bootstrap', () => ({ registerQualityJourneyDiscoveryBootstrap: vi.fn() }))
vi.mock('./quality-journey-discovery-browser-service', () => ({
  assertDiscoveryBrowserReceiptAdmission() {
    throw new Error('UNSELECTED_BROWSER_PATH')
  },
}))
vi.mock('./quality-journey-shared-resource-use-service', async () => {
  const { withJourneySharedResourcePublicationInTransaction } = await import('./quality-journey-business-write-join')
  const { sharedSourceDigest } = await import('@/lib/quality-journey/shared-resource-contract')
  return {
    resolveResourceResolutionUseRequestInTransaction: vi.fn(async (_tx, input) => {
      control.trace.push('SELECTED_TYPED_REQUEST')
      return {
        scope: input.scope,
        source: {
          sourceKind: 'RESOURCE_RESOLUTION',
          sourceOwnerId: input.discoveryRevisionId,
          expectedSourceDigest: sharedSourceDigest({
            sourceKind: 'RESOURCE_RESOLUTION',
            sourceOwnerId: input.discoveryRevisionId,
            sourceHash: input.resourceResolutionHash,
          }),
        },
        expectedDependencyDigest: 'b'.repeat(64),
      }
    }),
    acquireSharedResourceUseInBusinessGroupInTransaction: vi.fn(async (tx, request, beforeWrite) =>
      withJourneySharedResourcePublicationInTransaction(tx, request.scope, beforeWrite, async admit => {
        await admit()
        control.trace.push('USE_PUBLICATION')
        if (control.failUse) throw new Error('EXACT_USE_FAILURE')
        return { status: 'CREATED_ACTIVE_INERT' }
      }),
    ),
    validateActiveSharedResourceUseInTransaction: vi.fn(async () => {
      control.trace.push('USE_VALIDATE')
      if (control.failValidate) throw new Error('RETAINED_USE_FAILURE')
      return { status: 'READ_ONLY_ACTIVE_RECEIPT' }
    }),
  }
})
vi.mock('./quality-journey-service', async () => {
  const { createHash } = await import('node:crypto')
  const { withJourneyBusinessWriteJoinInTransaction } = await import('./quality-journey-business-write-join')
  return {
    externalAnalyzerAdmissionProtocol: 'EXTERNAL_V1',
    externalAssignmentSecretHash: (value: string) =>
      createHash('sha256').update(`appraise.external-analyzer-assignment-secret/v1\0${value}`).digest('hex'),
    assertDiscoverySubmissionModeLineageInTransaction: vi.fn(),
    issueQualityJourneyDiscoveryWorkItemsWithBusinessJoinInTransaction() {
      throw new Error('UNSELECTED_ISSUANCE')
    },
    setQualityJourneyActiveWorkItems() {
      throw new Error('UNSELECTED_ISSUANCE')
    },
    acceptExternalQualityJourneySubmissionInTransaction: vi.fn(async (input, tx, body) => {
      if (control.externalReplay) return { replayed: true, outcome: control.replayOutcome }
      const scope = { journeyId: input.journeyId, targetProjectId: input.targetProjectId }
      const outcome = await withJourneyBusinessWriteJoinInTransaction(tx, scope, input, async (before, queue) => {
        const result = await body(before, queue)
        await before(tx, scope, {
          kind: 'EXTERNAL_ACCEPTANCE',
          terminalAttemptId: input.attemptId,
          terminalResultHash: result.discoveryRevision.resourceResolutionHash,
        })
        control.trace.push('EXTERNAL_ACCEPTANCE')
        return result
      })
      return { replayed: false, outcome }
    }),
  }
})

import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashResourceResolutionBundle, resourceResolutionBundleSchema } from '@/lib/quality-journey/discovery-contracts'
import {
  submitQualityJourneyResourceResolution,
  submitExternalQualityJourneyResourceResolution,
  revalidateQualityJourneyDiscovery,
  getQualityJourneyDiscovery,
} from './quality-journey-discovery-service'
import { assertE2BusinessAdmission, commitE2RetirementRequest } from './quality-journey-e2-retirement-service'
import {
  acquireSharedResourceUseInBusinessGroupInTransaction,
  resolveResourceResolutionUseRequestInTransaction,
  validateActiveSharedResourceUseInTransaction,
} from './quality-journey-shared-resource-use-service'
import { externalAssignmentSecretHash } from './quality-journey-service'

type Row = Record<string, unknown>
type RevisionRow = Row & {
  id: string
  cycleId: string
  analysisRevisionId: string
  analysisDecisionId: string
  resourceResolutionJson: string | null
}
type WorkItemRow = Row & { id: string; role: string; roleContractDigest: string; inputHash: string }
type AuthorizationRow = Row & { id: string }
type AttemptRow = Row & { id: string; leaseId: string }
type UpdateArgs = { data: Row }
type AttemptLookupArgs = { include?: { workItem?: unknown; authorization?: unknown; sessionBinding?: unknown } }
const json = canonicalContractJson
const hash = (value: unknown) => `sha256:${createHash('sha256').update(json(value)).digest('hex')}`
const credentials = {
  journeyId: 'journey-discovery-use',
  targetProjectId: 'target-discovery-use',
  coordinatorSessionId: 'session-discovery-use',
  coordinatorGeneration: 2,
  coordinatorPrincipalId: 'principal-discovery-use',
}
const principal = { principalId: 'principal-discovery-use', assurance: 'PROJECT_CREDENTIAL_ONLY' as const }
const secret = 'synthetic-discovery-use-assignment-secret-only'
function detached(row: Row, select?: Row): Row {
  const selected: Row = select
    ? Object.fromEntries(
        Object.keys(select).map(key => {
          if (!Object.hasOwn(row, key)) throw new Error(`MISSING_SELECTED_FIELD:${key}`)
          return [key, row[key]]
        }),
      )
    : row
  const value = structuredClone(selected)
  return new Proxy(value, {
    get(row, key) {
      if (key === 'then') return undefined
      if (typeof key === 'string' && !Object.hasOwn(row, key)) throw new Error(`UNSELECTED_FIELD:${key}`)
      return Reflect.get(row, key)
    },
  })
}
function fixture(mode: 'MANAGED' | 'EXTERNAL_V1' = 'MANAGED') {
  const selectedModule = { id: 'module-discovery-use', name: 'Selected module', updatedAt: new Date(0) }
  const locator = {
    id: 'locator-discovery-use',
    value: '#selected',
    updatedAt: new Date(0),
    targetProjectId: credentials.targetProjectId,
  }
  const group = { id: 'group-discovery-use', route: '/selected', moduleId: selectedModule.id }
  const environment = {
    id: 'environment-discovery-use',
    baseUrl: 'https://discovery.invalid',
    scopeVersion: 1,
    discoveryAuthTransitPolicyJson: null,
  }
  const resources = [
    {
      id: `locator:${locator.id}`,
      kind: 'LOCATOR',
      contentHash: hash(locator),
      sourceTargetProjectId: credentials.targetProjectId,
    },
    {
      id: `module:${selectedModule.id}`,
      kind: 'MODULE',
      contentHash: hash(selectedModule),
      sourceTargetProjectId: credentials.targetProjectId,
    },
  ]
  const resourceScope = { resources, operationIds: [] }
  const inputArtifacts = [
    {
      kind: 'ANALYSIS_CHARTER_REVISION',
      artifactId: 'analysis-artifact',
      revisionId: 'analysis-revision',
      contentHash: hash('analysis'),
    },
    { kind: 'JOURNEY_APPROVAL', artifactId: 'approval-artifact', contentHash: hash('approval') },
  ]
  const scoutScope = {
    environmentIds: [environment.id],
    environmentBindings: [
      {
        environmentId: environment.id,
        targetOrigin: 'https://discovery.invalid',
        scopeVersion: 1,
        discoveryAuthTransitPolicyJson: null,
        discoveryAuthTransitPolicyHash: hash(null),
      },
    ],
    routes: [group.route],
    locatorGroupIds: [group.id],
  }
  let revision: RevisionRow = {
    id: 'discovery-revision-use',
    journeyId: credentials.journeyId,
    targetProjectId: credentials.targetProjectId,
    cycleId: 'cycle-discovery-use',
    status: 'COLLECTING',
    resourceResolutionHash: null,
    resourceResolutionJson: null,
    resourceResolutionIdempotencyKey: null,
    targetObservationHash: null,
    resourceWorkItemId: 'resource-work-use',
    analysisRevisionId: 'analysis-row-use',
    analysisDecisionId: 'decision-row-use',
    analysisRevisionArtifactId: 'analysis-artifact',
    analysisRevisionContentHash: hash('analysis'),
    analysisApprovalArtifactId: 'approval-artifact',
    analysisApprovalContentHash: hash('approval'),
    approvedRequirementSetHash: hash({ requirementIds: ['requirement-one'] }),
    environmentRegistryHash: hash([{ ...environment, discoveryAuthTransitPolicyHash: hash(null) }]),
    locatorRegistryHash: hash([group]),
    resourceRegistryHash: hash(resources),
    stepDefinitionRegistryHash: hash([]),
    operationRegistryHash: hash([]),
    resourceScopeJson: json(resourceScope),
    scoutScopeJson: json(scoutScope),
    rowVersion: 0,
  }
  const shared = {
    journeyId: credentials.journeyId,
    targetProjectId: credentials.targetProjectId,
    cycleId: revision.cycleId,
    approvedRequirementSetHash: revision.approvedRequirementSetHash,
    environmentRegistryHash: revision.environmentRegistryHash,
    locatorRegistryHash: revision.locatorRegistryHash,
    resourceRegistryHash: revision.resourceRegistryHash,
    stepDefinitionRegistryHash: revision.stepDefinitionRegistryHash,
    operationRegistryHash: revision.operationRegistryHash,
    inputArtifacts,
  }
  revision.resourceInputHash = hash({ ...shared, role: 'RESOURCE_EXPLORER', scope: resourceScope })
  revision.scoutInputHash = hash({ ...shared, role: 'SCOUT', scope: scoutScope })
  revision.scopeHash = hash({ ...shared, scoutScope, resourceScope })
  const assignmentScopeHash = hash({ allowedResourceIds: resources.map(row => row.id) })
  const bundle = resourceResolutionBundleSchema.parse({
    schemaVersion: 'appraise.quality-journey/v1',
    journeyId: credentials.journeyId,
    targetProjectId: credentials.targetProjectId,
    cycleId: revision.cycleId,
    analysisRevision: {
      artifactId: 'analysis-artifact',
      revisionId: 'analysis-revision',
      contentHash: hash('analysis'),
    },
    analysisApproval: { artifactId: 'approval-artifact', contentHash: hash('approval') },
    workItemId: 'resource-work-use',
    attemptId: 'resource-attempt-use',
    authorizationId: 'resource-auth-use',
    inputHash: revision.resourceInputHash,
    assignmentScopeHash,
    approvedRequirementSetHash: revision.approvedRequirementSetHash,
    inputArtifacts,
    evidenceReceipts: [{ artifactId: 'analysis-artifact', contentHash: hash('analysis') }],
    bundleId: 'bundle-discovery-use',
    resolvedAt: '2026-10-26T00:00:00.000Z',
    destinationModuleId: selectedModule.id,
    approvedRequirementIds: ['requirement-one'],
    reusable: [
      {
        resourceId: `module:${selectedModule.id}`,
        resourceKind: 'MODULE',
        requirementId: 'requirement-one',
        rank: 1,
        reasonCode: 'COMPATIBLE',
        explanation: 'Selected module',
        evidenceReceiptIds: ['analysis-artifact'],
      },
    ],
    incompatible: [],
    stale: [],
    crossTarget: [],
    missing: [],
  })
  let item: WorkItemRow = {
    id: bundle.workItemId,
    journeyId: credentials.journeyId,
    targetProjectId: credentials.targetProjectId,
    cycleId: revision.cycleId,
    role: 'RESOURCE_EXPLORER',
    inputHash: bundle.inputHash,
    currentAttempt: 1,
    version: 0,
    status: 'IN_PROGRESS',
    roleContractDigest: hash('role'),
    authorizationScopeJson: json({ allowedResourceIds: resources.map(row => row.id) }),
  }
  const authorization: AuthorizationRow = {
    id: bundle.authorizationId,
    journeyId: credentials.journeyId,
    targetProjectId: credentials.targetProjectId,
    workItemId: item.id,
    role: item.role,
    roleContractDigest: item.roleContractDigest,
    revokedAt: null,
    cancelledAt: null,
    authorizationJson: '{}',
    authorizationHash: hash({}),
    externalAdmissionProtocol: mode === 'EXTERNAL_V1' ? mode : null,
    externalPrincipalId: principal.principalId,
    externalPrincipalAssurance: principal.assurance,
  }
  const assignment = {
    assignmentId: 'assignment-discovery-use',
    journeyId: credentials.journeyId,
    targetProjectId: credentials.targetProjectId,
    workItemId: item.id,
    inputHash: item.inputHash,
    lease: { leaseId: 'lease-discovery-use' },
  }
  const spawnRequest = { assignmentId: assignment.assignmentId, requestId: 'spawn-discovery-use' }
  const externalAdmission = {
    protocol: 'EXTERNAL_V1',
    assignmentId: assignment.assignmentId,
    assignmentGeneration: 1,
    attemptId: bundle.attemptId,
    workItemId: item.id,
    inputHash: item.inputHash,
    leaseId: assignment.lease.leaseId,
  }
  let attempt: AttemptRow = {
    id: bundle.attemptId,
    workItemId: item.id,
    authorizationId: authorization.id,
    attempt: 1,
    status: 'IN_PROGRESS',
    leaseId: assignment.lease.leaseId,
    leaseExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    ownerTokenHash:
      mode === 'EXTERNAL_V1' ? externalAssignmentSecretHash(secret) : createHash('sha256').update(secret).digest('hex'),
    executionMode: mode,
    assignmentId: assignment.assignmentId,
    assignmentGeneration: 1,
    assignmentJson: json(assignment),
    assignmentHash: hash(assignment),
    resultJson: null,
    resultHash: null,
    completedAt: null,
    spawnRequestId: spawnRequest.requestId,
    spawnRequestJson: json(spawnRequest),
    spawnRequestHash: hash(spawnRequest),
    spawnReceiptJson: '{}',
    spawnReceiptHash: hash({}),
    externalAdmissionId: 'external-admission-use',
    externalAdmissionJson: json(externalAdmission),
    externalAdmissionHash: hash(externalAdmission),
    externalPrincipalId: principal.principalId,
    externalPrincipalAssurance: principal.assurance,
  }
  const binding = {
    journeyId: credentials.journeyId,
    targetProjectId: credentials.targetProjectId,
    sessionId: credentials.coordinatorSessionId,
    coordinatorGeneration: 2,
    workItemId: item.id,
    authorizationId: authorization.id,
    role: item.role,
    inputHash: item.inputHash,
    leaseId: attempt.leaseId,
    assignmentId: assignment.assignmentId,
    assignmentGeneration: 1,
  }
  const journey = {
    id: credentials.journeyId,
    targetProjectId: credentials.targetProjectId,
    hostingMode: 'APP_SERVER_LOCAL_V1',
    stage: 'DISCOVERY',
    status: 'ACTIVE',
    activeDiscoveryRevisionId: revision.id,
    activeCycleId: revision.cycleId,
    activeRevisionIdsJson: json({ analysis: 'analysis-revision' }),
    currentCoordinatorSessionId: credentials.coordinatorSessionId,
  }
  const analysis = {
    id: revision.analysisRevisionId,
    artifactRevisionId: 'analysis-revision',
    artifactId: 'analysis-artifact',
    contentHash: hash('analysis'),
  }
  const tx = {
    qualityJourneyBlocker: { findMany: vi.fn(async () => []) },
    qualityJourney: {
      findFirst: vi.fn(async () => detached(journey)),
      findUniqueOrThrow: vi.fn(async () => detached(journey)),
    },
    qualityJourneyCoordinatorSession: {
      findUnique: vi.fn(async () =>
        detached({
          id: credentials.coordinatorSessionId,
          journeyId: credentials.journeyId,
          targetProjectId: credentials.targetProjectId,
          generation: 2,
          e2EnrollmentKind: 'E2_V1',
          e2EnrollmentDigest: 'a'.repeat(64),
          e2EnrolledAt: new Date(0),
        }),
      ),
    },
    qualityJourneyDiscoveryRevision: {
      findMany: vi.fn(async () => [detached(revision)]),
      findFirst: vi.fn(async () => detached(revision)),
      findUniqueOrThrow: vi.fn(async () => detached(revision)),
      updateMany: vi.fn(async ({ data }: UpdateArgs) => {
        control.trace.push('RESOLUTION_PERSISTED')
        revision = { ...revision, ...data }
        return { count: 1 }
      }),
    },
    qualityJourneyAnalysisRevision: {
      findFirst: vi.fn(async () => detached(analysis)),
      findUniqueOrThrow: vi.fn(async () => detached(analysis)),
    },
    qualityJourneyAnalysisDecision: {
      findUnique: vi.fn(async () => ({
        id: revision.analysisDecisionId,
        decision: 'APPROVED',
        artifact: { artifactId: 'approval-artifact', contentHash: hash('approval') },
      })),
    },
    environment: { findMany: vi.fn(async () => [detached(environment)]) },
    locatorGroup: { findMany: vi.fn(async () => [detached(group)]) },
    locator: { findMany: vi.fn(async () => [detached(locator)]) },
    module: { findMany: vi.fn(async () => [detached(selectedModule)]) },
    stepDefinition: { findMany: vi.fn(async () => []) },
    qualityJourneyWorkItem: {
      findUnique: vi.fn(async () => detached(item)),
      updateMany: vi.fn(async ({ data }: UpdateArgs) => {
        control.trace.push('ITEM_TERMINAL')
        item = { ...item, ...data }
        return { count: 1 }
      }),
    },
    qualityJourneyWorkAuthorization: { findUnique: vi.fn(async () => detached(authorization)) },
    qualityJourneyWorkAttempt: {
      findUnique: vi.fn(async ({ include }: AttemptLookupArgs) =>
        detached({
          ...attempt,
          ...(include?.workItem ? { workItem: copy(item) } : {}),
          ...(include?.authorization ? { authorization: copy(authorization) } : {}),
          ...(include?.sessionBinding ? { sessionBinding: copy(binding) } : {}),
        }),
      ),
      updateMany: vi.fn(async ({ data }: UpdateArgs) => {
        control.trace.push('ATTEMPT_TERMINAL')
        attempt = { ...attempt, ...data }
        return { count: 1 }
      }),
    },
  }
  function copy<T>(value: T): T {
    return structuredClone(value)
  }
  let attempts = 0
  const root = {
    $transaction: async <T>(body: (tx: unknown) => Promise<T>) => {
      attempts++
      const before = copy({ revision, attempt, item })
      try {
        return await body(tx)
      } catch (error) {
        revision = before.revision
        attempt = before.attempt
        item = before.item
        throw error
      }
    },
  }
  const request = {
    journeyId: credentials.journeyId,
    targetProjectId: credentials.targetProjectId,
    discoveryRevisionId: revision.id,
    workItemId: item.id,
    attemptId: attempt.id,
    leaseId: attempt.leaseId,
    ownerToken: secret,
    idempotencyKey: 'resolution-idempotency',
    expectedInputHash: bundle.inputHash,
    expectedScopeHash: assignmentScopeHash,
    bundle,
  }
  const managed = () => submitQualityJourneyResourceResolution(request, root as never, credentials)
  const external = () => {
    const { ownerToken: _ownerToken, ...rest } = request
    return submitExternalQualityJourneyResourceResolution(
      { ...rest, assignmentId: assignment.assignmentId, assignmentGeneration: 1, assignmentSecret: secret },
      principal,
      root as never,
      credentials,
    )
  }
  return {
    tx,
    root,
    request,
    managed,
    external,
    get revision() {
      return revision
    },
    get attempts() {
      return attempts
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  control.trace = []
  control.failUse = false
  control.failValidate = false
  control.externalReplay = false
  control.replayOutcome = null
  control.duringAuth = undefined
})

describe('actual selected Discovery resource-resolution owning join', () => {
  it('persists managed typed source then awaits joined Use before terminal publication and its separate final invalidator', async () => {
    const f = fixture()
    await f.managed()
    expect(control.trace).toEqual([
      'ADMISSION',
      'RESOLUTION_PERSISTED',
      'SELECTED_TYPED_REQUEST',
      'USE_PUBLICATION',
      'ATTEMPT_TERMINAL',
      'ITEM_TERMINAL',
      'FINAL_RETIREMENT',
    ])
    expect(assertE2BusinessAdmission).toHaveBeenCalledTimes(1)
    expect(commitE2RetirementRequest).toHaveBeenCalledTimes(1)
    expect(vi.mocked(acquireSharedResourceUseInBusinessGroupInTransaction).mock.calls[0][0]).toBe(f.tx)
  })

  it('uses the exact external owning callback and publishes acceptance before separate terminal retirement', async () => {
    const f = fixture('EXTERNAL_V1')
    await f.external()
    expect(control.trace).toEqual([
      'ADMISSION',
      'RESOLUTION_PERSISTED',
      'SELECTED_TYPED_REQUEST',
      'USE_PUBLICATION',
      'ATTEMPT_TERMINAL',
      'ITEM_TERMINAL',
      'EXTERNAL_ACCEPTANCE',
      'FINAL_RETIREMENT',
    ])
    expect(assertE2BusinessAdmission).toHaveBeenCalledTimes(1)
    expect(
      vi.mocked(resolveResourceResolutionUseRequestInTransaction).mock.calls[0][1].scope.credentials,
    ).toMatchObject(credentials)
  })

  it('validates retained managed output replay without publication admission or another terminal queue', async () => {
    const f = fixture()
    await f.managed()
    control.trace = []
    vi.clearAllMocks()
    expect((await f.managed()).replayed).toBe(true)
    expect(control.trace).toEqual(['SELECTED_TYPED_REQUEST', 'USE_VALIDATE'])
    expect(assertE2BusinessAdmission).not.toHaveBeenCalled()
    expect(commitE2RetirementRequest).not.toHaveBeenCalled()
  })

  it('validates retained external acceptance replay even when its specialized callback is skipped', async () => {
    const f = fixture('EXTERNAL_V1')
    const first = await f.external()
    control.externalReplay = true
    control.replayOutcome = first
    control.trace = []
    vi.clearAllMocks()
    expect((await f.external()).replayed).toBe(true)
    expect(control.trace).toEqual(['SELECTED_TYPED_REQUEST', 'USE_VALIDATE'])
    expect(assertE2BusinessAdmission).not.toHaveBeenCalled()
    expect(commitE2RetirementRequest).not.toHaveBeenCalled()
  })

  it('validates selected Use on revalidation while independent inventory inspection remains unclaimed', async () => {
    const f = fixture()
    await f.managed()
    control.trace = []
    vi.clearAllMocks()
    expect(
      (
        await revalidateQualityJourneyDiscovery(
          { ...credentials, expectedActiveDiscoveryRevisionId: String(f.revision.id) },
          f.root as never,
          credentials,
        )
      ).valid,
    ).toBe(true)
    expect(validateActiveSharedResourceUseInTransaction).toHaveBeenCalledTimes(1)
    control.trace = []
    vi.clearAllMocks()
    await getQualityJourneyDiscovery(credentials, f.tx as never)
    expect(validateActiveSharedResourceUseInTransaction).not.toHaveBeenCalled()
    expect(acquireSharedResourceUseInBusinessGroupInTransaction).not.toHaveBeenCalled()
  })

  it('propagates Use failure and rolls back typed publication before any terminal writer or retry', async () => {
    const f = fixture()
    control.failUse = true
    await expect(f.managed()).rejects.toThrow('EXACT_USE_FAILURE')
    expect(f.revision.resourceResolutionHash).toBeNull()
    expect(f.attempts).toBe(1)
    expect(control.trace).not.toContain('ATTEMPT_TERMINAL')
    expect(control.trace).not.toContain('FINAL_RETIREMENT')
  })

  it('refuses missing retained Use validation instead of returning authoritative replay success', async () => {
    const f = fixture()
    await f.managed()
    control.trace = []
    control.failValidate = true
    await expect(f.managed()).rejects.toThrow('RETAINED_USE_FAILURE')
    expect(control.trace).toEqual(['SELECTED_TYPED_REQUEST', 'USE_VALIDATE'])
  })

  it('snapshots parsed bundle and original coordinator credentials before asynchronous authentication', async () => {
    const f = fixture()
    const originalHash = hashResourceResolutionBundle(f.request.bundle)
    control.duringAuth = () => {
      f.request.bundle.reusable[0].explanation = 'Mutated after first await'
    }
    await f.managed()
    expect(f.revision.resourceResolutionHash).toBe(originalHash)
  })
})
