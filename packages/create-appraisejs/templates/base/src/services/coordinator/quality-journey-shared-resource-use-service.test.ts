import { createHash } from 'node:crypto'
import type {
  Prisma,
  QualityJourneyLocatorEnsureReceipt,
  QualityJourneySharedResourceClaim,
  QualityJourneySharedResourceUse,
} from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { canonicalContractJson } from '@/lib/catalog-contracts'
import { defaultOperationDefinitions } from '@/lib/operation-catalog'
import {
  automationScenarioMaterializationSchema,
  hashAutomationMaterialization,
  hashAutomationTargetBinding,
} from '@/lib/quality-journey/automation-contracts'
import { hashQualityJourneyExecutionValue } from '@/lib/quality-journey/execution-contracts'
import { classifyJourneyExecutionEffects } from '@/lib/quality-journey/execution-effects'
import { M06_MATERIALIZATION_ARTIFACT_VERSION } from '@/lib/quality-journey/materialization-source-contract'
import { sharedSourceDigest } from '@/lib/quality-journey/shared-resource-contract'
import {
  builtInStepDefinitions,
  computeStepDefinitionHashes,
  computeStepReferenceHash,
  stepInvocationSchema,
} from '../../../packages/cucumber-runtime/src/step-definitions'
import { assertCurrentCoordinatorSession } from './quality-journey-coordinator-session'
import { assertE2BusinessAdmission } from './quality-journey-e2-retirement-service'
import {
  resolveSharedResourceDescriptors,
  type SharedResourceDescriptorResult,
} from './quality-journey-shared-resource-descriptor-service'
import {
  acquireSharedResourceUseInTransaction,
  assertExactActiveSharedResourceUse,
  assertExactSharedResourceClaims,
  buildSharedResourceClaimPlan,
  createLocatorEnsureReceiptAndAcquireUseInTransaction,
  refuseUnqualifiedSharedResourceUseRelease,
  sharedLocatorEnsureReceiptId,
  sharedLocatorEnsureSourceDigest,
  type SharedResourceUseIdentity,
} from './quality-journey-shared-resource-use-service'

vi.mock('./quality-journey-coordinator-session', () => ({ assertCurrentCoordinatorSession: vi.fn() }))
vi.mock('./quality-journey-e2-retirement-service', () => ({ assertE2BusinessAdmission: vi.fn() }))
vi.mock('./quality-journey-shared-resource-descriptor-service', () => ({ resolveSharedResourceDescriptors: vi.fn() }))

const identity: SharedResourceUseIdentity = {
  journeyId: 'journey-synthetic-use',
  targetProjectId: 'target-synthetic-use',
  coordinatorSessionId: 'session-synthetic-use',
  generation: 1,
  sourceKind: 'ENSURE',
  sourceOwnerId: 'e'.repeat(64),
  sourceDigest: 'a'.repeat(64),
}
const descriptor: SharedResourceDescriptorResult = {
  protocol: 'M06_SHARED_DESCRIPTOR_V1',
  dependencyDigest: 'b'.repeat(64),
  resources: [
    { kind: 'MODULE', resourceId: 'module-synthetic-use', dependencyDigest: 'c'.repeat(64) },
    { kind: 'LOCATOR', resourceId: 'locator-synthetic-use', dependencyDigest: 'd'.repeat(64) },
  ],
  keys: [
    { kind: 'MODULE', resourceId: 'module-synthetic-use' },
    { kind: 'LOCATOR', resourceId: 'locator-synthetic-use' },
  ],
}

function exactRows() {
  const plan = buildSharedResourceClaimPlan(identity, descriptor)
  const use: QualityJourneySharedResourceUse = {
    id: plan.id,
    journeyId: plan.journeyId,
    targetProjectId: plan.targetProjectId,
    coordinatorSessionId: plan.coordinatorSessionId,
    generation: plan.generation,
    sourceKind: plan.sourceKind,
    sourceOwnerId: plan.sourceOwnerId,
    sourceDigest: plan.sourceDigest,
    dependencyDigest: plan.dependencyDigest,
    claimSetDigest: plan.claimSetDigest,
    claimSetCount: plan.claimSetCount,
    state: 'ACTIVE',
    version: 1,
    createdAt: new Date(0),
    releasedAt: null,
    releaseEvidenceDigest: null,
    releaseReason: null,
  }
  const claims: QualityJourneySharedResourceClaim[] = plan.claims.map(claim => ({
    ...claim,
    state: 'ACTIVE',
    claimEpoch: 1,
    releaseEpoch: null,
    createdAt: new Date(0),
    releasedAt: null,
    releaseEvidenceDigest: null,
    releaseReason: null,
  }))
  return { plan, use, claims }
}

describe('shared resource Use inert metadata validation', () => {
  it('recomputes exact ENSURE receipt identity and hashes every immutable provenance/result scalar', () => {
    const input = {
      journeyId: identity.journeyId,
      targetProjectId: identity.targetProjectId,
      coordinatorSessionId: identity.coordinatorSessionId,
      generation: 1,
      requestHash: 'f'.repeat(64),
    }
    const expected = createHash('sha256')
      .update('M06_LOCATOR_ENSURE_RECEIPT_V1\n')
      .update(
        `{"coordinatorSessionId":"${input.coordinatorSessionId}","generation":1,"journeyId":"${input.journeyId}",` +
          `"requestHash":"${input.requestHash}","targetProjectId":"${input.targetProjectId}"}`,
      )
      .digest('hex')
    expect(sharedLocatorEnsureReceiptId(input)).toBe(expected)
    const receipt: QualityJourneyLocatorEnsureReceipt = {
      ...input,
      id: expected,
      resultHash: 'a'.repeat(64),
      moduleId: 'module-synthetic-use',
      locatorGroupId: 'group-synthetic-use',
      locatorId: 'locator-synthetic-use',
      createdAt: new Date(0),
    }
    const original = sharedLocatorEnsureSourceDigest(receipt)
    expect(sharedLocatorEnsureSourceDigest({ ...receipt, resultHash: 'b'.repeat(64) })).not.toBe(original)
    expect(sharedLocatorEnsureSourceDigest({ ...receipt, createdAt: new Date(1) })).not.toBe(original)
    expect(() => sharedLocatorEnsureSourceDigest({ ...receipt, generation: 2 })).toThrow()
    expect(() =>
      sharedLocatorEnsureSourceDigest({ ...receipt, coordinatorSessionId: null, generation: null }),
    ).toThrow()
  })

  it('binds the original source identity and keeps generation outside the deterministic Use ID', () => {
    const plan = buildSharedResourceClaimPlan(identity, descriptor)
    const expected = createHash('sha256')
      .update('M06_SHARED_USE_V1\n')
      .update(
        `{"journeyId":"${identity.journeyId}","sourceDigest":"${identity.sourceDigest}",` +
          `"sourceKind":"ENSURE","sourceOwnerId":"${identity.sourceOwnerId}","targetProjectId":"${identity.targetProjectId}"}`,
      )
      .digest('hex')
    expect(plan.id).toBe(expected)
    const successor = buildSharedResourceClaimPlan(
      { ...identity, generation: 2, coordinatorSessionId: 'session-successor' },
      descriptor,
    )
    expect(successor.id).toBe(plan.id)
    const { use, claims } = exactRows()
    expect(() => assertExactActiveSharedResourceUse(successor, use, claims)).toThrow()
    expect(buildSharedResourceClaimPlan({ ...identity, sourceDigest: 'f'.repeat(64) }, descriptor).id).not.toBe(plan.id)
  })

  it('canonicalizes complete claim identities and refuses mismatched descriptor key sets', () => {
    const plan = buildSharedResourceClaimPlan(identity, descriptor)
    const reversed = buildSharedResourceClaimPlan(identity, {
      ...descriptor,
      resources: [...descriptor.resources].reverse(),
      keys: [...descriptor.keys].reverse(),
    })
    expect(reversed).toEqual(plan)
    expect(plan.claims.map(claim => claim.kind)).toEqual(['LOCATOR', 'MODULE'])
    expect(() => buildSharedResourceClaimPlan(identity, { ...descriptor, keys: descriptor.keys.slice(0, 1) })).toThrow()
    expect(() =>
      buildSharedResourceClaimPlan(identity, {
        ...descriptor,
        resources: [descriptor.resources[0]!, descriptor.resources[0]!],
        keys: [descriptor.keys[0]!, descriptor.keys[0]!],
      }),
    ).toThrow()
    expect(Object.isFrozen(plan)).toBe(true)
    expect(Object.isFrozen(plan.claims)).toBe(true)
  })

  it('accepts only the exact complete ACTIVE claim set, independent of read order', () => {
    const { plan, use, claims } = exactRows()
    expect(() => assertExactActiveSharedResourceUse(plan, use, [...claims].reverse())).not.toThrow()
    expect(() => assertExactSharedResourceClaims(plan, claims.slice(0, 1))).toThrow()
    expect(() => assertExactSharedResourceClaims(plan, [...claims, claims[0]!])).toThrow()
    expect(() => assertExactSharedResourceClaims(plan, [claims[0]!, claims[0]!])).toThrow()
    expect(() =>
      assertExactSharedResourceClaims(
        plan,
        claims.map((claim, index) => (index ? claim : { ...claim, journeyId: 'journey-foreign' })),
      ),
    ).toThrow()
    expect(() =>
      assertExactSharedResourceClaims(
        plan,
        claims.map((claim, index) => (index ? claim : { ...claim, dependencyDigest: 'f'.repeat(64) })),
      ),
    ).toThrow()
  })

  it('refuses partial release, inconsistent parent state, replay under a new generation and overflow', () => {
    const { plan, use, claims } = exactRows()
    expect(() => assertExactActiveSharedResourceUse(plan, { ...use, state: 'PREPARING' }, claims)).toThrow()
    expect(() =>
      assertExactActiveSharedResourceUse(
        plan,
        {
          ...use,
          state: 'RELEASED',
          releasedAt: new Date(1),
          releaseEvidenceDigest: 'f'.repeat(64),
          releaseReason: 'SYNTHETIC_ONLY',
        },
        claims,
      ),
    ).toThrow()
    expect(() =>
      assertExactActiveSharedResourceUse(
        plan,
        use,
        claims.map((claim, index) =>
          index
            ? claim
            : {
                ...claim,
                state: 'RELEASED',
                releaseEpoch: 2,
                releasedAt: new Date(1),
                releaseEvidenceDigest: 'f'.repeat(64),
                releaseReason: 'SYNTHETIC_ONLY',
              },
        ),
      ),
    ).toThrow()
    expect(() => assertExactActiveSharedResourceUse(plan, { ...use, version: 2_147_483_647 }, claims)).toThrow()
    expect(() =>
      assertExactSharedResourceClaims(
        plan,
        claims.map(claim => ({ ...claim, claimEpoch: -1 })),
      ),
    ).toThrow()
  })

  it('retains only declared metadata and never turns a release request into authority', () => {
    const supplied = { ...identity, unreviewedAuthority: true, rawBody: 'synthetic unpersisted bytes' }
    const plan = buildSharedResourceClaimPlan(supplied, descriptor)
    expect('unreviewedAuthority' in plan).toBe(false)
    expect('rawBody' in plan).toBe(false)
    expect(refuseUnqualifiedSharedResourceUseRelease()).toEqual({
      status: 'REFUSED_UNQUALIFIED_RELEASE',
      reason: 'AUTHENTICATED_TYPED_SOURCE_AND_DESCENDANT_PROOF_UNAVAILABLE',
    })
  })
})

const scope = {
  journeyId: identity.journeyId,
  targetProjectId: identity.targetProjectId,
  coordinatorSessionId: identity.coordinatorSessionId,
  generation: identity.generation,
  credentials: {
    journeyId: identity.journeyId,
    targetProjectId: identity.targetProjectId,
    coordinatorSessionId: identity.coordinatorSessionId,
    coordinatorGeneration: identity.generation,
    coordinatorPrincipalId: 'principal-synthetic-use',
  },
}
const ensureInput = {
  scope,
  requestHash: 'f'.repeat(64),
  resultHash: 'a'.repeat(64),
  moduleId: 'module-synthetic-use',
  locatorGroupId: 'group-synthetic-use',
  locatorId: 'locator-synthetic-use',
  createdAt: new Date(0),
  expectedDependencyDigest: descriptor.dependencyDigest,
}
const ensureDescriptor: SharedResourceDescriptorResult = {
  ...descriptor,
  resources: [
    ...descriptor.resources,
    { kind: 'LOCATOR_GROUP', resourceId: 'group-synthetic-use', dependencyDigest: 'f'.repeat(64) },
  ],
  keys: [...descriptor.keys, { kind: 'LOCATOR_GROUP', resourceId: 'group-synthetic-use' }],
}

/** Pure in-memory transaction double: no Prisma client instance, DB, process or provider. */
function fakeEnsureTransaction(options: { orphan?: boolean; failReceiptInsert?: boolean } = {}) {
  const writes: string[] = []
  let ensureReceipt: QualityJourneyLocatorEnsureReceipt | null = options.orphan
    ? {
        id: sharedLocatorEnsureReceiptId({ ...scope, requestHash: ensureInput.requestHash }),
        journeyId: scope.journeyId,
        targetProjectId: scope.targetProjectId,
        coordinatorSessionId: scope.coordinatorSessionId,
        generation: scope.generation,
        requestHash: ensureInput.requestHash,
        resultHash: ensureInput.resultHash,
        moduleId: ensureInput.moduleId,
        locatorGroupId: ensureInput.locatorGroupId,
        locatorId: ensureInput.locatorId,
        createdAt: new Date(0),
      }
    : null
  let use: QualityJourneySharedResourceUse | null = null
  const claims: QualityJourneySharedResourceClaim[] = []
  const coverageEpochs = new Map<string, number>()
  const guardEpochs = new Map<string, number>()
  const tx = {
    qualityJourneyLocatorEnsureReceipt: {
      findUnique: vi.fn(async () => ensureReceipt),
      create: vi.fn(async ({ data }: { data: QualityJourneyLocatorEnsureReceipt }) => {
        if (options.failReceiptInsert) throw new Error('SYNTHETIC_RECEIPT_INSERT_REFUSAL')
        writes.push('RECEIPT_INSERT')
        ensureReceipt = { ...data }
        return ensureReceipt
      }),
    },
    qualityJourneySharedResourceUse: {
      findFirst: vi.fn(async ({ where }: { where: { state?: string; sourceKind?: string } }) =>
        use && (where.state ? use.state === where.state : where.sourceKind === use.sourceKind) ? use : null,
      ),
      findMany: vi.fn(async () => (use ? [use] : [])),
      findUnique: vi.fn(async () => use),
      create: vi.fn(async ({ data }: { data: QualityJourneySharedResourceUse }) => {
        writes.push('USE_PREPARING')
        use = { ...data, createdAt: new Date(0), releasedAt: null, releaseEvidenceDigest: null, releaseReason: null }
        return use
      }),
      updateMany: vi.fn(async ({ data }: { data: Pick<QualityJourneySharedResourceUse, 'state' | 'version'> }) => {
        if (!use) return { count: 0 }
        writes.push('USE_ACTIVE')
        use = { ...use, ...data }
        return { count: 1 }
      }),
    },
    qualityJourneySharedResourceClaim: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => [...claims]),
      create: vi.fn(async ({ data }: { data: QualityJourneySharedResourceClaim }) => {
        writes.push('CLAIM_ACTIVE')
        const claim = {
          ...data,
          createdAt: new Date(0),
          releaseEpoch: null,
          releasedAt: null,
          releaseEvidenceDigest: null,
          releaseReason: null,
        }
        claims.push(claim)
        return claim
      }),
    },
    qualityJourneySharedResourceCoverage: {
      findUnique: vi.fn(async ({ where }: { where: { targetProjectId_kind_protocolVersion: { kind: string } } }) => ({
        targetProjectId: scope.targetProjectId,
        kind: where.targetProjectId_kind_protocolVersion.kind,
        protocolVersion: 1,
        epoch: coverageEpochs.get(where.targetProjectId_kind_protocolVersion.kind) ?? 0,
        state: 'COMPLETE',
        writerClosureDigest: 'a'.repeat(64),
        readerClosureDigest: 'b'.repeat(64),
        sourceUniverseDigest: 'c'.repeat(64),
        reconciliationDigest: 'd'.repeat(64),
        proofKind: 'RECONCILED_V1',
        completedAt: new Date(0),
        createdAt: new Date(0),
      })),
      updateMany: vi.fn(async ({ where, data }: { where: { kind: string }; data: { epoch: number } }) => {
        writes.push(`COVERAGE_${where.kind}`)
        coverageEpochs.set(where.kind, data.epoch)
        return { count: 1 }
      }),
    },
    qualityJourneySharedResourceGuard: {
      findUnique: vi.fn(
        async ({ where }: { where: { targetProjectId_kind_resourceId: { kind: string; resourceId: string } } }) => ({
          ...where.targetProjectId_kind_resourceId,
          targetProjectId: scope.targetProjectId,
          epoch: guardEpochs.get(where.targetProjectId_kind_resourceId.resourceId) ?? 0,
          coverageState: 'COMPLETE_V1',
          coverageDigest: 'e'.repeat(64),
          resourceState: 'LIVE',
          deletedAt: null,
          createdAt: new Date(0),
        }),
      ),
      updateMany: vi.fn(async ({ where, data }: { where: { resourceId: string }; data: { epoch: number } }) => {
        writes.push('GUARD_CAS')
        guardEpochs.set(where.resourceId, data.epoch)
        return { count: 1 }
      }),
    },
    locatorGroup: {
      findUnique: vi.fn(async () => ({
        id: ensureInput.locatorGroupId,
        moduleId: ensureInput.moduleId,
        targetProjectId: scope.targetProjectId,
      })),
    },
    locator: {
      findUnique: vi.fn(async () => ({
        id: ensureInput.locatorId,
        locatorGroupId: ensureInput.locatorGroupId,
        targetProjectId: scope.targetProjectId,
      })),
    },
  }
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    models: tx,
    writes,
    request: () => {
      if (!ensureReceipt) throw new Error('Synthetic receipt is not prepared')
      return {
        scope,
        source: {
          sourceKind: 'ENSURE' as const,
          sourceOwnerId: ensureReceipt.id,
          expectedSourceDigest: sharedLocatorEnsureSourceDigest(ensureReceipt),
        },
        expectedDependencyDigest: descriptor.dependencyDigest,
      }
    },
  }
}

describe('shared resource Use original ENSURE insertion boundary with pure doubles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(assertE2BusinessAdmission).mockResolvedValue({ kind: 'E2_V1', admissionVersion: 1 })
    vi.mocked(assertCurrentCoordinatorSession).mockResolvedValue(
      {} as Awaited<ReturnType<typeof assertCurrentCoordinatorSession>>,
    )
    vi.mocked(resolveSharedResourceDescriptors).mockResolvedValue(ensureDescriptor)
  })

  it('never prepares or activates a Use when receipt insertion fails', async () => {
    const fixture = fakeEnsureTransaction({ failReceiptInsert: true })
    await expect(createLocatorEnsureReceiptAndAcquireUseInTransaction(fixture.tx, ensureInput)).rejects.toThrow(
      'SYNTHETIC_RECEIPT_INSERT_REFUSAL',
    )
    expect(fixture.models.qualityJourneySharedResourceUse.create).not.toHaveBeenCalled()
    expect(fixture.models.qualityJourneySharedResourceClaim.create).not.toHaveBeenCalled()
    expect(fixture.models.qualityJourneySharedResourceUse.updateMany).not.toHaveBeenCalled()
  })

  it('refuses a committed orphan receipt without minting freshness or performing writes', async () => {
    const fixture = fakeEnsureTransaction({ orphan: true })
    await expect(acquireSharedResourceUseInTransaction(fixture.tx, fixture.request())).rejects.toMatchObject({
      details: { reason: 'ENSURE_ORPHAN_ADOPTION_REFUSED' },
    })
    expect(fixture.writes).toEqual([])
    expect(assertE2BusinessAdmission).not.toHaveBeenCalled()
  })

  it('creates the complete set in order and identical ACTIVE replay remains read-only', async () => {
    const fixture = fakeEnsureTransaction()
    const created = await createLocatorEnsureReceiptAndAcquireUseInTransaction(fixture.tx, ensureInput)
    expect(created.status).toBe('CREATED_ACTIVE_INERT')
    expect(fixture.writes.filter(write => write.startsWith('COVERAGE_'))).toEqual([
      'COVERAGE_LOCATOR',
      'COVERAGE_LOCATOR_GROUP',
      'COVERAGE_MODULE',
      'COVERAGE_TEST_CASE',
      'COVERAGE_TEST_SUITE',
    ])
    expect(fixture.writes.indexOf('USE_PREPARING')).toBeLessThan(fixture.writes.indexOf('CLAIM_ACTIVE'))
    expect(fixture.writes.at(-1)).toBe('USE_ACTIVE')
    expect(fixture.models.qualityJourneySharedResourceClaim.create).toHaveBeenCalledTimes(3)
    const writesBeforeReplay = [...fixture.writes]
    const replay = await acquireSharedResourceUseInTransaction(fixture.tx, fixture.request())
    expect(replay).toEqual({ ...created, status: 'READ_ONLY_ACTIVE_RECEIPT' })
    expect(fixture.writes).toEqual(writesBeforeReplay)
    expect(assertE2BusinessAdmission).toHaveBeenCalledTimes(1)
  })

  it('cannot use a copied inert receipt to freshen a different transaction', async () => {
    const original = fakeEnsureTransaction()
    const inert = await createLocatorEnsureReceiptAndAcquireUseInTransaction(original.tx, ensureInput)
    const foreign = fakeEnsureTransaction({ orphan: true })
    const attemptedExtraArgument = acquireSharedResourceUseInTransaction as (
      tx: Prisma.TransactionClient,
      request: ReturnType<typeof foreign.request>,
      copied: unknown,
    ) => ReturnType<typeof acquireSharedResourceUseInTransaction>
    await expect(attemptedExtraArgument(foreign.tx, foreign.request(), inert)).rejects.toMatchObject({
      details: { reason: 'ENSURE_ORPHAN_ADOPTION_REFUSED' },
    })
    expect(foreign.writes).toEqual([])
  })
})

const H = (character: string) => `sha256:${character.repeat(64)}`
function fakeMaterializationTransaction(options: { runtimeLocator?: boolean; execution?: boolean } = {}) {
  const base = fakeEnsureTransaction()
  const definition = options.execution
    ? builtInStepDefinitions.find(item => item.identity.id === 'browser.assertions.visible')
    : undefined
  if (options.execution && (!definition || definition.execution.kind !== 'operation'))
    throw new Error('Synthetic execution definition missing')
  const execution = definition?.execution
  const operation =
    execution?.kind === 'operation'
      ? defaultOperationDefinitions.find(
          item => item.handler.id === execution.handlerId && item.handler.version === execution.handlerVersion,
        )
      : undefined
  if (options.execution && !operation) throw new Error('Synthetic canonical operation missing')
  const proposal = automationScenarioMaterializationSchema.parse({
    scenarioRevisionId: 'scenario-mat-use',
    steps: [
      {
        sourceScenarioStepId: 'step-mat-use',
        stepDefinition: definition
          ? {
              id: definition.identity.id,
              version: definition.identity.version,
              definitionHash: computeStepReferenceHash(definition),
            }
          : { id: 'definition-mat-use', version: '1', definitionHash: H('c') },
        operation: operation
          ? { id: operation.id, version: operation.version, handler: operation.handler }
          : {
              id: 'operation-mat-use',
              version: '1',
              handler: { id: 'handler-mat-use', version: '1', contentHash: H('d') },
            },
        parameters: [],
        testData: [],
        locatorRequirements: [
          {
            requirementId: 'requirement-mat-use',
            parameterName: 'locator',
            ...(options.runtimeLocator ? { runtimeParameter: true } : { locatorId: ensureInput.locatorId }),
          },
        ],
      },
    ],
  })
  const packet = {
    schemaVersion: 'appraise.quality-journey/v1' as const,
    targetProjectId: scope.targetProjectId,
    moduleId: ensureInput.moduleId,
    suite: { id: 'suite-synthetic-use', name: 'Suite', description: null },
    testCase: {
      id: 'case-synthetic-use',
      title: 'Case',
      description: 'Case description',
      steps: [
        {
          order: 0,
          gherkinStep: 'Given a synthetic locator',
          label: 'synthetic locator',
          icon: 'MOUSE',
          invocationJson: canonicalContractJson({
            step: proposal.steps[0]!.stepDefinition,
            inputs: { locator: ensureInput.locatorId },
          }),
        },
      ],
    },
  }
  const manifest = {
    schemaVersion: packet.schemaVersion,
    kind: 'PREPARED_RUNTIME_CAPSULE',
    materializationId: 'materialization-synthetic-use',
    sourceScenarioRevisionId: proposal.scenarioRevisionId,
    sourceScenarioContentHash: H('e'),
    suiteId: packet.suite.id,
    testCaseId: packet.testCase.id,
    steps: proposal.steps.map(step => ({
      stepId: step.sourceScenarioStepId,
      definition: step.stepDefinition,
      operation: step.operation,
      parameters: step.parameters,
      testData: step.testData,
      locatorRequirements: step.locatorRequirements,
    })),
    dataRequirements: [],
    locatorRequirements: proposal.steps.flatMap(step => step.locatorRequirements),
    decision: { id: 'decision-mat-use', contentHash: H('f') },
    portfolioRevisionId: 'portfolio-mat-use',
    portfolioHash: H('1'),
  }
  const row = {
    id: manifest.materializationId,
    journeyId: scope.journeyId,
    targetProjectId: scope.targetProjectId,
    cycleId: 'cycle-mat-use',
    scenarioRevisionId: proposal.scenarioRevisionId,
    scenarioContentHash: manifest.sourceScenarioContentHash,
    portfolioRevisionId: manifest.portfolioRevisionId,
    portfolioContentHash: manifest.portfolioHash,
    decisionId: manifest.decision.id,
    decisionHash: manifest.decision.contentHash,
    workItemId: 'work-mat-use',
    attemptId: 'attempt-mat-use',
    leaseId: 'lease-mat-use',
    inputHash: H('2'),
    materializationHash: hashAutomationMaterialization({
      journeyId: scope.journeyId,
      targetProjectId: scope.targetProjectId,
      expectedInputHash: H('2'),
      expectedScopeHash: H('3'),
      workItemId: 'work-mat-use',
      attemptId: 'attempt-mat-use',
      leaseId: 'lease-mat-use',
      scenario: proposal,
    }),
    status: 'MATERIALIZED',
    sourceProofVersion: M06_MATERIALIZATION_ARTIFACT_VERSION,
    suiteId: packet.suite.id,
    testCaseId: packet.testCase.id,
    artifactRecordId: 'artifact-mat-use',
    artifactJson: canonicalContractJson(manifest),
  }
  const proof = {
    materializationId: row.id,
    expectedScopeHash: H('3'),
    reconstructionVersion: M06_MATERIALIZATION_ARTIFACT_VERSION,
  }
  const artifact = {
    id: row.artifactRecordId,
    journeyId: scope.journeyId,
    targetProjectId: scope.targetProjectId,
    cycleId: row.cycleId,
    kind: 'RUNTIME_CAPSULE',
    artifactId: row.id,
    contentHash: hashAutomationMaterialization(manifest),
    artifactJson: row.artifactJson,
  }
  const moduleRow = {
    id: packet.moduleId,
    name: 'Module',
    updatedAt: new Date(0),
    targetProjectId: scope.targetProjectId,
  }
  const locator = {
    id: ensureInput.locatorId,
    value: '#synthetic',
    updatedAt: new Date(0),
    targetProjectId: scope.targetProjectId,
  }
  const targetBinding = {
    id: 'binding-mat-use',
    targetProjectId: scope.targetProjectId,
    suiteId: packet.suite.id,
    testCaseId: packet.testCase.id,
    bindingJson: canonicalContractJson(packet),
    testCaseHash: hashAutomationTargetBinding(packet),
    stepHash: hashAutomationMaterialization(packet.testCase.steps),
    suiteHash: hashAutomationMaterialization({
      targetProjectId: packet.targetProjectId,
      moduleId: packet.moduleId,
      suite: packet.suite,
    }),
    semanticHash: hashAutomationMaterialization({
      schemaVersion: packet.schemaVersion,
      targetProjectId: packet.targetProjectId,
      moduleId: packet.moduleId,
      suite: { name: packet.suite.name, description: packet.suite.description },
      testCase: {
        title: packet.testCase.title,
        description: packet.testCase.description,
        steps: packet.testCase.steps,
      },
    }),
    resourceHashJson: canonicalContractJson([
      { id: `locator:${locator.id}`, contentHash: hashAutomationMaterialization(locator) },
      {
        id: `module:${moduleRow.id}`,
        contentHash: hashAutomationMaterialization({
          id: moduleRow.id,
          name: moduleRow.name,
          updatedAt: moduleRow.updatedAt,
        }),
      },
      ...(definition && operation
        ? [
            {
              id: `step:${definition.identity.id}:${definition.identity.version}`,
              contentHash: computeStepDefinitionHashes(definition).definitionHash,
            },
            {
              id: `operation:${operation.id}:${operation.version}`,
              contentHash: hashAutomationMaterialization(operation),
            },
          ]
        : []),
    ]),
  }
  const associations = [{ materializationId: row.id, bindingId: targetBinding.id }]
  const models = {
    ...base.models,
    qualityJourneyAutomationMaterialization: { findUnique: vi.fn(async () => row) },
    qualityJourneyAutomationMaterializationSourceProof: { findUnique: vi.fn(async () => proof as typeof proof | null) },
    qualityJourneyArtifact: { findUnique: vi.fn(async () => artifact) },
    qualityJourneyAutomationMaterializationBinding: { findMany: vi.fn(async () => associations) },
    qualityJourneyAutomationTargetBinding: { findMany: vi.fn(async () => [targetBinding]) },
    qualityJourneyWorkAttemptSessionBinding: {
      findUnique: vi.fn(async () => ({
        attemptId: row.attemptId,
        journeyId: scope.journeyId,
        targetProjectId: scope.targetProjectId,
        sessionId: scope.coordinatorSessionId,
        coordinatorGeneration: scope.generation,
        workItemId: row.workItemId,
        leaseId: row.leaseId,
        inputHash: row.inputHash,
        role: 'AUTOMATOR',
        assignmentGeneration: 1,
        authorizationId: 'authorization-mat-use',
      })),
    },
    qualityJourneyWorkAttempt: {
      findUnique: vi.fn(async () => ({
        workItemId: row.workItemId,
        leaseId: row.leaseId,
        assignmentGeneration: 1,
        authorizationId: 'authorization-mat-use',
      })),
    },
    qualityJourneyWorkItem: {
      findUnique: vi.fn(async () => ({
        journeyId: scope.journeyId,
        targetProjectId: scope.targetProjectId,
        cycleId: row.cycleId,
        role: 'AUTOMATOR',
        inputHash: row.inputHash,
      })),
    },
    qualityJourneyWorkAuthorization: {
      findUnique: vi.fn(async () => ({
        journeyId: scope.journeyId,
        targetProjectId: scope.targetProjectId,
        workItemId: row.workItemId,
        role: 'AUTOMATOR',
      })),
    },
    qualityJourney: { findFirst: vi.fn(async () => ({ activeCycleId: row.cycleId })) },
    module: { findUnique: vi.fn(async () => moduleRow) },
    locator: { findUnique: vi.fn(async () => locator) },
    testSuite: {
      findUnique: vi.fn(async () => ({
        ...packet.suite,
        moduleId: packet.moduleId,
        targetProjectId: scope.targetProjectId,
        testCases: [{ id: packet.testCase.id }],
      })),
    },
    testCase: { findUnique: vi.fn(async () => ({ ...packet.testCase, targetProjectId: scope.targetProjectId })) },
    testCaseStep: {
      findMany: vi.fn(async () => packet.testCase.steps.map(step => ({ ...step, testCaseId: packet.testCase.id }))),
    },
  }
  const materializationDescriptor: SharedResourceDescriptorResult = {
    ...ensureDescriptor,
    resources: [
      ...ensureDescriptor.resources,
      { kind: 'TEST_SUITE', resourceId: packet.suite.id, dependencyDigest: '1'.repeat(64) },
      { kind: 'TEST_CASE', resourceId: packet.testCase.id, dependencyDigest: '2'.repeat(64) },
    ],
    keys: [
      ...ensureDescriptor.keys,
      { kind: 'TEST_SUITE', resourceId: packet.suite.id },
      { kind: 'TEST_CASE', resourceId: packet.testCase.id },
    ],
  }
  const request = {
    scope,
    source: {
      sourceKind: 'AUTOMATION_MATERIALIZATION' as const,
      sourceOwnerId: row.id,
      expectedSourceDigest: sharedSourceDigest({
        sourceKind: 'AUTOMATION_MATERIALIZATION',
        sourceOwnerId: row.id,
        sourceHash: row.materializationHash,
      }),
    },
    expectedDependencyDigest: descriptor.dependencyDigest,
  }
  return {
    tx: models as unknown as Prisma.TransactionClient,
    models,
    writes: base.writes,
    row,
    proof,
    associations,
    request,
    materializationDescriptor,
    packet,
    manifest,
    targetBinding,
    definition,
  }
}

describe('shared resource Use typed materialization acquisition with pure doubles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(assertE2BusinessAdmission).mockResolvedValue({ kind: 'E2_V1', admissionVersion: 1 })
    vi.mocked(assertCurrentCoordinatorSession).mockResolvedValue(
      {} as Awaited<ReturnType<typeof assertCurrentCoordinatorSession>>,
    )
  })

  it('reconstructs the actual source twice and activates every derived claim without producer pins', async () => {
    const fixture = fakeMaterializationTransaction()
    vi.mocked(resolveSharedResourceDescriptors).mockResolvedValue(fixture.materializationDescriptor)
    const result = await acquireSharedResourceUseInTransaction(fixture.tx, fixture.request)
    expect(result.status).toBe('CREATED_ACTIVE_INERT')
    expect(fixture.models.qualityJourneyAutomationMaterializationBinding.findMany).toHaveBeenCalledTimes(2)
    expect(fixture.models.qualityJourneyAutomationMaterializationBinding.findMany).toHaveBeenCalledWith({
      where: { materializationId: fixture.row.id },
      orderBy: { bindingId: 'asc' },
      take: 4097,
    })
    expect(fixture.models.qualityJourneySharedResourceClaim.create).toHaveBeenCalledTimes(5)
    expect(assertE2BusinessAdmission).toHaveBeenCalledWith(fixture.tx, scope)
  })

  it('refuses a missing sidecar or changed reconstruction input before admission/writes', async () => {
    for (const missing of [true, false]) {
      const fixture = fakeMaterializationTransaction()
      if (missing) fixture.models.qualityJourneyAutomationMaterializationSourceProof.findUnique.mockResolvedValue(null)
      else fixture.proof.expectedScopeHash = H('4')
      await expect(acquireSharedResourceUseInTransaction(fixture.tx, fixture.request)).rejects.toMatchObject({
        details: { reason: 'MATERIALIZATION_SOURCE_RECONSTRUCTION_REFUSED' },
      })
      expect(fixture.writes).toEqual([])
    }
    expect(assertE2BusinessAdmission).not.toHaveBeenCalled()
  })

  it('never filters a duplicate association into an accepted subset', async () => {
    const fixture = fakeMaterializationTransaction()
    fixture.associations.push({ ...fixture.associations[0]! })
    await expect(acquireSharedResourceUseInTransaction(fixture.tx, fixture.request)).rejects.toMatchObject({
      details: { reason: 'MATERIALIZATION_SOURCE_RECONSTRUCTION_REFUSED' },
    })
    expect(fixture.writes).toEqual([])
  })

  it('refuses unresolved runtime Locator dependencies', async () => {
    const fixture = fakeMaterializationTransaction({ runtimeLocator: true })
    await expect(acquireSharedResourceUseInTransaction(fixture.tx, fixture.request)).rejects.toMatchObject({
      details: { reason: 'MATERIALIZATION_RUNTIME_LOCATOR_UNRESOLVED' },
    })
    expect(fixture.writes).toEqual([])
  })
})

/** Original prepared-source bytes only: intentionally has no TestRun model. */
function fakeExecutionTransaction(options: { runtimeLocator?: boolean } = {}) {
  const base = fakeMaterializationTransaction({ ...options, execution: true })
  const manifest: Record<string, unknown> = { ...base.manifest }
  delete manifest.decision
  delete manifest.portfolioRevisionId
  delete manifest.portfolioHash
  const prepared = {
    id: 'prepared-synthetic-use',
    journeyId: scope.journeyId,
    targetProjectId: scope.targetProjectId,
    cycleId: base.row.cycleId,
    materializationId: base.row.id,
    inputHash: base.row.inputHash,
    manifestJson: canonicalContractJson(manifest),
    manifestHash: hashQualityJourneyExecutionValue(manifest),
    status: 'PREPARED',
    capsuleHash: '',
    createdAt: new Date(0),
  }
  prepared.capsuleHash = hashQualityJourneyExecutionValue({
    schemaVersion: 'appraise.quality-journey/v1',
    capsuleId: prepared.id,
    journeyId: prepared.journeyId,
    targetProjectId: prepared.targetProjectId,
    cycleId: prepared.cycleId,
    materializationId: prepared.materializationId,
    inputHash: prepared.inputHash,
    manifestHash: prepared.manifestHash,
    status: prepared.status,
  })
  if (!base.definition) throw new Error('Synthetic execution definition missing')
  const definition = {
    id: base.definition.identity.id,
    version: base.definition.identity.version,
    status: 'ready',
    definitionJson: canonicalContractJson(base.definition),
    ...computeStepDefinitionHashes(base.definition),
  }
  const effects = classifyJourneyExecutionEffects(
    base.packet.testCase.steps.map(step => stepInvocationSchema.parse(JSON.parse(step.invocationJson))),
    [definition],
  )
  const selection = [
    {
      preparedCapsuleId: prepared.id,
      capsuleHash: prepared.capsuleHash,
      manifestHash: prepared.manifestHash,
      manifestJson: prepared.manifestJson,
      materializationId: base.row.id,
      scenarioRevisionId: base.row.scenarioRevisionId,
      scenarioContentHash: base.row.scenarioContentHash,
      targetBindingId: base.targetBinding.id,
      targetBindingHash: hashQualityJourneyExecutionValue(base.packet),
      testCaseId: base.packet.testCase.id,
      suiteId: base.packet.suite.id,
      resourceHashes: JSON.parse(base.targetBinding.resourceHashJson) as Array<{ id: string; contentHash: string }>,
      ...effects,
    },
  ]
  const cycle = {
    id: 'execution-synthetic-use',
    journeyId: scope.journeyId,
    targetProjectId: scope.targetProjectId,
    cycleId: base.row.cycleId,
    preparedCapsulesJson: '',
    preparedCapsulesHash: '',
  }
  const syncSelection = () => {
    cycle.preparedCapsulesJson = canonicalContractJson(selection)
    cycle.preparedCapsulesHash = hashQualityJourneyExecutionValue(selection)
  }
  syncSelection()
  const models = {
    ...base.models,
    qualityJourneyCoordinatorSession: {
      findUnique: vi.fn(async () => ({
        id: scope.coordinatorSessionId,
        journeyId: scope.journeyId,
        targetProjectId: scope.targetProjectId,
        generation: scope.generation,
      })),
    },
    qualityJourneyCycle: { findUnique: vi.fn(async () => ({ id: base.row.cycleId, journeyId: scope.journeyId })) },
    qualityJourneyExecutionCycle: { findUnique: vi.fn(async () => cycle as typeof cycle | null) },
    qualityJourneyPreparedRuntimeCapsule: { findMany: vi.fn(async () => [prepared]) },
    stepDefinition: { findMany: vi.fn(async () => [definition]) },
  }
  return {
    ...base,
    tx: models as unknown as Prisma.TransactionClient,
    models,
    cycle,
    selection,
    prepared,
    definition,
    syncSelection,
    executionRequest: () => ({
      scope,
      source: {
        sourceKind: 'EXECUTION_CYCLE' as const,
        sourceOwnerId: cycle.id,
        expectedSourceDigest: sharedSourceDigest({
          sourceKind: 'EXECUTION_CYCLE',
          sourceOwnerId: cycle.id,
          sourceHash: cycle.preparedCapsulesHash,
        }),
      },
      expectedDependencyDigest: descriptor.dependencyDigest,
    }),
  }
}

describe('shared resource Use initial/current-cycle frozen execution source with pure doubles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(assertE2BusinessAdmission).mockResolvedValue({ kind: 'E2_V1', admissionVersion: 1 })
    vi.mocked(assertCurrentCoordinatorSession).mockResolvedValue(
      {} as Awaited<ReturnType<typeof assertCurrentCoordinatorSession>>,
    )
  })

  it('reconstructs the exact prepared selection twice before any future TestRun exists', async () => {
    const fixture = fakeExecutionTransaction()
    vi.mocked(resolveSharedResourceDescriptors).mockResolvedValue(fixture.materializationDescriptor)
    const result = await acquireSharedResourceUseInTransaction(fixture.tx, fixture.executionRequest())
    expect(result.status).toBe('CREATED_ACTIVE_INERT')
    expect(result.sourceDigest).toBe(
      sharedSourceDigest({
        sourceKind: 'EXECUTION_CYCLE',
        sourceOwnerId: fixture.cycle.id,
        sourceHash: fixture.cycle.preparedCapsulesHash,
      }),
    )
    expect(fixture.models.qualityJourneyPreparedRuntimeCapsule.findMany).toHaveBeenCalledTimes(2)
    expect(fixture.models.qualityJourneyPreparedRuntimeCapsule.findMany).toHaveBeenCalledWith({
      where: { id: { in: [fixture.prepared.id] } },
      orderBy: { id: 'asc' },
      take: 513,
    })
    expect(fixture.models.qualityJourneyAutomationMaterializationBinding.findMany).toHaveBeenCalledTimes(2)
    expect(fixture.models.qualityJourneySharedResourceClaim.create).toHaveBeenCalledTimes(5)
    expect(fixture.writes.filter(write => write.startsWith('COVERAGE_'))).toHaveLength(5)
    expect('testRun' in fixture.models).toBe(false)
    expect(result).not.toHaveProperty('manifestJson')
    expect(result).not.toHaveProperty('preparedCapsulesJson')
  })

  it('refuses missing, duplicate, foreign, or unchecked frozen prepared identities before writes', async () => {
    for (const corruption of ['MISSING', 'DUPLICATE', 'FOREIGN', 'UNKNOWN_FIELD'] as const) {
      const fixture = fakeExecutionTransaction()
      if (corruption === 'MISSING') fixture.models.qualityJourneyPreparedRuntimeCapsule.findMany.mockResolvedValue([])
      if (corruption === 'DUPLICATE') fixture.selection.push({ ...fixture.selection[0]! })
      if (corruption === 'FOREIGN') fixture.prepared.targetProjectId = 'target-foreign'
      if (corruption === 'UNKNOWN_FIELD')
        Object.assign(fixture.selection[0]!, { uncheckedPreparedCapsule: 'unreviewed' })
      fixture.syncSelection()
      await expect(acquireSharedResourceUseInTransaction(fixture.tx, fixture.executionRequest())).rejects.toThrow()
      expect(fixture.writes).toEqual([])
    }
    expect(assertE2BusinessAdmission).not.toHaveBeenCalled()
  })

  it('rejects a self-consistent capsule whose manifest differs from the reconstructed original materialization', async () => {
    const fixture = fakeExecutionTransaction()
    const changed = { ...JSON.parse(fixture.prepared.manifestJson), suiteId: 'suite-unreviewed' }
    fixture.prepared.manifestJson = canonicalContractJson(changed)
    fixture.prepared.manifestHash = hashQualityJourneyExecutionValue(changed)
    fixture.prepared.capsuleHash = hashQualityJourneyExecutionValue({
      schemaVersion: 'appraise.quality-journey/v1',
      capsuleId: fixture.prepared.id,
      journeyId: fixture.prepared.journeyId,
      targetProjectId: fixture.prepared.targetProjectId,
      cycleId: fixture.prepared.cycleId,
      materializationId: fixture.prepared.materializationId,
      inputHash: fixture.prepared.inputHash,
      manifestHash: fixture.prepared.manifestHash,
      status: fixture.prepared.status,
    })
    Object.assign(fixture.selection[0]!, {
      manifestJson: fixture.prepared.manifestJson,
      manifestHash: fixture.prepared.manifestHash,
      capsuleHash: fixture.prepared.capsuleHash,
    })
    fixture.syncSelection()
    await expect(acquireSharedResourceUseInTransaction(fixture.tx, fixture.executionRequest())).rejects.toMatchObject({
      details: { reason: 'EXECUTION_MANIFEST_MATERIALIZATION_MISMATCH' },
    })
    expect(fixture.writes).toEqual([])
  })

  it('refuses internally inconsistent retained prepared-cycle or producer-session provenance', async () => {
    for (const olderGeneration of [false, true]) {
      const fixture = fakeExecutionTransaction()
      if (olderGeneration) {
        const binding = await fixture.models.qualityJourneyWorkAttemptSessionBinding.findUnique()
        fixture.models.qualityJourneyWorkAttemptSessionBinding.findUnique.mockResolvedValue({
          ...binding,
          coordinatorGeneration: 2,
        })
      } else {
        fixture.prepared.cycleId = 'cycle-unrelated-to-original-materialization'
        fixture.prepared.capsuleHash = hashQualityJourneyExecutionValue({
          schemaVersion: 'appraise.quality-journey/v1',
          capsuleId: fixture.prepared.id,
          journeyId: fixture.prepared.journeyId,
          targetProjectId: fixture.prepared.targetProjectId,
          cycleId: fixture.prepared.cycleId,
          materializationId: fixture.prepared.materializationId,
          inputHash: fixture.prepared.inputHash,
          manifestHash: fixture.prepared.manifestHash,
          status: fixture.prepared.status,
        })
        fixture.selection[0]!.capsuleHash = fixture.prepared.capsuleHash
        fixture.syncSelection()
      }
      await expect(acquireSharedResourceUseInTransaction(fixture.tx, fixture.executionRequest())).rejects.toMatchObject(
        {
          details: {
            reason: olderGeneration
              ? 'EXECUTION_RETAINED_PRODUCER_SESSION_OR_CYCLE'
              : 'EXECUTION_MATERIALIZATION_SELECTION_LINEAGE',
          },
        },
      )
      expect(fixture.writes).toEqual([])
    }
  })

  it('refuses unproven materialization, changed binding selection, definition bytes, and frozen effects', async () => {
    for (const corruption of ['PROOF', 'BINDING', 'DEFINITION', 'EFFECTS'] as const) {
      const fixture = fakeExecutionTransaction()
      if (corruption === 'PROOF')
        fixture.models.qualityJourneyAutomationMaterializationSourceProof.findUnique.mockResolvedValue(null)
      if (corruption === 'BINDING') fixture.selection[0]!.targetBindingId = 'binding-unassociated'
      if (corruption === 'DEFINITION') fixture.definition.definitionHash = H('9')
      if (corruption === 'EFFECTS') fixture.selection[0]!.harmless = !fixture.selection[0]!.harmless
      fixture.syncSelection()
      await expect(acquireSharedResourceUseInTransaction(fixture.tx, fixture.executionRequest())).rejects.toThrow()
      expect(fixture.writes).toEqual([])
    }
  })

  it('does not insert a Use if a selected prepared source changes after domain/guard contention', async () => {
    const fixture = fakeExecutionTransaction()
    vi.mocked(resolveSharedResourceDescriptors).mockResolvedValue(fixture.materializationDescriptor)
    fixture.models.qualityJourneyPreparedRuntimeCapsule.findMany
      .mockResolvedValueOnce([fixture.prepared])
      .mockResolvedValueOnce([])
    await expect(acquireSharedResourceUseInTransaction(fixture.tx, fixture.executionRequest())).rejects.toMatchObject({
      details: { reason: 'EXECUTION_PREPARED_SET_INCOMPLETE_OR_DUPLICATE' },
    })
    expect(fixture.writes.filter(write => write.startsWith('COVERAGE_'))).toHaveLength(5)
    expect(fixture.models.qualityJourneySharedResourceUse.create).not.toHaveBeenCalled()
    expect(fixture.models.qualityJourneySharedResourceClaim.create).not.toHaveBeenCalled()
  })

  it('continues to refuse runtime-only Locator dependencies without a runtime binding proof', async () => {
    const fixture = fakeExecutionTransaction({ runtimeLocator: true })
    await expect(acquireSharedResourceUseInTransaction(fixture.tx, fixture.executionRequest())).rejects.toMatchObject({
      details: { reason: 'MATERIALIZATION_RUNTIME_LOCATOR_UNRESOLVED' },
    })
    expect(fixture.writes).toEqual([])
  })
})
