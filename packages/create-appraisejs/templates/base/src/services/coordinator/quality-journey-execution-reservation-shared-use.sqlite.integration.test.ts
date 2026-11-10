/**
 * Synthetic R06 owning composition on fresh disposable SQLite only.
 * ONLY the no-invalidation preflight is substituted for successful composition.
 * Actual owner, credentials, admission/retirement, source/descriptor reconstruction,
 * Use/claim acquisition and Prisma transaction/rollback remain real.
 * This does not qualify production admission, dispatch, runtime or a provider.
 */
import { randomUUID, createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient, type Prisma } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { createQualityJourneyKernelState, hashQualityJourneyExecutionValue } from '@/lib/quality-journey'
import {
  hashAutomationMaterialization,
  hashAutomationTargetBinding,
  preparedRuntimeCapsuleSchema,
} from '@/lib/quality-journey/automation-contracts'
import { M06_MATERIALIZATION_ARTIFACT_VERSION } from '@/lib/quality-journey/materialization-source-contract'
import { e2CampaignPolicyDigest } from '@/lib/quality-journey/e2-campaign-policy-contract'
import { sharedResourceKinds } from '@/lib/quality-journey/shared-resource-contract'
import { freezeJourneyExecutionEnvironment } from '@/lib/quality-journey/execution-environment'
import { classifyJourneyExecutionEffects } from '@/lib/quality-journey/execution-effects'
import { resolveSharedResourceDescriptors } from './quality-journey-shared-resource-descriptor-service'
import { defaultOperationDefinitions } from '@/lib/operation-catalog'
import {
  builtInStepDefinitions,
  computeStepDefinitionHashes,
  computeStepReferenceHash,
} from '../../../packages/cucumber-runtime/src/step-definitions'

vi.mock('./quality-journey-business-write-join', async importOriginal => {
  const actual = await importOriginal<typeof import('./quality-journey-business-write-join')>()
  return {
    ...actual,
    assertJourneyBusinessGroupSupportsNoInvalidationInTransaction: vi.fn(
      actual.assertJourneyBusinessGroupSupportsNoInvalidationInTransaction,
    ),
  }
})
import { assertJourneyBusinessGroupSupportsNoInvalidationInTransaction } from './quality-journey-business-write-join'
import { commitE2RetirementRequest } from './quality-journey-e2-retirement-service'
import {
  registerQualityJourneyExecutionRuntimeAdapter,
  resetQualityJourneyExecutionRuntimeAdapter,
  startQualityJourneyExecution,
  startQualityJourneyRerun,
  grantQualityJourneyExecutionConsent,
} from './quality-journey-execution-service'
import {
  resolveExecutionCycleUseRequestInTransaction,
  validateActiveSharedResourceUseInTransaction,
  buildSharedResourceClaimPlan,
} from './quality-journey-shared-resource-use-service'

const H = (label: string) => `sha256:${createHash('sha256').update(label).digest('hex')}`
const D = (label: string) => H(label).slice(7)
const json = canonicalContractJson
const at = new Date('2026-10-27T00:00:00.000Z')
const clients: PrismaClient[] = []
const starts = vi.fn(async (_input: { executionCycleId: string }) => undefined)
let actualFence: typeof assertJourneyBusinessGroupSupportsNoInvalidationInTransaction
beforeEach(async () => {
  actualFence ??= (
    await vi.importActual<typeof import('./quality-journey-business-write-join')>(
      './quality-journey-business-write-join',
    )
  ).assertJourneyBusinessGroupSupportsNoInvalidationInTransaction
  vi.mocked(assertJourneyBusinessGroupSupportsNoInvalidationInTransaction).mockImplementation(actualFence)
  starts.mockClear()
  registerQualityJourneyExecutionRuntimeAdapter({
    start: starts,
    cancel: async () => undefined,
    reconcile: async () => undefined,
  })
})
afterEach(async () => {
  resetQualityJourneyExecutionRuntimeAdapter()
  await Promise.all(clients.splice(0).map(client => client.$disconnect()))
  // Keep synthetic temporary databases as evidence; no old fixture or cleanup/reset.
})
function isolateUnqualifiedPreflight() {
  vi.mocked(assertJourneyBusinessGroupSupportsNoInvalidationInTransaction).mockResolvedValue(undefined)
}
function toyPolicy(journeyId: string, targetProjectId: string, sourceTupleDigest: string, suffix: string) {
  const value = {
    id: `r06-policy-${suffix}`,
    allocationDigest: D(`allocation:${suffix}`),
    journeyId,
    targetProjectId,
    sourceTupleDigest,
    policyVersion: 'M06_E2_CAMPAIGN_POLICY_V1',
    policyDigest: '',
    createdAt: at,
    nativeStartWindowMs: 1000,
    dnsWindowMs: 1000,
    tcpWindowMs: 1000,
    tlsWindowMs: 1000,
    upgradeWindowMs: 1000,
    providerRequestWindowMs: 1000,
    mcpCallWindowMs: 1000,
    actorMaxOperations: 32,
    actorMaxBytes: 8388608,
    actorMaxFrames: 512,
    actorMaxSetup: 4,
    actorMaxProviderRequests: 5,
    actorMaxMcpCalls: 16,
    journeyMaxNativeStarts: 6,
    journeyMaxTurnStarts: 5,
    maxNativeStarts: 6,
    maxProviderRequests: 5,
    maxOperations: 192,
    maxBytes: 50331648,
    maxFrames: 3072,
    maxSetup: 24,
    maxMcpCalls: 96,
    nativeStartsReserved: 0,
    providerRequestsReserved: 0,
    operationsReserved: 0,
    bytesReserved: 0,
    framesReserved: 0,
    setupReserved: 0,
    mcpCallsReserved: 0,
    version: 0,
  }
  value.policyDigest = e2CampaignPolicyDigest(value)
  return value
}

type ProducerCreateRejectionDetails = Readonly<{
  name: string | null
  message: string | null
  code: string | null
  meta: Readonly<Record<string, string | number | boolean | null>> | null
  cause: string | null
}>
function producerCreateRejectionDetails(error: unknown): ProducerCreateRejectionDetails {
  const value = error && typeof error === 'object' ? (error as Record<string, unknown>) : {}
  const bounded = (field: unknown, limit: number) => (typeof field === 'string' ? field.slice(0, limit) : null)
  const meta =
    value.meta && typeof value.meta === 'object'
      ? Object.fromEntries(
          Object.entries(value.meta)
            .slice(0, 8)
            .map(([key, item]) => [
              key.slice(0, 100),
              typeof item === 'string'
                ? item.slice(0, 512)
                : typeof item === 'boolean' || item === null || (typeof item === 'number' && Number.isFinite(item))
                  ? item
                  : '[non-scalar]',
            ]),
        )
      : null
  return Object.freeze({
    name: bounded(value.name, 200),
    message: bounded(value.message, 2048),
    code: bounded(value.code, 100),
    meta,
    cause: value.cause instanceof Error ? value.cause.message.slice(0, 512) : bounded(value.cause, 512),
  })
}
type ProducerGenerationDifferentialEvidence = Readonly<{
  kind: 'R06_TEST_OWNED_PRODUCER_GENERATION_DIFFERENTIAL_V1'
  validBeforeRolledBack: boolean
  invalidCreateRejected: boolean
  invalidCreateAdmitted: boolean
  invalidTransactionRolledBack: boolean
  validAfterRolledBack: boolean
  persistedBindings: number
  persistedTestRuns: number
  persistedExecutionCycles: number
  persistedUses: number
  adapterStarts: number
  invalidCreateError: ProducerCreateRejectionDetails
}>
// Test-owned differential observation, not the identity of the lost original Prisma error.
class ProducerGenerationDifferentialObservation extends Error {
  constructor(readonly observation: ProducerGenerationDifferentialEvidence) {
    super('R06_TEST_OWNED_PRODUCER_GENERATION_DIFFERENTIAL_OBSERVED')
    this.name = 'ProducerGenerationDifferentialObservation'
  }
}
async function observeProducerGenerationRefusal(
  db: PrismaClient,
  validData: Readonly<Prisma.QualityJourneyWorkAttemptSessionBindingUncheckedCreateInput>,
): Promise<never> {
  expect(validData.coordinatorGeneration).toBe(1)
  expect(await db.qualityJourneyWorkAttemptSessionBinding.count()).toBe(0)
  const invalidData = Object.freeze({ ...validData, coordinatorGeneration: 2 })
  const { coordinatorGeneration: validGeneration, ...validRest } = validData
  const { coordinatorGeneration: invalidGeneration, ...invalidRest } = invalidData
  expect(validGeneration).toBe(1)
  expect(invalidGeneration).toBe(2)
  expect(invalidRest).toEqual(validRest)

  const validControl = async (label: 'before' | 'after'): Promise<true> => {
    const rollback = new Error(`R06_VALID_BINDING_CONTROL_ROLLBACK_${label}`)
    let inserted = false
    let rolledBack = false
    try {
      await db.$transaction(async tx => {
        const row = await tx.qualityJourneyWorkAttemptSessionBinding.create({ data: validData })
        expect(row).toMatchObject(validData)
        expect(row.sessionId).toBe(validData.sessionId)
        expect(row.coordinatorGeneration).toBe(validData.coordinatorGeneration)
        inserted = true
        throw rollback
      })
    } catch (error) {
      expect(error).toBe(rollback)
      rolledBack = true
    }
    expect(inserted).toBe(true)
    expect(rolledBack).toBe(true)
    expect(await db.qualityJourneyWorkAttemptSessionBinding.count()).toBe(0)
    return true
  }

  const validBeforeRolledBack = await validControl('before')
  const rejectedRollback = new Error('R06_INVALID_BINDING_REJECTION_ROLLBACK')
  const admittedRollback = new Error('R06_INVALID_BINDING_UNEXPECTED_ADMISSION_ROLLBACK')
  let invalidCreateRejected = false
  let invalidCreateAdmitted = false
  let invalidTransactionRolledBack = false
  let invalidCreateError: unknown
  try {
    await db.$transaction(async tx => {
      try {
        // Only this awaited model-create rejection may satisfy the negative observation.
        await tx.qualityJourneyWorkAttemptSessionBinding.create({ data: invalidData })
      } catch (error) {
        invalidCreateRejected = true
        invalidCreateError = error
        throw rejectedRollback
      }
      invalidCreateAdmitted = true
      throw admittedRollback
    })
  } catch (error) {
    expect(error).toBe(invalidCreateRejected ? rejectedRollback : admittedRollback)
    invalidTransactionRolledBack = true
  }
  expect(invalidTransactionRolledBack).toBe(true)
  expect(await db.qualityJourneyWorkAttemptSessionBinding.count()).toBe(0)
  // Unexpected admission has already rolled back, but must fail without an evidence marker.
  expect(invalidCreateAdmitted).toBe(false)
  expect(invalidCreateRejected).toBe(true)
  const validAfterRolledBack = await validControl('after')
  const [persistedBindings, persistedTestRuns, persistedExecutionCycles, persistedUses] = await Promise.all([
    db.qualityJourneyWorkAttemptSessionBinding.count(),
    db.testRun.count(),
    db.qualityJourneyExecutionCycle.count(),
    db.qualityJourneySharedResourceUse.count(),
  ])
  expect(persistedBindings).toBe(0)
  expect(persistedTestRuns).toBe(0)
  expect(persistedExecutionCycles).toBe(0)
  expect(persistedUses).toBe(0)
  expect(starts).not.toHaveBeenCalled()
  throw new ProducerGenerationDifferentialObservation(
    Object.freeze({
      kind: 'R06_TEST_OWNED_PRODUCER_GENERATION_DIFFERENTIAL_V1',
      validBeforeRolledBack,
      invalidCreateRejected,
      invalidCreateAdmitted,
      invalidTransactionRolledBack,
      validAfterRolledBack,
      persistedBindings,
      persistedTestRuns,
      persistedExecutionCycles,
      persistedUses,
      adapterStarts: starts.mock.calls.length,
      invalidCreateError: producerCreateRejectionDetails(invalidCreateError),
    }),
  )
}

type FixtureFault =
  | 'prepared'
  | 'proof'
  | 'artifact'
  | 'binding'
  | 'scenario'
  | 'definition'
  | 'producer'
  | 'missing-proof'
  | 'authorization'
  | 'coverage'
  | 'guard'
async function fixture(harmless = true, fault?: FixtureFault, enrolled = true) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-r06-synthetic-'))
  const database = path.join(directory, 'test.db')
  await copyMigratedTestDatabase(database)
  const db = new PrismaClient({ datasources: { db: { url: `file:${database}` } } })
  clients.push(db)
  const suffix = randomUUID(),
    id = (name: string) => `r06-${name}-${suffix}`
  const targetProjectId = id('target'),
    journeyId = id('journey'),
    cycleId = id('cycle'),
    principalId = id('principal')
  const state = createQualityJourneyKernelState({
    journeyId,
    targetProjectId,
    activeCycleId: cycleId,
    stage: 'AUTOMATION',
  })
  await db.targetProject.create({
    data: {
      id: targetProjectId,
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: id('identity'),
      canonicalPath: path.join(directory, 'inert-target-never-launched'),
      displayName: 'R06 synthetic only',
      fingerprint: H('target'),
    },
  })
  await db.qualityJourney.create({
    data: {
      id: journeyId,
      targetProjectId,
      rootIdempotencyKey: id('root'),
      rootRequestHash: H('root'),
      hostingMode: 'APP_SERVER_LOCAL_V1',
      hostingProvenance: 'R06_SYNTHETIC_TEST_ONLY',
      stage: state.stage,
      activeCycleId: cycleId,
      stateHash: state.stateHash,
    },
  })
  await db.qualityJourneyCycle.create({ data: { id: cycleId, journeyId, sequence: 1 } })
  let originalPolicy: ReturnType<typeof toyPolicy> | undefined
  const originalSourceTupleDigest = D('source:1')
  async function session(generation: number, enrolled = true) {
    const policyBeforeSuccession = originalPolicy
      ? await db.qualityJourneyE2CampaignPolicy.findUniqueOrThrow({ where: { id: originalPolicy.id } })
      : null
    const coordinatorSessionId = id(`session-${generation}`),
      sourceTupleDigest = originalSourceTupleDigest
    await db.qualityJourneyCoordinatorSession.create({
      data: {
        id: coordinatorSessionId,
        journeyId,
        targetProjectId,
        ownerPrincipalId: principalId,
        hostKind: 'APP_SERVER_LOCAL_V1',
        status: 'ACTIVE',
        generation,
        registrationKey: id(`registration-${generation}`),
        registrationRequestHash: H(`registration:${generation}`),
        provenance: 'R06_SYNTHETIC_TEST_ONLY',
        activatedAt: at,
        ...(enrolled ? { e2EnrollmentKind: 'E2_V1', e2EnrollmentDigest: sourceTupleDigest, e2EnrolledAt: at } : {}),
      },
    })
    await db.qualityJourney.update({
      where: { id: journeyId },
      data: { currentCoordinatorSessionId: coordinatorSessionId },
    })
    if (enrolled) {
      if (!originalPolicy)
        originalPolicy = await db.qualityJourneyE2CampaignPolicy.create({
          data: toyPolicy(journeyId, targetProjectId, sourceTupleDigest, `${suffix}-${generation}`),
        })
      const policy = originalPolicy
      const retirement = await db.qualityJourneyE2Retirement.create({
        data: {
          id: id(`retirement-${generation}`),
          journeyId,
          targetProjectId,
          coordinatorSessionId,
          generation,
          campaignPolicyId: policy.id,
        },
      })
      const [policies, enrolledSessions] = await Promise.all([
        db.qualityJourneyE2CampaignPolicy.findMany({ where: { journeyId, targetProjectId } }),
        db.qualityJourneyCoordinatorSession.findMany({
          where: { journeyId, targetProjectId, e2EnrollmentKind: 'E2_V1' },
        }),
      ])
      expect(policies).toHaveLength(1)
      expect(policies[0].id).toBe(policy.id)
      expect(enrolledSessions.find(row => row.id === coordinatorSessionId)).toMatchObject({
        id: coordinatorSessionId,
        generation,
        e2EnrollmentKind: 'E2_V1',
        e2EnrollmentDigest: policy.sourceTupleDigest,
      })
      expect(enrolledSessions.every(row => row.e2EnrollmentDigest === policy.sourceTupleDigest)).toBe(true)
      expect(retirement).toMatchObject({ coordinatorSessionId, generation, campaignPolicyId: policy.id })
      if (policyBeforeSuccession) expect(policies[0]).toEqual(policyBeforeSuccession)
    }
    return {
      journeyId,
      targetProjectId,
      coordinatorSessionId,
      coordinatorGeneration: generation,
      coordinatorPrincipalId: principalId,
    }
  }
  let credentials = await session(1, enrolled)
  const fixtureModule = await db.module.create({
    data: { id: id('module'), targetProjectId, name: 'Frozen original module' },
  })
  const alternateModule = await db.module.create({
    data: { id: id('alternate'), targetProjectId, name: 'Alternate module' },
  })
  const group = await db.locatorGroup.create({
    data: { id: id('group'), targetProjectId, moduleId: fixtureModule.id, name: id('group-name'), route: '/' },
  })
  const locator = await db.locator.create({
    data: { id: id('locator'), targetProjectId, locatorGroupId: group.id, name: 'synthetic', value: '#synthetic' },
  })
  const suite = await db.testSuite.create({
    data: { id: id('suite'), targetProjectId, moduleId: fixtureModule.id, name: 'Frozen suite', description: null },
  })
  const testCase = await db.testCase.create({
    data: {
      id: id('case'),
      targetProjectId,
      title: 'Frozen case',
      description: 'Frozen description',
      TestSuite: { connect: { id: suite.id } },
    },
  })
  const operation = defaultOperationDefinitions.find(
    value => value.id === (harmless ? 'browser.assertions.visible' : 'browser.forms.fill'),
  )!
  const definition = structuredClone(
    builtInStepDefinitions.find(
      value => value.identity.id === operation.id && value.identity.version === operation.version,
    )!,
  )
  definition.identity.id = `r06-synthetic-${suffix}`
  const hashes = computeStepDefinitionHashes(definition),
    referenceHash = computeStepReferenceHash(definition)
  await db.stepDefinition.upsert({
    where: { id_version: { id: definition.identity.id, version: definition.identity.version } },
    update: {},
    create: {
      id: definition.identity.id,
      version: definition.identity.version,
      status: 'ready',
      title: 'Synthetic frozen operation',
      description: 'Never executed',
      definitionJson: json(definition),
      ...hashes,
      executionHash: fault === 'definition' ? H('corrupt') : hashes.executionHash,
      provenanceJson: json({ synthetic: true }),
    },
  })
  const invocationJson = json({
    step: { id: definition.identity.id, version: definition.identity.version, definitionHash: referenceHash },
    inputs: { element: '#synthetic' },
  })
  const step = { order: 0, gherkinStep: 'Then', icon: 'VALIDATION' as const, label: 'Synthetic only', invocationJson }
  await db.testCaseStep.create({ data: { id: id('step'), testCaseId: testCase.id, ...step } })
  const bindingPacket = {
    schemaVersion: 'appraise.quality-journey/v1' as const,
    targetProjectId,
    moduleId: fixtureModule.id,
    suite: { id: suite.id, name: suite.name, description: suite.description },
    testCase: { id: testCase.id, title: testCase.title, description: testCase.description, steps: [step] },
  }
  const resources = [
    {
      id: `module:${fixtureModule.id}`,
      contentHash: hashAutomationMaterialization({
        id: fixtureModule.id,
        name: fixtureModule.name,
        updatedAt: fixtureModule.updatedAt,
      }),
    },
    {
      id: `locator:${locator.id}`,
      contentHash: hashAutomationMaterialization({
        id: locator.id,
        value: locator.value,
        updatedAt: locator.updatedAt,
        targetProjectId,
      }),
    },
    { id: `step:${definition.identity.id}:${definition.identity.version}`, contentHash: hashes.definitionHash },
    { id: `operation:${operation.id}:${operation.version}`, contentHash: hashQualityJourneyExecutionValue(operation) },
  ]
  const work = await db.qualityJourneyWorkItem.create({
    data: {
      id: id('work'),
      journeyId,
      targetProjectId,
      cycleId,
      role: 'AUTOMATOR',
      inputHash: H('input'),
      roleContractDigest: H('role'),
    },
  })
  const authorization = await db.qualityJourneyWorkAuthorization.create({
    data: {
      id: id('authorization'),
      journeyId,
      targetProjectId,
      workItemId: work.id,
      role: fault === 'authorization' ? 'REQUIREMENT_ANALYZER' : 'AUTOMATOR',
      roleContractDigest: H('role'),
      capabilityProfileId: id('profile'),
      capabilityProfileHash: H('profile'),
      authorizationJson: '{}',
      authorizationHash: H('authorization'),
    },
  })
  const attempt = await db.qualityJourneyWorkAttempt.create({
    data: {
      id: id('attempt'),
      workItemId: work.id,
      attempt: 1,
      status: 'COMPLETED',
      leaseId: id('lease'),
      ownerTokenHash: H('owner'),
      leaseExpiresAt: at,
      heartbeatSeconds: 1,
      authorizationId: authorization.id,
    },
  })
  const bindingData = Object.freeze({
    attemptId: attempt.id,
    journeyId,
    targetProjectId,
    sessionId: credentials.coordinatorSessionId,
    coordinatorGeneration: credentials.coordinatorGeneration,
    assignmentGeneration: attempt.assignmentGeneration,
    workItemId: work.id,
    role: 'AUTOMATOR',
    authorizationId: authorization.id,
    leaseId: attempt.leaseId,
    inputHash: work.inputHash,
    provenance: 'R06_SYNTHETIC_TEST_ONLY',
  }) satisfies Prisma.QualityJourneyWorkAttemptSessionBindingUncheckedCreateInput
  if (fault === 'producer') await observeProducerGenerationRefusal(db, Object.freeze({ ...bindingData, createdAt: at }))
  await db.qualityJourneyWorkAttemptSessionBinding.create({ data: bindingData })
  async function artifact(
    name: string,
    kind: string,
    artifactJson = '{}',
    contentHash = H(name),
    artifactId = id(`artifact-${name}`),
  ) {
    return db.qualityJourneyArtifact.create({
      data: {
        id: id(name),
        identityKey: id(`identity-${name}`),
        journeyId,
        targetProjectId,
        cycleId,
        kind,
        artifactId,
        contentHash,
        artifactJson,
      },
    })
  }
  const analysisArtifact = await artifact('analysis-artifact', 'ANALYSIS_REVISION')
  const analysis = await db.qualityJourneyAnalysisRevision.create({
    data: {
      id: id('analysis'),
      journeyId,
      targetProjectId,
      cycleId,
      artifactRecordId: analysisArtifact.id,
      artifactId: analysisArtifact.artifactId,
      artifactRevisionId: id('analysis-revision'),
      revision: 1,
      contentHash: H('analysis'),
      submissionIdempotencyKey: id('analysis-submit'),
      submissionHash: H('analysis-submit'),
      submittedWorkItemId: work.id,
      submittedAttemptId: attempt.id,
      inputHash: work.inputHash,
    },
  })
  const decisionArtifact = await artifact('analysis-decision-artifact', 'ANALYSIS_APPROVAL')
  const analysisDecision = await db.qualityJourneyAnalysisDecision.create({
    data: {
      id: id('analysis-decision'),
      journeyId,
      analysisRevisionId: analysis.id,
      artifactRecordId: decisionArtifact.id,
      commandId: id('analysis-command'),
      contentHash: H('analysis-decision'),
      reviewHash: H('review'),
      decision: 'APPROVED',
      actor: 'USER',
    },
  })
  const discovery = await db.qualityJourneyDiscoveryRevision.create({
    data: {
      id: id('discovery'),
      journeyId,
      targetProjectId,
      cycleId,
      analysisRevisionId: analysis.id,
      analysisDecisionId: analysisDecision.id,
      analysisArtifactId: analysisArtifact.artifactId,
      analysisRevisionArtifactId: analysis.artifactRevisionId,
      analysisRevisionContentHash: analysis.contentHash,
      analysisApprovalArtifactId: decisionArtifact.artifactId,
      analysisApprovalContentHash: decisionArtifact.contentHash,
      approvedRequirementSetHash: H('requirements'),
      environmentRegistryHash: H('environments'),
      locatorRegistryHash: H('locators'),
      resourceRegistryHash: H('resources'),
      stepDefinitionRegistryHash: H('definitions'),
      operationRegistryHash: H('operations'),
      scoutScopeJson: '{}',
      scoutInputHash: H('scout'),
      resourceScopeJson: '{}',
      resourceInputHash: H('resource'),
      scopeHash: H('scope'),
      scoutWorkItemId: work.id,
      resourceWorkItemId: work.id,
      status: 'COMPLETE',
      completionHash: H('discovery-complete'),
    },
  })
  const portfolioArtifact = await artifact('portfolio-artifact', 'SCENARIO_PORTFOLIO_REVISION')
  const portfolio = await db.qualityJourneyScenarioPortfolioRevision.create({
    data: {
      id: id('portfolio'),
      journeyId,
      targetProjectId,
      cycleId,
      discoveryRevisionId: discovery.id,
      discoveryCompletionHash: discovery.completionHash!,
      artifactRecordId: portfolioArtifact.id,
      artifactId: portfolioArtifact.artifactId,
      artifactRevisionId: id('portfolio-version'),
      revision: 1,
      contentHash: H('portfolio'),
      behavioralIntentHash: H('intent'),
      enrichmentHash: H('enrichment'),
      layoutHash: H('layout'),
      coverageRationale: 'Synthetic',
      graphJson: '{}',
      submissionIdempotencyKey: id('portfolio-submit'),
      submissionHash: H('portfolio-submit'),
      submittedWorkItemId: work.id,
      submittedAttemptId: attempt.id,
    },
  })
  const scenario = await db.qualityJourneyScenarioRevision.create({
    data: {
      id: id('scenario-record'),
      portfolioRevisionId: portfolio.id,
      stableScenarioId: id('stable-scenario'),
      scenarioRevisionId: id('scenario-version'),
      behavioralIntentJson: '{}',
      behavioralIntentHash: H('intent'),
      enrichmentJson: '{}',
      enrichmentHash: H('enrichment'),
      layoutJson: '{}',
      layoutHash: H('layout'),
      contentHash: H('scenario'),
    },
  })
  const decision = await db.qualityJourneyScenarioDecision.create({
    data: {
      id: id('scenario-decision'),
      portfolioRevisionId: portfolio.id,
      scenarioRevisionId: scenario.scenarioRevisionId,
      decision: 'APPROVED',
      actor: 'USER',
      idempotencyKey: id('approve'),
      requestHash: H('approve'),
      contentHash: H('decision'),
    },
  })
  const materializationId = id('materialization'),
    expectedScopeHash = H('automator-scope')
  const proposalStep = {
    sourceScenarioStepId: id('source-step'),
    stepDefinition: { id: definition.identity.id, version: definition.identity.version, definitionHash: referenceHash },
    operation: { id: operation.id, version: operation.version, handler: operation.handler },
    parameters: [],
    testData: [],
    locatorRequirements: [
      { requirementId: id('locator-requirement'), parameterName: 'element', locatorId: locator.id },
    ],
  }
  const proposal = { scenarioRevisionId: scenario.scenarioRevisionId, steps: [proposalStep] }
  const materializationHash = hashAutomationMaterialization({
    journeyId,
    targetProjectId,
    expectedInputHash: work.inputHash,
    expectedScopeHash,
    workItemId: work.id,
    attemptId: attempt.id,
    leaseId: attempt.leaseId,
    scenario: proposal,
  })
  const manifest = {
    schemaVersion: 'appraise.quality-journey/v1',
    kind: 'PREPARED_RUNTIME_CAPSULE',
    materializationId,
    sourceScenarioRevisionId: scenario.scenarioRevisionId,
    sourceScenarioContentHash: scenario.contentHash,
    suiteId: suite.id,
    testCaseId: testCase.id,
    steps: [
      {
        stepId: proposalStep.sourceScenarioStepId,
        definition: proposalStep.stepDefinition,
        operation: proposalStep.operation,
        parameters: [],
        testData: [],
        locatorRequirements: proposalStep.locatorRequirements,
      },
    ],
    dataRequirements: [],
    locatorRequirements: proposalStep.locatorRequirements,
  }
  const fullArtifact = {
    ...manifest,
    decision: { id: decision.id, contentHash: decision.contentHash },
    portfolioRevisionId: portfolio.artifactRevisionId,
    portfolioHash: portfolio.contentHash,
  }
  const runtimeArtifact = await artifact(
    'runtime-artifact',
    'RUNTIME_CAPSULE',
    fault === 'artifact' ? '{}' : json(fullArtifact),
    hashAutomationMaterialization(fullArtifact),
    materializationId,
  )
  await db.qualityJourneyAutomationMaterialization.create({
    data: {
      id: materializationId,
      journeyId,
      targetProjectId,
      cycleId,
      scenarioRevisionId: scenario.scenarioRevisionId,
      scenarioContentHash: fault === 'scenario' ? H('corrupt') : scenario.contentHash,
      portfolioRevisionId: portfolio.artifactRevisionId,
      portfolioContentHash: portfolio.contentHash,
      decisionId: decision.id,
      decisionHash: decision.contentHash,
      workItemId: work.id,
      attemptId: attempt.id,
      leaseId: attempt.leaseId,
      ownerTokenHash: attempt.ownerTokenHash,
      inputHash: work.inputHash,
      idempotencyKey: id('materialize'),
      requestHash: H('materialize'),
      materializationHash,
      sourceProofVersion: M06_MATERIALIZATION_ARTIFACT_VERSION,
      suiteId: suite.id,
      testCaseId: testCase.id,
      artifactRecordId: runtimeArtifact.id,
      portfolioRecordId: portfolio.id,
      artifactJson: json(fullArtifact),
    },
  })
  if (fault !== 'missing-proof')
    await db.qualityJourneyAutomationMaterializationSourceProof.create({
      data: {
        materializationId,
        expectedScopeHash: fault === 'proof' ? H('corrupt') : expectedScopeHash,
        reconstructionVersion: M06_MATERIALIZATION_ARTIFACT_VERSION,
      },
    })
  const binding = await db.qualityJourneyAutomationTargetBinding.create({
    data: {
      id: id('binding'),
      journeyId,
      targetProjectId,
      suiteId: suite.id,
      testCaseId: testCase.id,
      bindingJson: json(bindingPacket),
      resourceHashJson: json(resources),
      testCaseHash: hashAutomationTargetBinding(bindingPacket),
      stepHash: fault === 'binding' ? H('corrupt') : hashAutomationMaterialization(bindingPacket.testCase.steps),
      suiteHash: hashAutomationMaterialization({
        targetProjectId,
        moduleId: fixtureModule.id,
        suite: bindingPacket.suite,
      }),
      semanticHash: hashAutomationMaterialization({
        schemaVersion: bindingPacket.schemaVersion,
        targetProjectId,
        moduleId: fixtureModule.id,
        suite: { name: suite.name, description: suite.description },
        testCase: { title: testCase.title, description: testCase.description, steps: bindingPacket.testCase.steps },
      }),
    },
  })
  await db.qualityJourneyAutomationMaterializationBinding.create({ data: { materializationId, bindingId: binding.id } })
  const preparedIdentity = preparedRuntimeCapsuleSchema.parse({
    schemaVersion: 'appraise.quality-journey/v1',
    capsuleId: id('prepared'),
    journeyId,
    targetProjectId,
    cycleId,
    materializationId,
    inputHash: work.inputHash,
    manifestHash: hashQualityJourneyExecutionValue(manifest),
    status: 'PREPARED',
  })
  const prepared = await db.qualityJourneyPreparedRuntimeCapsule.create({
    data: {
      id: preparedIdentity.capsuleId,
      journeyId,
      targetProjectId,
      cycleId,
      materializationId,
      inputHash: work.inputHash,
      manifestHash: preparedIdentity.manifestHash,
      manifestJson: json(manifest),
      capsuleHash: fault === 'prepared' ? H('corrupt') : hashQualityJourneyExecutionValue(preparedIdentity),
    },
  })
  const environment = await db.environment.create({
    data: { id: id('environment'), targetProjectId, name: id('environment-name'), baseUrl: 'http://example.invalid' },
  })
  await db.qualityJourney.update({
    where: { id: journeyId },
    data: { activeScenarioPortfolioRevisionId: portfolio.id },
  })
  for (const kind of sharedResourceKinds)
    if (!(fault === 'coverage' && kind === 'TEST_CASE'))
      await db.qualityJourneySharedResourceCoverage.create({
        data: {
          targetProjectId,
          kind,
          protocolVersion: 1,
          state: 'COMPLETE',
          epoch: 0,
          writerClosureDigest: D('writer'),
          readerClosureDigest: D('reader'),
          sourceUniverseDigest: D('universe'),
          reconciliationDigest: D('reconciliation'),
          proofKind: 'RECONCILED_V1',
          completedAt: at,
        },
      })
  for (const [kind, resourceId] of [
    ['MODULE', fixtureModule.id],
    ['MODULE', alternateModule.id],
    ['TEST_SUITE', suite.id],
    ['TEST_CASE', testCase.id],
    ['LOCATOR_GROUP', group.id],
    ['LOCATOR', locator.id],
  ] as const)
    if (!(fault === 'guard' && kind === 'LOCATOR') && !(fault === 'coverage' && kind === 'TEST_CASE'))
      await db.qualityJourneySharedResourceGuard.create({
        data: {
          targetProjectId,
          kind,
          resourceId,
          epoch: 0,
          coverageState: 'COMPLETE_V1',
          coverageDigest: D('guard'),
          resourceState: 'LIVE',
        },
      })
  const input = {
    journeyId,
    targetProjectId,
    preparedRuntimeCapsuleIds: [prepared.id],
    environmentId: environment.id,
    browserEngine: 'CHROMIUM' as const,
    expectedStateHash: state.stateHash,
    idempotencyKey: id('execute'),
  }
  return {
    db,
    directory,
    id,
    input,
    module: fixtureModule,
    alternateModule,
    group,
    locator,
    suite,
    testCase,
    binding,
    prepared,
    materializationId,
    definition,
    hashes,
    scenario,
    cycleId,
    session,
    resources,
    invocationJson,
    get credentials() {
      return credentials
    },
    set credentials(value) {
      credentials = value
    },
  }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
type Hook = (event: {
  model: string
  operation: string
  args: Record<string, unknown>
  phase: 'before' | 'after'
  tx: Prisma.TransactionClient
}) => Promise<void> | void
/** Instrument real delegates inside the SAME actual Prisma transaction. Never stub a read, descriptor, acquisition or receipt. */
function observedClient(db: PrismaClient, hook: Hook): PrismaClient {
  return new Proxy(db, {
    get(target, key) {
      if (key !== '$transaction') return Reflect.get(target, key, target)
      return (body: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        db.$transaction(
          async raw => {
            const delegates = new Map<PropertyKey, unknown>()
            const tx = new Proxy(raw, {
              get(actual, model) {
                const value = Reflect.get(actual, model, actual)
                if (typeof model !== 'string' || model.startsWith('$') || !value || typeof value !== 'object')
                  return value
                if (!delegates.has(model))
                  delegates.set(
                    model,
                    new Proxy(value, {
                      get(delegate, operation) {
                        const method = Reflect.get(delegate, operation, delegate)
                        if (typeof operation !== 'string' || typeof method !== 'function') return method
                        return async (args: Record<string, unknown>) => {
                          await hook({ model, operation, args, phase: 'before', tx: raw })
                          const result = await Reflect.apply(method, delegate, [args])
                          await hook({ model, operation, args, phase: 'after', tx: raw })
                          return result
                        }
                      },
                    }),
                  )
                return delegates.get(model)
              },
            })
            return body(tx)
          },
          { timeout: 30000 },
        )
    },
  }) as PrismaClient
}
async function snapshot(f: Fixture) {
  // Whole synthetic DB projections catch every tentative source, consent,
  // lifecycle, proposal, guard, coverage, Use, claim and run write on rollback.
  return Promise.all([
    f.db.qualityJourney.findMany(),
    f.db.qualityJourneyCycle.findMany(),
    f.db.qualityJourneyExecutionCycle.findMany(),
    f.db.qualityJourneyExecutionConsent.findMany(),
    f.db.qualityJourneySharedResourceUse.findMany(),
    f.db.qualityJourneySharedResourceClaim.findMany(),
    f.db.qualityJourneySharedResourceCoverage.findMany(),
    f.db.qualityJourneySharedResourceGuard.findMany(),
    f.db.testRun.findMany(),
    f.db.testRunTestCase.findMany(),
    f.db.qualityJourneyExecutionTestRun.findMany(),
    f.db.qualityJourneyExecutionRerunProposal.findMany(),
    f.db.qualityJourneyCommand.findMany(),
    f.db.qualityJourneyEvent.findMany(),
    f.db.locator.findMany(),
    f.db.locatorGroup.findMany(),
    f.db.module.findMany(),
  ])
}
async function start(f: Fixture, client: PrismaClient = f.db) {
  return startQualityJourneyExecution(f.input, client, f.credentials)
}
async function rerunInput(f: Fixture, predecessorId: string) {
  const state = createQualityJourneyKernelState({
    journeyId: f.input.journeyId,
    targetProjectId: f.input.targetProjectId,
    activeCycleId: f.cycleId,
    stage: 'TRIAGE',
  })
  await f.db.qualityJourneyExecutionCycle.update({
    where: { id: predecessorId },
    data: { status: 'COMPLETED', completedAt: at },
  })
  await f.db.qualityJourney.update({
    where: { id: f.input.journeyId },
    data: { stage: 'TRIAGE', stateHash: state.stateHash, activeWorkItemIdsJson: '[]' },
  })
  const proposal = await f.db.qualityJourneyExecutionRerunProposal.create({
    data: {
      id: f.id('rerun'),
      journeyId: f.input.journeyId,
      targetProjectId: f.input.targetProjectId,
      sourceExecutionCycleId: predecessorId,
      sourceEvidenceJson: '[]',
      selectedScenariosJson: json([f.scenario.scenarioRevisionId]),
      reason: 'Synthetic frozen rerun',
      proposalHash: H('proposal'),
      idempotencyKey: f.id('proposal'),
      requestHash: H('proposal-request'),
      status: 'APPROVED',
      approvedAt: at,
    },
  })
  return {
    journeyId: f.input.journeyId,
    targetProjectId: f.input.targetProjectId,
    proposalId: proposal.id,
    environmentId: f.input.environmentId,
    browserEngine: f.input.browserEngine,
    expectedStateHash: state.stateHash,
    idempotencyKey: f.id('rerun-start'),
  }
}
async function seedRetainedReplay(
  f: Fixture,
  variant: 'missing' | 'released' | 'partial' | 'extra' | 'wrong-source' | 'wrong-generation',
) {
  const materialization = await f.db.qualityJourneyAutomationMaterialization.findUniqueOrThrow({
    where: { id: f.materializationId },
  })
  const frozen = [
    {
      preparedCapsuleId: f.prepared.id,
      capsuleHash: f.prepared.capsuleHash,
      manifestHash: f.prepared.manifestHash,
      manifestJson: f.prepared.manifestJson,
      materializationId: f.materializationId,
      scenarioRevisionId: f.scenario.scenarioRevisionId,
      scenarioContentHash: f.scenario.contentHash,
      targetBindingId: f.binding.id,
      targetBindingHash: hashQualityJourneyExecutionValue(JSON.parse(f.binding.bindingJson)),
      testCaseId: f.testCase.id,
      suiteId: f.suite.id,
      resourceHashes: f.resources,
      ...classifyJourneyExecutionEffects(
        [JSON.parse(f.invocationJson)],
        [{ id: f.definition.identity.id, version: f.definition.identity.version, definitionJson: json(f.definition) }],
      ),
    },
  ]
  expect(materialization.cycleId).toBe(f.cycleId)
  const environment = await f.db.environment.findUniqueOrThrow({ where: { id: f.input.environmentId } })
  const snapshot = freezeJourneyExecutionEnvironment(environment, 'LOCAL_WORKSPACE')
  const id = `qjex_${createHash('sha256').update([f.input.journeyId, f.input.idempotencyKey].join(':')).digest('hex').slice(0, 24)}`
  const cycle = await f.db.qualityJourneyExecutionCycle.create({
    data: {
      id,
      journeyId: f.input.journeyId,
      targetProjectId: f.input.targetProjectId,
      cycleId: f.cycleId,
      preparedCapsulesJson: json(frozen),
      preparedCapsulesHash: hashQualityJourneyExecutionValue(frozen),
      environmentId: environment.id,
      environmentSnapshotJson: snapshot.json,
      environmentSnapshotHash: snapshot.hash,
      environmentSnapshotVersion: snapshot.version,
      targetFingerprint: H('target'),
      browserEngine: f.input.browserEngine,
      stateHash: f.input.expectedStateHash,
      idempotencyKey: f.input.idempotencyKey,
      requestHash: hashQualityJourneyExecutionValue({
        input: f.input,
        proposalId: undefined,
        predecessorExecutionCycleId: undefined,
      }),
    },
  })
  if (variant === 'missing') return
  const c = f.credentials,
    scope = {
      journeyId: c.journeyId,
      targetProjectId: c.targetProjectId,
      coordinatorSessionId: c.coordinatorSessionId,
      generation: c.coordinatorGeneration,
      credentials: c,
    }
  const request = await f.db.$transaction(tx =>
    resolveExecutionCycleUseRequestInTransaction(tx, {
      scope,
      executionCycleId: cycle.id,
      preparedCapsulesHash: cycle.preparedCapsulesHash,
    }),
  )
  const descriptor = await f.db.$transaction(tx =>
    resolveSharedResourceDescriptors(tx, c.targetProjectId, [
      { kind: 'MODULE', resourceId: f.module.id },
      { kind: 'TEST_SUITE', resourceId: f.suite.id },
      { kind: 'TEST_CASE', resourceId: f.testCase.id },
      { kind: 'LOCATOR', resourceId: f.locator.id },
    ]),
  )
  expect(descriptor.dependencyDigest).toBe(request.expectedDependencyDigest)
  const plan = buildSharedResourceClaimPlan(
    {
      journeyId: c.journeyId,
      targetProjectId: c.targetProjectId,
      coordinatorSessionId: c.coordinatorSessionId,
      generation: c.coordinatorGeneration,
      sourceKind: 'EXECUTION_CYCLE',
      sourceOwnerId: cycle.id,
      sourceDigest: request.source.expectedSourceDigest,
    },
    descriptor,
  )
  const foreign = variant === 'wrong-generation' ? await f.session(2) : null
  if (foreign)
    await f.db.qualityJourney.update({
      where: { id: c.journeyId },
      data: { currentCoordinatorSessionId: c.coordinatorSessionId },
    })
  const claims = [...plan.claims]
  if (variant === 'extra')
    claims.push({
      id: D('extra-claim'),
      useId: plan.id,
      journeyId: c.journeyId,
      targetProjectId: c.targetProjectId,
      kind: 'MODULE',
      resourceId: f.alternateModule.id,
      dependencyDigest: D('extra'),
    })
  await f.db.qualityJourneySharedResourceUse.create({
    data: {
      id: plan.id,
      journeyId: c.journeyId,
      targetProjectId: c.targetProjectId,
      sourceKind: 'EXECUTION_CYCLE',
      sourceOwnerId: variant === 'wrong-source' ? f.id('foreign-cycle') : cycle.id,
      sourceDigest: plan.sourceDigest,
      dependencyDigest: plan.dependencyDigest,
      claimSetDigest: plan.claimSetDigest,
      claimSetCount: claims.length,
      coordinatorSessionId: foreign?.coordinatorSessionId ?? c.coordinatorSessionId,
      generation: foreign?.coordinatorGeneration ?? c.coordinatorGeneration,
    },
  })
  for (const claim of variant === 'partial' ? claims.slice(1) : claims)
    await f.db.qualityJourneySharedResourceClaim.create({ data: { ...claim, state: 'ACTIVE', claimEpoch: 0 } })
  if (variant === 'partial') return // Partial PREPARING is retained, never repaired or activated.
  await f.db.qualityJourneySharedResourceUse.update({ where: { id: plan.id }, data: { state: 'ACTIVE', version: 1 } })
  if (variant === 'released') {
    await f.db.qualityJourneySharedResourceClaim.updateMany({
      where: { useId: plan.id },
      data: {
        state: 'RELEASED',
        releaseEpoch: 1,
        releasedAt: at,
        releaseEvidenceDigest: D('synthetic-release'),
        releaseReason: 'SYNTHETIC_REPLAY_FIXTURE',
      },
    })
    await f.db.qualityJourneySharedResourceUse.update({
      where: { id: plan.id },
      data: {
        state: 'RELEASED',
        version: 2,
        releasedAt: at,
        releaseEvidenceDigest: D('synthetic-release'),
        releaseReason: 'SYNTHETIC_REPLAY_FIXTURE',
      },
    })
  }
}
async function retirement(f: Fixture, request: string) {
  const c = f.credentials
  return f.db.$transaction(tx =>
    commitE2RetirementRequest(
      tx,
      {
        journeyId: c.journeyId,
        targetProjectId: c.targetProjectId,
        coordinatorSessionId: c.coordinatorSessionId,
        generation: c.coordinatorGeneration,
        requestId: f.id(request),
        requestedAt: at,
        authority: { kind: 'CURRENT_SESSION', credentials: c },
      },
      'PAUSE',
    ),
  )
}

describe('R06 actual owner plus real SQLite, under substituted no-invalidation preflight only', () => {
  it('O1 inserts exact cycle, complete distinct Use/claims, then run bindings with one admission', async () => {
    const f = await fixture()
    isolateUnqualifiedPreflight()
    const order: string[] = []
    await start(
      f,
      observedClient(f.db, event => {
        if (event.phase === 'after') order.push(`${event.model}.${event.operation}`)
      }),
    )
    const cycle = await f.db.qualityJourneyExecutionCycle.findFirstOrThrow({ where: { journeyId: f.input.journeyId } })
    const use = await f.db.qualityJourneySharedResourceUse.findFirstOrThrow({ where: { sourceOwnerId: cycle.id } })
    expect(use).toMatchObject({
      sourceKind: 'EXECUTION_CYCLE',
      state: 'ACTIVE',
      coordinatorSessionId: f.credentials.coordinatorSessionId,
      generation: 1,
    })
    expect(order.indexOf('qualityJourneyExecutionCycle.create')).toBeLessThan(
      order.indexOf('qualityJourneySharedResourceUse.create'),
    )
    expect(order.indexOf('qualityJourneySharedResourceUse.updateMany')).toBeLessThan(order.indexOf('testRun.create'))
    expect(order.indexOf('testRun.create')).toBeLessThan(order.indexOf('qualityJourneyExecutionTestRun.create'))
    expect(await f.db.qualityJourneySharedResourceClaim.count({ where: { useId: use.id, state: 'ACTIVE' } })).toBe(
      use.claimSetCount,
    )
    expect(
      new Set(
        (await f.db.qualityJourneySharedResourceClaim.findMany({ where: { useId: use.id } })).map(row => row.kind),
      ),
    ).toEqual(new Set(sharedResourceKinds))
    expect((await f.db.qualityJourney.findUniqueOrThrow({ where: { id: f.input.journeyId } })).e2AdmissionVersion).toBe(
      1,
    )
    const edge = await f.db.qualityJourneyExecutionTestRun.findFirstOrThrow({
      where: { executionCycleId: cycle.id },
      include: { testRun: true },
    })
    expect(edge.preparedCapsuleId).toBe(f.prepared.id)
    expect(edge.runId).toBe(edge.testRun.runId)
    expect(edge.testRun.intent).toBe('QUALITY_JOURNEY')
    expect(starts).toHaveBeenCalledTimes(1) // Inert post-commit recorder only, never physical dispatch.
  })
  it('O2 reruns retained frozen data across a new cycle/session without reviving a released predecessor Use', async () => {
    const f = await fixture()
    isolateUnqualifiedPreflight()
    await start(f)
    const predecessor = await f.db.qualityJourneyExecutionCycle.findFirstOrThrow({
      where: { journeyId: f.input.journeyId },
    })
    const oldUse = await f.db.qualityJourneySharedResourceUse.findFirstOrThrow({
      where: { sourceOwnerId: predecessor.id },
    })
    await f.db.qualityJourneySharedResourceClaim.updateMany({
      where: { useId: oldUse.id },
      data: {
        state: 'RELEASED',
        releasedAt: at,
        releaseEpoch: 2,
        releaseEvidenceDigest: D('synthetic-release'),
        releaseReason: 'SYNTHETIC_RETAINED_SOURCE',
      },
    })
    await f.db.qualityJourneySharedResourceUse.update({
      where: { id: oldUse.id },
      data: {
        state: 'RELEASED',
        version: { increment: 1 },
        releasedAt: at,
        releaseEvidenceDigest: D('synthetic-release'),
        releaseReason: 'SYNTHETIC_RETAINED_SOURCE',
      },
    })
    const released = await f.db.qualityJourneySharedResourceUse.findUnique({ where: { id: oldUse.id } })
    const releasedClaims = await f.db.qualityJourneySharedResourceClaim.findMany({ where: { useId: oldUse.id } })
    await f.db.qualityJourneyCoordinatorSession.update({
      where: { id: f.credentials.coordinatorSessionId },
      data: { status: 'FENCED', fencedAt: at },
    })
    f.credentials = await f.session(2)
    // Current authored content is a new dependency snapshot, not the frozen execution packet.
    await f.db.testCase.update({ where: { id: f.testCase.id }, data: { title: 'Changed current title' } })
    await f.db.testSuite.update({ where: { id: f.suite.id }, data: { name: 'Changed current suite' } })
    await f.db.module.update({ where: { id: f.module.id }, data: { name: 'Changed current module' } })
    const input = await rerunInput(f, predecessor.id)
    await startQualityJourneyRerun(input, f.db, f.credentials)
    const next = await f.db.qualityJourneyExecutionCycle.findFirstOrThrow({
      where: { predecessorExecutionCycleId: predecessor.id },
    })
    const nextUse = await f.db.qualityJourneySharedResourceUse.findFirstOrThrow({ where: { sourceOwnerId: next.id } })
    expect(next.id).not.toBe(predecessor.id)
    expect(nextUse.id).not.toBe(oldUse.id)
    expect(nextUse.generation).toBe(2)
    expect(next.preparedCapsulesJson).toBe(predecessor.preparedCapsulesJson)
    expect(await f.db.qualityJourneySharedResourceUse.findUnique({ where: { id: oldUse.id } })).toEqual(released)
    expect(await f.db.qualityJourneySharedResourceClaim.findMany({ where: { useId: oldUse.id } })).toEqual(
      releasedClaims,
    )
  })
  it('O3 exact replay performs no Use/claim/guard/coverage writes', async () => {
    const f = await fixture()
    isolateUnqualifiedPreflight()
    await start(f)
    const before = await snapshot(f)
    const beforeJourneys = before[0].filter(
      row => row.id === f.input.journeyId && row.targetProjectId === f.input.targetProjectId,
    )
    expect(beforeJourneys).toHaveLength(1)
    const expectedReplay = structuredClone(before)
    const expectedJourneys = expectedReplay[0].filter(
      row => row.id === f.input.journeyId && row.targetProjectId === f.input.targetProjectId,
    )
    expect(expectedJourneys).toHaveLength(1)
    expectedJourneys[0].ownershipVersion = beforeJourneys[0].ownershipVersion + 1
    await start(f)
    const afterPublicReplay = await snapshot(f)
    const afterJourneys = afterPublicReplay[0].filter(
      row => row.id === f.input.journeyId && row.targetProjectId === f.input.targetProjectId,
    )
    expect(afterJourneys).toHaveLength(1)
    expect(afterJourneys[0].ownershipVersion).toBe(beforeJourneys[0].ownershipVersion + 1)
    expect(afterPublicReplay).toEqual(expectedReplay)
    const row = await f.db.qualityJourneyExecutionCycle.findFirstOrThrow(),
      c = f.credentials
    await f.db.$transaction(async tx => {
      const request = await resolveExecutionCycleUseRequestInTransaction(tx, {
        scope: {
          journeyId: c.journeyId,
          targetProjectId: c.targetProjectId,
          coordinatorSessionId: c.coordinatorSessionId,
          generation: c.coordinatorGeneration,
          credentials: c,
        },
        executionCycleId: row.id,
        preparedCapsulesHash: row.preparedCapsulesHash,
      })
      await validateActiveSharedResourceUseInTransaction(tx, request)
    })
    expect(await snapshot(f)).toEqual(afterPublicReplay)
  })
  it('O3 later current generation cannot resurrect the same deterministic execution-cycle Use', async () => {
    const f = await fixture()
    isolateUnqualifiedPreflight()
    await start(f)
    f.credentials = await f.session(2)
    const before = await snapshot(f)
    starts.mockClear()
    await expect(start(f)).rejects.toThrow('Shared resource Use')
    expect(await snapshot(f)).toEqual(before)
    expect(starts).not.toHaveBeenCalled()
  })
  it.each(['missing', 'released', 'partial', 'extra', 'wrong-source', 'wrong-generation'] as const)(
    'O3 refuses retained same-cycle %s without repair',
    async variant => {
      const f = await fixture()
      isolateUnqualifiedPreflight()
      await seedRetainedReplay(f, variant)
      const before = await snapshot(f)
      await expect(start(f)).rejects.toThrow()
      expect(await snapshot(f)).toEqual(before)
      expect(starts).not.toHaveBeenCalled()
    },
  )
  it.each([
    'prepared',
    'proof',
    'artifact',
    'binding',
    'scenario',
    'locator',
    'definition',
    'missing-proof',
    'authorization',
    'effects',
  ] as const)('O4 corrupt %s refuses before run publication', async variant => {
    const f = await fixture(
      true,
      ['prepared', 'proof', 'artifact', 'binding', 'scenario', 'definition', 'missing-proof', 'authorization'].includes(
        variant,
      )
        ? (variant as FixtureFault)
        : undefined,
    )
    isolateUnqualifiedPreflight()
    if (variant === 'locator') await f.db.locator.update({ where: { id: f.locator.id }, data: { value: '#changed' } })
    const client =
      variant === 'effects'
        ? observedClient(f.db, async event => {
            if (
              event.model === 'qualityJourneyExecutionCycle' &&
              event.operation === 'create' &&
              event.phase === 'before'
            ) {
              const data = event.args.data as Record<string, unknown>,
                frozen = JSON.parse(data.preparedCapsulesJson as string)
              frozen[0].harmless = !frozen[0].harmless
              data.preparedCapsulesJson = json(frozen)
              data.preparedCapsulesHash = hashQualityJourneyExecutionValue(frozen)
            }
          })
        : f.db
    const before = await snapshot(f)
    await expect(start(f, client)).rejects.toThrow()
    expect(await snapshot(f)).toEqual(before)
    expect(starts).not.toHaveBeenCalled()
  })
  it('O5 same-byte group reparenting after plan resolution is caught by full descriptor reread and rolls back', async () => {
    const f = await fixture()
    isolateUnqualifiedPreflight()
    let changed = false
    const before = await snapshot(f)
    await expect(
      start(
        f,
        observedClient(f.db, async event => {
          if (
            !changed &&
            event.model === 'qualityJourneySharedResourceCoverage' &&
            event.operation === 'findUnique' &&
            event.phase === 'before'
          ) {
            changed = true
            await event.tx.locatorGroup.update({ where: { id: f.group.id }, data: { moduleId: f.alternateModule.id } })
          }
        }),
      ),
    ).rejects.toThrow()
    expect(changed).toBe(true)
    expect(await snapshot(f)).toEqual(before)
  })
  it.each(['coverage', 'guard'] as const)('O5 refuses incomplete %s with no partial reservation', async variant => {
    const f = await fixture(true, variant)
    isolateUnqualifiedPreflight()
    const before = await snapshot(f)
    await expect(start(f)).rejects.toThrow()
    expect(await snapshot(f)).toEqual(before)
  })
  it.each(['acquisition', 'claim', 'activation', 'after-activation', 'binding', 'lifecycle'] as const)(
    'O6 actual-owner %s failure rolls back every tentative write',
    async phase => {
      const f = await fixture(false)
      isolateUnqualifiedPreflight()
      const waiting = await start(f)
      if (!('consentRequired' in waiting)) throw Error('Synthetic consent request missing')
      const requested = waiting.consentRequired
      await grantQualityJourneyExecutionConsent(
        {
          journeyId: f.input.journeyId,
          targetProjectId: f.input.targetProjectId,
          executionConsentId: requested.executionConsentId,
          expectedScopeHash: requested.scopeHash,
        },
        f.db,
        f.credentials,
      )
      const authorizedInput = { ...f.input, executionConsentId: requested.executionConsentId }
      const before = await snapshot(f)
      let injected = false
      const checkpoints = {
        acquisition: ['qualityJourneySharedResourceCoverage', 'updateMany', 'before'],
        claim: ['qualityJourneySharedResourceClaim', 'create', 'after'],
        activation: ['qualityJourneySharedResourceUse', 'updateMany', 'after'],
        'after-activation': ['testRun', 'create', 'before'],
        binding: ['qualityJourneyExecutionTestRun', 'create', 'after'],
        lifecycle: ['qualityJourneyEvent', 'create', 'after'],
      }
      const checkpoint = checkpoints[phase]
      await expect(
        startQualityJourneyExecution(
          authorizedInput,
          observedClient(f.db, event => {
            if (
              !injected &&
              event.model === checkpoint[0] &&
              event.operation === checkpoint[1] &&
              event.phase === checkpoint[2]
            ) {
              injected = true
              throw Error(`R06_INJECT_${phase}`)
            }
          }),
          f.credentials,
        ),
      ).rejects.toThrow(`R06_INJECT_${phase}`)
      expect(injected).toBe(true)
      expect(await snapshot(f)).toEqual(before)
      expect(starts).not.toHaveBeenCalled()
    },
  )
  it('O6 rerun proposal finalization failure rolls back lifecycle, source, Use and run publication together', async () => {
    const f = await fixture()
    isolateUnqualifiedPreflight()
    await start(f)
    const predecessor = await f.db.qualityJourneyExecutionCycle.findFirstOrThrow()
    const input = await rerunInput(f, predecessor.id)
    const before = await snapshot(f)
    starts.mockClear()
    let injected = false
    await expect(
      startQualityJourneyRerun(
        input,
        observedClient(f.db, event => {
          if (
            event.model === 'qualityJourneyExecutionRerunProposal' &&
            event.operation === 'update' &&
            event.phase === 'after'
          ) {
            injected = true
            throw Error('R06_PROPOSAL_FINALIZATION')
          }
        }),
        f.credentials,
      ),
    ).rejects.toThrow('R06_PROPOSAL_FINALIZATION')
    expect(injected).toBe(true)
    expect(await snapshot(f)).toEqual(before)
    expect(starts).not.toHaveBeenCalled()
  })
  it('O1 retains original caller credentials when the supplied object mutates after the first await', async () => {
    const f = await fixture()
    isolateUnqualifiedPreflight()
    const supplied = { ...f.credentials }
    let changed = false
    await startQualityJourneyExecution(
      f.input,
      observedClient(f.db, event => {
        if (!changed && event.phase === 'before') {
          changed = true
          supplied.coordinatorSessionId = f.id('foreign')
          supplied.coordinatorGeneration = 99
          supplied.coordinatorPrincipalId = f.id('foreign-principal')
        }
      }),
      supplied,
    )
    const use = await f.db.qualityJourneySharedResourceUse.findFirstOrThrow()
    expect(changed).toBe(true)
    expect(use.coordinatorSessionId).toBe(f.credentials.coordinatorSessionId)
    expect(use.generation).toBe(1)
  })
  it('O4 actual SQLite rejects inconsistent producer-session generation at original binding insertion', async ({
    task,
  }) => {
    const observed = await fixture(true, 'producer').then(
      () => {
        throw new Error('R06_PRODUCER_DIFFERENTIAL_OBSERVATION_MISSING')
      },
      (error: unknown) => {
        if (!(error instanceof ProducerGenerationDifferentialObservation)) throw error
        return error
      },
    )
    expect(observed).toBeInstanceOf(ProducerGenerationDifferentialObservation)
    expect(observed.observation).toMatchObject({
      kind: 'R06_TEST_OWNED_PRODUCER_GENERATION_DIFFERENTIAL_V1',
      validBeforeRolledBack: true,
      invalidCreateRejected: true,
      invalidCreateAdmitted: false,
      invalidTransactionRolledBack: true,
      validAfterRolledBack: true,
      persistedBindings: 0,
      persistedTestRuns: 0,
      persistedExecutionCycles: 0,
      persistedUses: 0,
      adapterStarts: 0,
    })
    Object.assign(task.meta, { r06ProducerGenerationDifferential: observed.observation })
    const db = clients.at(-1)!
    expect(await db.qualityJourneyWorkAttemptSessionBinding.count()).toBe(0)
    expect(await db.testRun.count()).toBe(0)
    expect(await db.qualityJourneyExecutionCycle.count()).toBe(0)
    expect(await db.qualityJourneySharedResourceUse.count()).toBe(0)
    expect(starts).not.toHaveBeenCalled()
  })
  it('O4 rejects duplicate frozen prepared identities before any TestRun or Use can commit', async () => {
    const f = await fixture()
    isolateUnqualifiedPreflight()
    const before = await snapshot(f)
    await expect(
      start(
        f,
        observedClient(f.db, async event => {
          if (
            event.model === 'qualityJourneyExecutionCycle' &&
            event.operation === 'create' &&
            event.phase === 'before'
          ) {
            const data = event.args.data as Record<string, unknown>,
              frozen = JSON.parse(data.preparedCapsulesJson as string)
            frozen.push(frozen[0])
            data.preparedCapsulesJson = json(frozen)
            data.preparedCapsulesHash = hashQualityJourneyExecutionValue(frozen)
          }
        }),
      ),
    ).rejects.toThrow()
    expect(await snapshot(f)).toEqual(before)
  })
  it('O4 frozen definition readiness is checked independently of immutable definition content hashes', async () => {
    const f = await fixture()
    isolateUnqualifiedPreflight()
    await start(f)
    const cycle = await f.db.qualityJourneyExecutionCycle.findFirstOrThrow(),
      c = f.credentials
    await f.db.stepDefinition.update({
      where: { id_version: { id: f.definition.identity.id, version: f.definition.identity.version } },
      data: { status: 'deprecated' },
    })
    const before = await snapshot(f)
    await expect(
      f.db.$transaction(tx =>
        resolveExecutionCycleUseRequestInTransaction(tx, {
          scope: {
            journeyId: c.journeyId,
            targetProjectId: c.targetProjectId,
            coordinatorSessionId: c.coordinatorSessionId,
            generation: c.coordinatorGeneration,
            credentials: c,
          },
          executionCycleId: cycle.id,
          preparedCapsulesHash: cycle.preparedCapsulesHash,
        }),
      ),
    ).rejects.toThrow('Shared resource Use')
    expect(await snapshot(f)).toEqual(before)
  })
  it('O4 a rerun cannot substitute a different frozen version for the terminal predecessor selection', async () => {
    const f = await fixture()
    isolateUnqualifiedPreflight()
    await start(f)
    const predecessor = await f.db.qualityJourneyExecutionCycle.findFirstOrThrow()
    const input = await rerunInput(f, predecessor.id)
    const before = await snapshot(f)
    starts.mockClear()
    await expect(
      startQualityJourneyRerun(
        input,
        observedClient(f.db, event => {
          if (
            event.model === 'qualityJourneyExecutionCycle' &&
            event.operation === 'create' &&
            event.phase === 'before'
          ) {
            const data = event.args.data as Record<string, unknown>,
              frozen = JSON.parse(data.preparedCapsulesJson as string)
            frozen[0].capsuleHash = H('unapproved-frozen-version')
            data.preparedCapsulesJson = json(frozen)
            data.preparedCapsulesHash = hashQualityJourneyExecutionValue(frozen)
          }
        }),
        f.credentials,
      ),
    ).rejects.toThrow('Shared resource Use')
    expect(await snapshot(f)).toEqual(before)
    expect(starts).not.toHaveBeenCalled()
  })
  it('O4 missing selected prepared rows cannot be filtered into a partial initial reservation', async () => {
    const f = await fixture()
    isolateUnqualifiedPreflight()
    const before = await snapshot(f)
    await expect(
      startQualityJourneyExecution(
        { ...f.input, preparedRuntimeCapsuleIds: [f.id('missing-prepared')] },
        f.db,
        f.credentials,
      ),
    ).rejects.toThrow()
    expect(await snapshot(f)).toEqual(before)
    expect(starts).not.toHaveBeenCalled()
  })
  it('O5 an unsupported execution-source client refuses instead of falling back to a legacy or partial plan', async () => {
    const f = await fixture()
    isolateUnqualifiedPreflight()
    await start(f)
    const cycle = await f.db.qualityJourneyExecutionCycle.findFirstOrThrow(),
      c = f.credentials
    await expect(
      f.db.$transaction(tx => {
        const incomplete = new Proxy(tx, {
          get(actual, key) {
            if (key === 'qualityJourneyCycle') return { ...actual.qualityJourneyCycle, findUnique: undefined }
            return Reflect.get(actual, key, actual)
          },
        }) as Prisma.TransactionClient
        return resolveExecutionCycleUseRequestInTransaction(incomplete, {
          scope: {
            journeyId: c.journeyId,
            targetProjectId: c.targetProjectId,
            coordinatorSessionId: c.coordinatorSessionId,
            generation: c.coordinatorGeneration,
            credentials: c,
          },
          executionCycleId: cycle.id,
          preparedCapsulesHash: cycle.preparedCapsulesHash,
        })
      }),
    ).rejects.toThrow('Shared resource Use')
  })
  it('O7 retirement-first serialization blocks the actual reservation admission', async () => {
    const f = await fixture()
    isolateUnqualifiedPreflight()
    await retirement(f, 'retire-first')
    const before = await snapshot(f)
    await expect(start(f)).rejects.toThrow('business admission retired')
    expect(await snapshot(f)).toEqual(before)
  })
  it('O7 reservation-first serialization commits exact Use/runs before retirement and does not release them', async () => {
    const f = await fixture()
    isolateUnqualifiedPreflight()
    await start(f)
    const use = await f.db.qualityJourneySharedResourceUse.findFirstOrThrow()
    await retirement(f, 'retire-after')
    expect(await f.db.qualityJourneySharedResourceUse.findUnique({ where: { id: use.id } })).toEqual(use)
    expect(await f.db.qualityJourneyExecutionTestRun.count()).toBe(1)
    expect((await f.db.qualityJourneyE2Retirement.findFirstOrThrow()).state).toBe('RETIRE_REQUESTED')
  })
})

describe('R06 unchanged actual production refusal and consent boundaries', () => {
  it('O8 actual public E2 fresh start refuses UNSUPPORTED_E2_INVALIDATION with zero adapter starts', async () => {
    const f = await fixture()
    const before = await snapshot(f)
    await expect(start(f)).rejects.toMatchObject({ details: { reason: 'UNSUPPORTED_E2_INVALIDATION' } })
    expect(await snapshot(f)).toEqual(before)
    expect(starts).not.toHaveBeenCalled()
  })
  it('O8 actual public E2 rerun and effectful replay refuse before adapter entry', async () => {
    const f = await fixture()
    isolateUnqualifiedPreflight()
    await start(f)
    const predecessor = await f.db.qualityJourneyExecutionCycle.findFirstOrThrow()
    vi.mocked(assertJourneyBusinessGroupSupportsNoInvalidationInTransaction).mockImplementation(actualFence)
    starts.mockClear()
    await expect(start(f)).rejects.toThrow('E2 mixed invalidation')
    const input = await rerunInput(f, predecessor.id)
    const before = await snapshot(f)
    await expect(startQualityJourneyRerun(input, f.db, f.credentials)).rejects.toThrow('E2 mixed invalidation')
    expect(await snapshot(f)).toEqual(before)
    expect(starts).not.toHaveBeenCalled()
  })
  it('O8 proven all-null legacy enrollment keeps reservation/run behavior and creates no shared Use', async () => {
    const f = await fixture(true, undefined, false)
    await start(f)
    expect(await f.db.qualityJourneyExecutionCycle.count()).toBe(1)
    expect(await f.db.testRun.count()).toBe(1)
    expect(await f.db.qualityJourneySharedResourceUse.count()).toBe(0)
    expect(await f.db.qualityJourneySharedResourceClaim.count()).toBe(0)
    expect(starts).toHaveBeenCalledTimes(1)
  })
  it('O8 consent wait publishes no cycle/Use/run and does not invoke the adapter', async () => {
    const f = await fixture(false)
    const result = await start(f)
    expect(result).toHaveProperty('consentRequired')
    expect(await f.db.qualityJourneyExecutionCycle.count()).toBe(0)
    expect(await f.db.qualityJourneySharedResourceUse.count()).toBe(0)
    expect(await f.db.testRun.count()).toBe(0)
    expect(starts).not.toHaveBeenCalled()
  })
})
