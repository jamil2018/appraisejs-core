/**
 * Synthetic R07/R08 retained source capture on fresh disposable SQLite only.
 * Only the no-invalidation production preflight is substituted for reservation setup.
 * Pure compiler observers call their real functions; command sealing stops at an explicit sentinel.
 * Actual owner, credentials, admission/retirement, source/descriptor reconstruction,
 * Use/claim acquisition and Prisma transaction/rollback remain real.
 * This does not qualify production admission, dispatch, runtime or a provider.
 */
import { randomUUID, createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient, type Prisma, type QualityJourneySharedResourceGuard } from '@prisma/client'
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
import {
  sharedResourceKinds,
  sharedResourceBounds,
  nextSharedResourceEpoch,
  sharedClaimSetDigest,
  isSharedResourceDigest,
} from '@/lib/quality-journey/shared-resource-contract'
import { defaultOperationDefinitions } from '@/lib/operation-catalog'
import {
  builtInStepDefinitions,
  computeStepDefinitionHashes,
  computeStepReferenceHash,
  computeStepExecutableReadiness,
  stepDefinitionContentHash,
  stepPublicationReceiptSchema,
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
} from './quality-journey-execution-service'
import { validateRetainedExecutionUseForTestRunInTransaction } from './quality-journey-shared-resource-use-service'
import { loadJourneyCapsuleSource } from '@/lib/runtime-capsule/journey-source'
import { RuntimeCapsuleMaterializer } from '@/lib/runtime-capsule/materializer'
import { generateReviewedFeature } from '@/lib/runtime-capsule/file-generator'
import { generateExecutableBindings } from '@/lib/runtime-capsule/binding-generator'
import { sealCapsuleCommandReceipt } from '@/lib/runtime-capsule/command-receipt-sealer'

vi.mock('@/lib/runtime-capsule/file-generator', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/runtime-capsule/file-generator')>()
  return { ...actual, generateReviewedFeature: vi.fn(actual.generateReviewedFeature) }
})
vi.mock('@/lib/runtime-capsule/binding-generator', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/runtime-capsule/binding-generator')>()
  return { ...actual, generateExecutableBindings: vi.fn(actual.generateExecutableBindings) }
})
vi.mock('@/lib/runtime-capsule/command-receipt-sealer', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/runtime-capsule/command-receipt-sealer')>()
  return {
    ...actual,
    sealCapsuleCommandReceipt: vi.fn(async () => {
      throw new Error('SYNTHETIC_STOP_AFTER_PURE_COMPILER')
    }),
  }
})

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
  vi.mocked(generateReviewedFeature).mockClear()
  vi.mocked(generateExecutableBindings).mockClear()
  vi.mocked(sealCapsuleCommandReceipt).mockClear()
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
async function fixture(
  harmless = true,
  fault?: FixtureFault,
  enrolled = true,
  legacyRepresentation: 'SESSION' | 'NO_SESSION' | 'RICH' = 'SESSION',
) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-r07-r08-synthetic-'))
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
  const registryManifestHash = H('synthetic-registry'),
    conformanceRunId = id('conformance')
  const receipt = stepPublicationReceiptSchema.parse({
    step: definition.identity,
    ...hashes,
    registryManifestHash,
    executableReadiness: computeStepExecutableReadiness(definition, registryManifestHash, conformanceRunId),
    conformanceRunId,
    reviewAuthority: 'SYNTHETIC_TEST_ONLY',
    publishedAt: at.toISOString(),
  })
  const storedReceipt = await db.stepPublicationReceipt.create({
    data: {
      stepId: receipt.step.id,
      stepVersion: receipt.step.version,
      receiptJson: json(receipt),
      receiptHash: stepDefinitionContentHash(receipt),
      registryManifestHash: receipt.registryManifestHash,
      conformanceRunId: receipt.conformanceRunId,
      reviewAuthority: receipt.reviewAuthority,
      publishedAt: new Date(receipt.publishedAt),
    },
  })
  const parsedStoredReceipt = stepPublicationReceiptSchema.parse(JSON.parse(storedReceipt.receiptJson))
  expect(parsedStoredReceipt).toEqual(receipt)
  expect(parsedStoredReceipt.step).toEqual({ id: definition.identity.id, version: definition.identity.version })
  expect(storedReceipt.receiptHash).toBe(stepDefinitionContentHash(parsedStoredReceipt))
  expect(storedReceipt).toMatchObject({
    stepId: parsedStoredReceipt.step.id,
    stepVersion: parsedStoredReceipt.step.version,
    registryManifestHash: parsedStoredReceipt.registryManifestHash,
    conformanceRunId: parsedStoredReceipt.conformanceRunId,
    reviewAuthority: parsedStoredReceipt.reviewAuthority,
    publishedAt: new Date(parsedStoredReceipt.publishedAt),
  })
  const invocationJson = json({
    step: { id: definition.identity.id, version: definition.identity.version, definitionHash: referenceHash },
    inputs: { target: locator.id },
  })
  const step = {
    order: 0,
    gherkinStep: 'Then the synthetic element is visible',
    icon: 'VALIDATION' as const,
    label: 'Synthetic only',
    invocationJson,
  }
  await db.testCaseStep.create({ data: { id: id('step'), testCaseId: testCase.id, ...step } })
  const bindingPacket = {
    schemaVersion: 'appraise.quality-journey/v1' as const,
    targetProjectId,
    moduleId: fixtureModule.id,
    suite: { id: suite.id, name: suite.name, description: suite.description },
    testCase: { id: testCase.id, title: testCase.title, description: testCase.description, steps: [step] },
  }
  const rawResources = [
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
  const resources =
    legacyRepresentation === 'RICH'
      ? rawResources.map(resource => ({
          ...resource,
          kind: resource.id.startsWith('step:')
            ? 'STEP_DEFINITION'
            : resource.id.startsWith('operation:')
              ? 'OPERATION'
              : resource.id.startsWith('locator:')
                ? 'LOCATOR'
                : 'MODULE',
          sourceTargetProjectId:
            resource.id.startsWith('step:') || resource.id.startsWith('operation:') ? null : targetProjectId,
        }))
      : rawResources
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
  await db.qualityJourneyWorkAttemptSessionBinding.create({
    data: {
      attemptId: attempt.id,
      journeyId,
      targetProjectId,
      sessionId: legacyRepresentation === 'NO_SESSION' ? null : credentials.coordinatorSessionId,
      coordinatorGeneration: legacyRepresentation === 'NO_SESSION' ? null : fault === 'producer' ? 2 : 1,
      assignmentGeneration: attempt.assignmentGeneration,
      workItemId: work.id,
      role: 'AUTOMATOR',
      authorizationId: authorization.id,
      leaseId: attempt.leaseId,
      inputHash: work.inputHash,
      provenance: legacyRepresentation === 'NO_SESSION' ? 'CLAIM_EXPLICIT_LEGACY_NO_SESSION_V1' : 'CLAIM_SESSION_V1',
    },
  })
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
    locatorRequirements: [{ requirementId: id('locator-requirement'), parameterName: 'target', locatorId: locator.id }],
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
function observedClient(
  db: PrismaClient,
  hook: Hook,
  onTransaction: () => void = () => undefined,
  onLifecycle: (phase: 'open' | 'fulfilled' | 'rejected') => void = () => undefined,
): PrismaClient {
  return new Proxy(db, {
    get(target, key) {
      if (key !== '$transaction') return Reflect.get(target, key, target)
      return (body: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
        onTransaction()
        return db
          .$transaction(
            async raw => {
              onLifecycle('open')
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
          .then(
            result => {
              onLifecycle('fulfilled')
              return result
            },
            error => {
              onLifecycle('rejected')
              throw error
            },
          )
      }
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

const writeOperation = /^(?:create|update|delete|upsert|executeRaw)/
async function reserved(
  enrolled = true,
  legacyRepresentation: 'SESSION' | 'NO_SESSION' | 'RICH' = 'SESSION',
  fault?: FixtureFault,
) {
  const f = await fixture(true, fault, enrolled, legacyRepresentation)
  isolateUnqualifiedPreflight()
  await start(f)
  const cycle = await f.db.qualityJourneyExecutionCycle.findFirstOrThrow({ where: { journeyId: f.input.journeyId } })
  const reservation = { executionCycleId: cycle.id }
  vi.mocked(assertJourneyBusinessGroupSupportsNoInvalidationInTransaction).mockImplementation(actualFence)
  const binding = await f.db.qualityJourneyExecutionTestRun.findFirstOrThrow({
    where: { executionCycleId: reservation.executionCycleId! },
  })
  return { ...f, reservation, testRunId: binding.testRunId }
}
type Reserved = Awaited<ReturnType<typeof reserved>>
/** Synthetic fixture terminal-state seed only: no production release/physical terminality qualification. */
async function seedSyntheticReleasedExecutionUse(
  db: PrismaClient,
  scope: {
    journeyId: string
    targetProjectId: string
    sourceOwnerId: string
    testRunId: string
  },
) {
  await db.$transaction(async tx => {
    const retained = await validateRetainedExecutionUseForTestRunInTransaction(tx, scope.testRunId)
    if (retained.protection !== 'PROTECTED_E2' || retained.executionIdentity.resourceUse.kind !== 'E2_RETAINED_USE')
      throw new Error('SYNTHETIC_TERMINAL_SEED_REQUIRES_ACTUAL_RETAINED_ACTIVE_USE')
    const identity = retained.executionIdentity.resourceUse
    const matches = await tx.qualityJourneySharedResourceUse.findMany({
      where: {
        journeyId: scope.journeyId,
        targetProjectId: scope.targetProjectId,
        sourceKind: 'EXECUTION_CYCLE',
        sourceOwnerId: scope.sourceOwnerId,
      },
    })
    expect(matches).toHaveLength(1)
    const use = matches[0]!
    expect(use).toMatchObject({
      id: identity.useId,
      journeyId: scope.journeyId,
      targetProjectId: scope.targetProjectId,
      sourceKind: 'EXECUTION_CYCLE',
      sourceOwnerId: scope.sourceOwnerId,
      state: 'ACTIVE',
      sourceDigest: identity.sourceDigest,
      dependencyDigest: identity.dependencyDigest,
      claimSetDigest: identity.claimSetDigest,
      claimSetCount: identity.claimSetCount,
      coordinatorSessionId: identity.coordinatorSessionId,
      generation: identity.generation,
      releasedAt: null,
      releaseEvidenceDigest: null,
      releaseReason: null,
    })
    expect(identity.sourceOwnerId).toBe(scope.sourceOwnerId)
    expect(Number.isSafeInteger(use.version) && use.version >= 0).toBe(true)
    const version = nextSharedResourceEpoch(use.version)
    const claims = await tx.qualityJourneySharedResourceClaim.findMany({
      where: { useId: use.id },
      orderBy: [{ kind: 'asc' }, { resourceId: 'asc' }],
    })
    expect(claims).toHaveLength(use.claimSetCount)
    expect(claims.length).toBeGreaterThan(0)
    expect(claims.length).toBeLessThanOrEqual(sharedResourceBounds.keys)
    expect(new Set(claims.map(claim => json([claim.kind, claim.resourceId]))).size).toBe(claims.length)
    expect(
      sharedClaimSetDigest(
        claims.map(claim => ({
          claimId: claim.id,
          kind: claim.kind as (typeof sharedResourceKinds)[number],
          resourceId: claim.resourceId,
          dependencyDigest: claim.dependencyDigest,
        })),
      ),
    ).toBe(use.claimSetDigest)
    const transitions: {
      claim: (typeof claims)[number]
      guard: QualityJourneySharedResourceGuard
      releaseEpoch: number
    }[] = []
    for (const claim of claims) {
      expect(claim).toMatchObject({
        useId: use.id,
        journeyId: use.journeyId,
        targetProjectId: use.targetProjectId,
        state: 'ACTIVE',
        releaseEpoch: null,
        releasedAt: null,
        releaseEvidenceDigest: null,
        releaseReason: null,
      })
      expect(sharedResourceKinds as readonly string[]).toContain(claim.kind)
      expect(isSharedResourceDigest(claim.id) && isSharedResourceDigest(claim.dependencyDigest)).toBe(true)
      expect(
        Number.isSafeInteger(claim.claimEpoch) &&
          claim.claimEpoch >= 0 &&
          claim.claimEpoch <= sharedResourceBounds.epoch,
      ).toBe(true)
      const guard = await tx.qualityJourneySharedResourceGuard.findUniqueOrThrow({
        where: {
          targetProjectId_kind_resourceId: {
            targetProjectId: claim.targetProjectId,
            kind: claim.kind,
            resourceId: claim.resourceId,
          },
        },
      })
      expect(guard).toMatchObject({
        targetProjectId: claim.targetProjectId,
        kind: claim.kind,
        resourceId: claim.resourceId,
        coverageState: 'COMPLETE_V1',
        resourceState: 'LIVE',
        deletedAt: null,
      })
      expect(isSharedResourceDigest(guard.coverageDigest)).toBe(true)
      expect(Number.isSafeInteger(guard.epoch) && guard.epoch >= claim.claimEpoch).toBe(true)
      const releaseEpoch = nextSharedResourceEpoch(guard.epoch)
      expect(releaseEpoch).toBeGreaterThan(claim.claimEpoch)
      transitions.push({ claim, guard, releaseEpoch })
    }
    const stableRows = () =>
      Promise.all([
        tx.targetProject.findMany(),
        tx.environment.findMany(),
        tx.qualityJourney.findMany(),
        tx.qualityJourneyCycle.findMany(),
        tx.qualityJourneyExecutionCycle.findMany(),
        tx.qualityJourneyExecutionConsent.findMany(),
        tx.testRun.findMany(),
        tx.testRunTestCase.findMany(),
        tx.qualityJourneyExecutionTestRun.findMany(),
        tx.qualityJourneyExecutionRerunProposal.findMany(),
        tx.qualityJourneyCommand.findMany(),
        tx.qualityJourneyEvent.findMany(),
        tx.locator.findMany(),
        tx.locatorGroup.findMany(),
        tx.module.findMany(),
        tx.testCase.findMany(),
        tx.testCaseStep.findMany(),
        tx.testSuite.findMany(),
        tx.stepDefinition.findMany(),
        tx.stepPublicationReceipt.findMany(),
        tx.qualityJourneyAnalysisDecision.findMany(),
        tx.qualityJourneyAnalysisRevision.findMany(),
        tx.qualityJourneyArtifact.findMany(),
        tx.qualityJourneyAutomationMaterialization.findMany(),
        tx.qualityJourneyAutomationMaterializationBinding.findMany(),
        tx.qualityJourneyAutomationMaterializationSourceProof.findMany(),
        tx.qualityJourneyAutomationTargetBinding.findMany(),
        tx.qualityJourneyCoordinatorSession.findMany(),
        tx.qualityJourneyDiscoveryRevision.findMany(),
        tx.qualityJourneyE2CampaignPolicy.findMany(),
        tx.qualityJourneyE2Retirement.findMany(),
        tx.qualityJourneyPreparedRuntimeCapsule.findMany(),
        tx.qualityJourneyScenarioDecision.findMany(),
        tx.qualityJourneyScenarioPortfolioRevision.findMany(),
        tx.qualityJourneyScenarioRevision.findMany(),
        tx.qualityJourneySharedResourceCoverage.findMany(),
        tx.qualityJourneyWorkAttempt.findMany(),
        tx.qualityJourneyWorkAttemptSessionBinding.findMany(),
        tx.qualityJourneyWorkAuthorization.findMany(),
        tx.qualityJourneyWorkItem.findMany(),
        tx.runtimeCapsule.findMany(),
        tx.runtimeCapsuleExecutionAttempt.findMany(),
      ])
    const stableBefore = await stableRows()
    const allUsesBefore = await tx.qualityJourneySharedResourceUse.findMany({ orderBy: { id: 'asc' } })
    const allClaimsBefore = await tx.qualityJourneySharedResourceClaim.findMany({ orderBy: { id: 'asc' } })
    const allGuardsBefore = await tx.qualityJourneySharedResourceGuard.findMany({
      orderBy: [{ targetProjectId: 'asc' }, { kind: 'asc' }, { resourceId: 'asc' }],
    })
    const releasedAt = at,
      releaseReason = 'SYNTHETIC_FIXTURE_TERMINAL_SEED_ONLY'
    const releaseEvidenceDigest = D(
      json({
        kind: 'SYNTHETIC_TEST_TERMINAL_SEED_V1',
        use: {
          id: use.id,
          journeyId: use.journeyId,
          targetProjectId: use.targetProjectId,
          sourceKind: use.sourceKind,
          sourceOwnerId: use.sourceOwnerId,
          sourceDigest: use.sourceDigest,
          dependencyDigest: use.dependencyDigest,
          claimSetDigest: use.claimSetDigest,
          claimSetCount: use.claimSetCount,
          coordinatorSessionId: use.coordinatorSessionId,
          generation: use.generation,
          version: use.version,
        },
        releasedAt: releasedAt.toISOString(),
        releaseReason,
        transitions: transitions.map(({ claim, guard, releaseEpoch }) => ({
          claimId: claim.id,
          kind: claim.kind,
          resourceId: claim.resourceId,
          dependencyDigest: claim.dependencyDigest,
          claimEpoch: claim.claimEpoch,
          guardEpoch: guard.epoch,
          coverageDigest: guard.coverageDigest,
          releaseEpoch,
        })),
      }),
    )
    expect(isSharedResourceDigest(releaseEvidenceDigest)).toBe(true)
    const release = { state: 'RELEASED', releasedAt, releaseEvidenceDigest, releaseReason }
    for (const { claim, guard, releaseEpoch } of transitions) {
      const advanced = await tx.qualityJourneySharedResourceGuard.updateMany({
        where: { ...guard },
        data: { epoch: releaseEpoch },
      })
      expect(advanced.count).toBe(1)
      const released = await tx.qualityJourneySharedResourceClaim.updateMany({
        where: { ...claim },
        data: { ...release, releaseEpoch },
      })
      expect(released.count).toBe(1)
    }
    const releasedUse = await tx.qualityJourneySharedResourceUse.updateMany({
      where: { ...use },
      data: { ...release, version },
    })
    expect(releasedUse.count).toBe(1)
    const allUsesAfter = await tx.qualityJourneySharedResourceUse.findMany({ orderBy: { id: 'asc' } })
    const allClaimsAfter = await tx.qualityJourneySharedResourceClaim.findMany({ orderBy: { id: 'asc' } })
    const allGuardsAfter = await tx.qualityJourneySharedResourceGuard.findMany({
      orderBy: [{ targetProjectId: 'asc' }, { kind: 'asc' }, { resourceId: 'asc' }],
    })
    expect(allUsesAfter).toEqual(allUsesBefore.map(row => (row.id === use.id ? { ...row, ...release, version } : row)))
    expect(allClaimsAfter).toEqual(
      allClaimsBefore.map(row => {
        const changed = transitions.find(item => item.claim.id === row.id)
        return changed ? { ...row, ...release, releaseEpoch: changed.releaseEpoch } : row
      }),
    )
    expect(allGuardsAfter).toEqual(
      allGuardsBefore.map(row => {
        const changed = transitions.find(
          item =>
            item.guard.targetProjectId === row.targetProjectId &&
            item.guard.kind === row.kind &&
            item.guard.resourceId === row.resourceId,
        )
        return changed ? { ...row, epoch: changed.releaseEpoch } : row
      }),
    )
    expect(await stableRows()).toEqual(stableBefore)
    const releasedClaims = allClaimsAfter.filter(row => row.useId === use.id)
    expect(releasedClaims).toHaveLength(use.claimSetCount)
    for (const claim of releasedClaims) {
      expect(claim).toMatchObject(release)
      expect(claim.releaseEpoch).toBeGreaterThan(claim.claimEpoch)
      const guard = allGuardsAfter.find(
        row =>
          row.targetProjectId === claim.targetProjectId &&
          row.kind === claim.kind &&
          row.resourceId === claim.resourceId,
      )!
      expect(claim.releaseEpoch).toBe(guard.epoch) // Chosen coherent test seed, not an asserted production release rule.
    }
  })
}
async function releaseFixtureUse(f: Reserved, sourceOwnerId = f.reservation.executionCycleId!) {
  await seedSyntheticReleasedExecutionUse(f.db, {
    journeyId: f.input.journeyId,
    targetProjectId: f.input.targetProjectId,
    sourceOwnerId,
    testRunId: f.testRunId,
  })
}
/** Response-only custom-client corruptions exercise unsupported/corrupt query results.
 * The underlying immutable rows are preserved; actual SQLite paths are tested separately. */
function alteredReadClient(
  db: PrismaClient,
  alter: (model: string, operation: string, value: unknown, args: Record<string, unknown>) => unknown,
): PrismaClient {
  return new Proxy(db, {
    get(target, key) {
      if (key !== '$transaction') return Reflect.get(target, key, target)
      return (body: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        db.$transaction(
          raw => {
            const tx = new Proxy(raw, {
              get(actual, model) {
                const value = Reflect.get(actual, model, actual)
                if (typeof model !== 'string' || model.startsWith('$') || !value || typeof value !== 'object')
                  return value
                return new Proxy(value, {
                  get(delegate, operation) {
                    const method = Reflect.get(delegate, operation, delegate)
                    if (typeof operation !== 'string' || typeof method !== 'function') return method
                    return async (args: Record<string, unknown>) =>
                      alter(model, operation, await Reflect.apply(method, delegate, [args]), args)
                  },
                })
              },
            })
            return body(tx)
          },
          { timeout: 30000 },
        )
    },
  }) as PrismaClient
}

describe('R07/R08 fresh SQLite capture; no-invalidation substituted ONLY for reservation setup', () => {
  it('O1 validates exact run-rooted source in ONE transaction with zero writes or epoch changes', async () => {
    const f = await reserved(),
      before = await snapshot(f),
      queries: string[] = []
    let transactions = 0
    const client = observedClient(
      f.db,
      event => {
        queries.push(`${event.model}.${event.operation}`)
        if (writeOperation.test(event.operation)) throw new Error('READ_CAPTURE_ATTEMPTED_WRITE')
      },
      () => transactions++,
    )
    const source = await loadJourneyCapsuleSource(client, f.testRunId)
    expect(transactions).toBe(1)
    expect(source.sharedResourceProtection).toBe('PROTECTED_E2')
    expect(source.selection[0]!.testCase.title).toBe('Frozen case')
    expect(source.selection[0]!.testCase.steps[0]!.invocation.inputs.target).toBe(f.locator.id)
    expect(queries).toContain('qualityJourneySharedResourceClaim.findMany')
    expect(queries).toContain('qualityJourneySharedResourceCoverage.findUnique')
    expect(await snapshot(f)).toEqual(before)
  })

  it.each([
    'intent',
    'binding-missing',
    'binding-duplicate',
    'binding-runId',
    'foreign-target',
    'environment',
    'snapshot',
    'browser',
    'case-edge',
    'extra-edge',
  ])('O2 refuses exact join corruption %s before returning source bytes', async fault => {
    const f = await reserved()
    const client = alteredReadClient(f.db, (model, operation, value) => {
      if (model === 'testRun' && operation === 'findUnique' && value) {
        const row = value as Record<string, unknown>
        if (fault === 'intent') return { ...row, intent: 'INDEPENDENT' }
        if (fault === 'foreign-target') return { ...row, targetProjectId: f.id('foreign') }
        if (fault === 'environment') return { ...row, environmentId: f.id('foreign-environment') }
        if (fault === 'snapshot') return { ...row, environmentSnapshotHash: H('changed') }
        if (fault === 'browser') return { ...row, browserEngine: 'FIREFOX' }
        if (fault === 'case-edge')
          return {
            ...row,
            testCases: [{ id: 'synthetic-edge', testCaseId: f.id('foreign-case'), testSuiteId: f.suite.id }],
          }
        if (fault === 'extra-edge')
          return { ...row, testCases: [...(row.testCases as unknown[]), ...(row.testCases as unknown[])] }
      }
      if (model === 'qualityJourneyExecutionTestRun' && operation === 'findMany') {
        const rows = value as Record<string, unknown>[]
        if (fault === 'binding-missing') return []
        if (fault === 'binding-duplicate') return [...rows, ...rows]
        if (fault === 'binding-runId') return rows.map(row => ({ ...row, runId: f.id('foreign-run') }))
      }
      return value
    })
    await expect(loadJourneyCapsuleSource(client, f.testRunId)).rejects.toThrow()
  })

  it.each(['wrong-selected', 'duplicate-selection', 'foreign-journey', 'frozen-binding', 'frozen-locator'])(
    'O2/O5 rejects independently hashed frozen selection corruption %s',
    async fault => {
      const f = await reserved()
      const client = alteredReadClient(f.db, (model, operation, value) => {
        if (model !== 'qualityJourneyExecutionCycle' || operation !== 'findUnique' || !value) return value
        const row = value as Record<string, unknown>
        const selection = JSON.parse(row.preparedCapsulesJson as string) as Array<Record<string, unknown>>
        if (fault === 'foreign-journey') return { ...row, journeyId: f.id('foreign-journey') }
        if (fault === 'wrong-selected') selection[0]!.preparedCapsuleId = f.id('not-selected')
        if (fault === 'duplicate-selection') selection.push(structuredClone(selection[0]!))
        if (fault === 'frozen-binding') selection[0]!.targetBindingId = f.id('foreign-binding')
        if (fault === 'frozen-locator')
          selection[0]!.resourceHashes = (
            selection[0]!.resourceHashes as Array<{ id: string; contentHash: string }>
          ).map(resource =>
            resource.id.startsWith('locator:') ? { ...resource, contentHash: H('wrong-locator') } : resource,
          )
        return {
          ...row,
          preparedCapsulesJson: json(selection),
          preparedCapsulesHash: hashQualityJourneyExecutionValue(selection),
        }
      })
      await expect(loadJourneyCapsuleSource(client, f.testRunId)).rejects.toThrow()
    },
  )

  it('O2 refuses a source-loader row swap even when the separately validated join remains sound', async () => {
    const f = await reserved()
    const client = alteredReadClient(f.db, (model, operation, value) => {
      if (model !== 'qualityJourneyExecutionTestRun' || operation !== 'findUniqueOrThrow' || !value) return value
      const owner = value as { executionCycle: Record<string, unknown> }
      return { ...owner, executionCycle: { ...owner.executionCycle, targetFingerprint: H('swapped-included-cycle') } }
    })
    await expect(loadJourneyCapsuleSource(client, f.testRunId)).rejects.toThrow('copied run/cycle rows differ')
  })

  it.each([
    'missing',
    'preparing',
    'source',
    'generation',
    'partial-claims',
    'extra-claims',
    'released-claim',
    'epoch',
    'coverage',
    'guard',
  ])('O3 refuses %s without acquisition/repair', async fault => {
    const f = await reserved(),
      before = await snapshot(f)
    const client = alteredReadClient(f.db, (model, operation, value) => {
      if (model === 'qualityJourneySharedResourceUse' && operation === 'findMany') {
        const rows = value as Record<string, unknown>[]
        if (fault === 'missing') return []
        if (fault === 'preparing') return rows.map(row => ({ ...row, state: 'PREPARING' }))
        if (fault === 'source') return rows.map(row => ({ ...row, sourceDigest: D('wrong') }))
        if (fault === 'generation') return rows.map(row => ({ ...row, generation: 2 }))
      }
      if (model === 'qualityJourneySharedResourceClaim' && operation === 'findMany') {
        const rows = value as Record<string, unknown>[]
        if (fault === 'partial-claims') return rows.slice(1)
        if (fault === 'extra-claims') return [...rows, ...rows.slice(0, 1)]
        if (fault === 'released-claim') return rows.map((row, index) => (index ? row : { ...row, state: 'RELEASED' }))
        if (fault === 'epoch') return rows.map(row => ({ ...row, claimEpoch: 2147483646 }))
      }
      if (model === 'qualityJourneySharedResourceCoverage' && fault === 'coverage') return null
      if (model === 'qualityJourneySharedResourceGuard' && fault === 'guard') return null
      return value
    })
    await expect(loadJourneyCapsuleSource(client, f.testRunId)).rejects.toThrow()
    expect(await snapshot(f)).toEqual(before)
  })

  it('O3 rejects unsupported custom clients and actual same-cycle release, without resurrection', async () => {
    await expect(
      validateRetainedExecutionUseForTestRunInTransaction({} as Prisma.TransactionClient, 'synthetic-run'),
    ).rejects.toThrow()
    const f = await reserved()
    await releaseFixtureUse(f)
    const before = await snapshot(f)
    await expect(loadJourneyCapsuleSource(f.db, f.testRunId)).rejects.toThrow()
    expect(await snapshot(f)).toEqual(before)
  })

  it('O4 accepts old frozen producer/new cycle+session with old released Use unchanged', async () => {
    const f = await reserved()
    await releaseFixtureUse(f)
    const old = await f.db.qualityJourneySharedResourceUse.findMany()
    const proposal = await rerunInput(f, f.reservation.executionCycleId!)
    const frozenProducerRows = () =>
      Promise.all([
        f.db.qualityJourneyPreparedRuntimeCapsule.findMany(),
        f.db.qualityJourneyAutomationMaterialization.findMany(),
        f.db.qualityJourneyAutomationMaterializationBinding.findMany(),
        f.db.qualityJourneyAutomationMaterializationSourceProof.findMany(),
      ])
    const producerBefore = await frozenProducerRows()
    const predecessorScope = await f.db.qualityJourney.findUniqueOrThrow({ where: { id: f.input.journeyId } })
    expect(predecessorScope).toMatchObject({
      activeCycleId: f.cycleId,
      stage: 'TRIAGE',
      stateHash: proposal.expectedStateHash,
    })
    f.credentials = await f.session(2)
    expect(f.credentials).toMatchObject({ coordinatorGeneration: 2 })
    expect(old.every(row => row.coordinatorSessionId !== f.credentials.coordinatorSessionId)).toBe(true)
    isolateUnqualifiedPreflight()
    await startQualityJourneyRerun(proposal, f.db, f.credentials)
    const successor = await f.db.qualityJourneyExecutionCycle.findFirstOrThrow({
      where: { predecessorExecutionCycleId: f.reservation.executionCycleId },
    })
    expect(successor.cycleId).not.toBe(f.cycleId)
    const successorCycle = await f.db.qualityJourneyCycle.findUniqueOrThrow({ where: { id: successor.cycleId } })
    expect(successorCycle).toMatchObject({ journeyId: f.input.journeyId, predecessorCycleId: f.cycleId, sequence: 2 })
    expect(await f.db.qualityJourney.findUniqueOrThrow({ where: { id: f.input.journeyId } })).toMatchObject({
      activeCycleId: successor.cycleId,
      currentCoordinatorSessionId: f.credentials.coordinatorSessionId,
    })
    const successorUses = await f.db.qualityJourneySharedResourceUse.findMany({
      where: { sourceKind: 'EXECUTION_CYCLE', sourceOwnerId: successor.id },
    })
    expect(successorUses).toHaveLength(1)
    expect(successorUses[0]).toMatchObject({
      state: 'ACTIVE',
      generation: 2,
      coordinatorSessionId: f.credentials.coordinatorSessionId,
    })
    expect(await frozenProducerRows()).toEqual(producerBefore)
    const binding = await f.db.qualityJourneyExecutionTestRun.findFirstOrThrow({
      where: { executionCycleId: successor.id },
    })
    await expect(loadJourneyCapsuleSource(f.db, binding.testRunId)).resolves.toMatchObject({
      sharedResourceProtection: 'PROTECTED_E2',
      identity: { cycleId: successor.cycleId },
      selection: [{ testCase: { title: 'Frozen case' } }],
    })
    expect(
      await f.db.qualityJourneySharedResourceUse.findMany({ where: { id: { in: old.map(row => row.id) } } }),
    ).toEqual(old)
  })

  it.each(['reparent', 'group', 'module', 'archive', 'definition', 'receipt'])(
    'O5 refuses actual changed dependency %s with original value/frozen packet preserved',
    async fault => {
      const f = await reserved()
      if (fault === 'reparent')
        await f.db.locatorGroup.update({ where: { id: f.group.id }, data: { moduleId: f.alternateModule.id } })
      if (fault === 'group') await f.db.locatorGroup.update({ where: { id: f.group.id }, data: { route: '/changed' } })
      if (fault === 'module') await f.db.module.update({ where: { id: f.module.id }, data: { name: 'Changed parent' } })
      if (fault === 'archive') await f.db.locator.update({ where: { id: f.locator.id }, data: { archivedAt: at } })
      if (fault === 'definition')
        await f.db.stepDefinition.update({
          where: { id_version: { id: f.definition.identity.id, version: f.definition.identity.version } },
          data: { status: 'deprecated' },
        })
      if (fault === 'receipt')
        await f.db.stepPublicationReceipt.update({
          where: {
            stepId_stepVersion: { stepId: f.definition.identity.id, stepVersion: f.definition.identity.version },
          },
          data: { receiptJson: '{}' },
        })
      await expect(
        new RuntimeCapsuleMaterializer(f.db, f.directory).materializeJourneyPrepared({ testRunId: f.testRunId }),
      ).rejects.toThrow()
      expect(vi.mocked(sealCapsuleCommandReceipt)).not.toHaveBeenCalled()
    },
  )

  it.each(['duplicate', 'foreign', 'archived'])(
    'O5 rejects an unfiltered exact-ID Locator capture containing %s data',
    async fault => {
      const f = await reserved()
      const client = alteredReadClient(f.db, (model, operation, value, args) => {
        if (model !== 'locator' || operation !== 'findMany') return value
        expect(args.where).toEqual({ id: { in: [f.locator.id] } })
        const rows = value as Record<string, unknown>[]
        if (fault === 'duplicate') return [...rows, ...rows]
        if (fault === 'foreign') return rows.map(row => ({ ...row, targetProjectId: f.id('foreign-target') }))
        return rows.map(row => ({ ...row, archivedAt: at }))
      })
      await expect(
        new RuntimeCapsuleMaterializer(client, f.directory).materializeJourneyPrepared({ testRunId: f.testRunId }),
      ).rejects.toThrow('Journey locator capture is missing, ambiguous, archived or cross-target.')
      expect(vi.mocked(generateExecutableBindings)).not.toHaveBeenCalled()
      expect(vi.mocked(sealCapsuleCommandReceipt)).not.toHaveBeenCalled()
    },
  )

  it('O5/O6 keeps descriptor content queries, limits Journey context to link scalars, and refuses BEFORE sealing/manifest/lease/storage', async () => {
    const f = await reserved(),
      before = await snapshot(f),
      selects: Record<string, unknown>[] = [],
      models = new Set<string>()
    const client = observedClient(f.db, event => {
      models.add(event.model)
      if (event.model === 'testRun' && event.operation === 'findUniqueOrThrow') selects.push(event.args)
      if (writeOperation.test(event.operation)) throw new Error('CAPTURE_WRITE_FORBIDDEN')
    })
    const filesBefore = await fs.readdir(f.directory)
    await expect(
      new RuntimeCapsuleMaterializer(client, f.directory).materializeJourneyPrepared({ testRunId: f.testRunId }),
    ).rejects.toMatchObject({ details: { reason: 'UNSUPPORTED_E2_CAPSULE_PUBLICATION' } })
    for (const args of selects)
      expect(args.include).toMatchObject({ testCases: { select: { id: true, testCaseId: true, testSuiteId: true } } })
    for (const args of selects)
      expect((args.include as Record<string, unknown>).testCases).not.toHaveProperty('include')
    expect(models).toContain('testCase') // Complete descriptor query is intentionally retained.
    expect(models).toContain('testSuite')
    expect(vi.mocked(generateReviewedFeature)).not.toHaveBeenCalled()
    expect(vi.mocked(sealCapsuleCommandReceipt)).not.toHaveBeenCalled()
    expect(await fs.readdir(f.directory)).toEqual(filesBefore)
    expect(await snapshot(f)).toEqual(before)
  })

  it('O6 rejects an interleaved dependency edit before returning and rolls the test edit back', async () => {
    const f = await reserved(),
      before = await snapshot(f)
    let changed = false
    const client = observedClient(f.db, async event => {
      if (
        !changed &&
        event.model === 'qualityJourneySharedResourceClaim' &&
        event.operation === 'findMany' &&
        event.phase === 'after'
      ) {
        changed = true
        await event.tx.locatorGroup.update({ where: { id: f.group.id }, data: { route: '/interleaved' } })
      }
    })
    await expect(loadJourneyCapsuleSource(client, f.testRunId)).rejects.toThrow()
    expect(changed).toBe(true)
    expect(await snapshot(f)).toEqual(before)
  })

  it('O6 actual retirement makes retained current Use insufficient without modifying or releasing it', async () => {
    const f = await reserved(),
      c = f.credentials
    await f.db.$transaction(tx =>
      commitE2RetirementRequest(
        tx,
        {
          journeyId: c.journeyId,
          targetProjectId: c.targetProjectId,
          coordinatorSessionId: c.coordinatorSessionId,
          generation: c.coordinatorGeneration,
          requestId: f.id('retire'),
          requestedAt: at,
          authority: { kind: 'CURRENT_SESSION', credentials: c },
        },
        'PAUSE',
      ),
    )
    const before = await snapshot(f)
    await expect(loadJourneyCapsuleSource(f.db, f.testRunId)).rejects.toThrow()
    expect(await snapshot(f)).toEqual(before)
    expect((await f.db.qualityJourneySharedResourceUse.findMany()).every(row => row.state === 'ACTIVE')).toBe(true)
  })

  it('O6 separate SQLite writer cannot mix post-edit descriptor bytes into an existing read snapshot', async ({
    task,
  }) => {
    const f = await reserved()
    // Fresh synthetic DB only. A WAL request does not establish the journal mode,
    // transaction/lock behavior or that this writer can settle before the read closes.
    await f.db.$queryRawUnsafe('PRAGMA journal_mode=WAL')
    const writer = new PrismaClient({ datasources: { db: { url: `file:${path.join(f.directory, 'test.db')}` } } })
    clients.push(writer)
    const retainedState = () =>
      Promise.all([
        f.db.qualityJourneySharedResourceUse.findMany({ orderBy: { id: 'asc' } }),
        f.db.qualityJourneySharedResourceClaim.findMany({ orderBy: { id: 'asc' } }),
        f.db.qualityJourneySharedResourceCoverage.findMany({ orderBy: [{ targetProjectId: 'asc' }, { kind: 'asc' }] }),
        f.db.qualityJourneySharedResourceGuard.findMany({
          orderBy: [{ targetProjectId: 'asc' }, { kind: 'asc' }, { resourceId: 'asc' }],
        }),
      ])
    const retainedBefore = await retainedState()
    const oldSource = await loadJourneyCapsuleSource(f.db, f.testRunId)
    const events: Array<{ order: number; kind: string; model?: string; operation?: string }> = []
    const record = (kind: string, model?: string, operation?: string) => {
      const event = { order: events.length + 1, kind, ...(model ? { model, operation } : {}) }
      events.push(event)
      return event.order
    }
    let readerOpen = false,
      readerSettledOrder = 0,
      writerInvocations = 0,
      writerSuccesses = 0,
      writerFailures = 0
    let writerInvocationOrder = 0,
      writerSuccessOrder = 0
    const readerWrites: string[] = []
    const writerState: {
      outcome: Promise<{ status: 'fulfilled'; route: string | null } | { status: 'rejected'; error: unknown }> | null
    } = { outcome: null }
    const client = observedClient(
      f.db,
      event => {
        if (event.phase === 'before' && writeOperation.test(event.operation))
          readerWrites.push(`${event.model}.${event.operation}`)
        // Only later completed reads count; exclude the claim read that triggers invocation.
        if (writerInvocations > 0 && event.phase === 'after' && event.operation.startsWith('find')) {
          expect(readerOpen).toBe(true)
          record('reader-read-after-writer-invocation', event.model, event.operation)
        }
        if (
          writerInvocations === 0 &&
          event.model === 'qualityJourneySharedResourceClaim' &&
          event.operation === 'findMany' &&
          event.phase === 'after'
        ) {
          expect(readerOpen).toBe(true)
          record('after-claim-read-hook', event.model, event.operation)
          writerInvocations++
          writerInvocationOrder = record('writer-invoked-and-consumed')
          // .then consumes the real PrismaPromise now and attaches both handlers.
          // This open read hook does not await writer completion.
          writerState.outcome = writer.locatorGroup
            .update({ where: { id: f.group.id }, data: { route: '/separate-writer' } })
            .then(
              row => {
                writerSuccesses++
                writerSuccessOrder = record('writer-fulfilled')
                return { status: 'fulfilled' as const, route: row.route }
              },
              (error: unknown) => {
                writerFailures++
                record('writer-rejected')
                return { status: 'rejected' as const, error }
              },
            )
        }
      },
      () => undefined,
      phase => {
        if (phase === 'open') {
          expect(readerOpen).toBe(false)
          readerOpen = true
          record('reader-transaction-open')
        } else {
          readerOpen = false
          readerSettledOrder = record(`reader-transaction-${phase}`)
        }
      },
    )
    const readerOutcome = await loadJourneyCapsuleSource(client, f.testRunId).then(
      source => ({ status: 'fulfilled' as const, source }),
      (error: unknown) => ({ status: 'rejected' as const, error }),
    )
    // Account for the one writer after reader settlement, including reader/writer failures.
    const written = writerState.outcome ? await writerState.outcome : null
    const laterReaderOperations = events.filter(
      event =>
        event.kind === 'reader-read-after-writer-invocation' &&
        event.order > writerInvocationOrder &&
        event.order < readerSettledOrder,
    )
    Object.assign(task.meta, {
      r07OverlappingClientOperations: {
        kind: 'R07_FRESH_SQLITE_OVERLAPPING_CLIENT_OPERATION_LIFECYCLE',
        events,
        readerStatus: readerOutcome.status,
        writerStatus: written?.status ?? 'NOT_INITIATED',
        readerError: readerOutcome.status === 'rejected' ? String(readerOutcome.error) : null,
        writerError: written?.status === 'rejected' ? String(written.error) : null,
        writerInvocations,
        writerSuccesses,
        writerFailures,
        writerSettlementRelation:
          writerSuccessOrder === 0
            ? 'NO_SUCCESS_OBSERVED'
            : writerSuccessOrder < readerSettledOrder
              ? 'SUCCESS_OBSERVED_BEFORE_READER_SETTLEMENT'
              : 'OVERLAPPING_ATTEMPT_WITH_DEFERRED_SUCCESS_AFTER_READER_SETTLEMENT',
        writerSuccessObservedBeforeReaderSettlement: writerSuccessOrder > 0 && writerSuccessOrder < readerSettledOrder,
        writerSuccessObservedBeforeLaterReaderOperation:
          writerSuccessOrder > 0 && laterReaderOperations.some(event => event.order > writerSuccessOrder),
        interpretation:
          'Client operation lifecycle only; no SQL commit trace, journal qualification or unconditional committed-mid-read claim.',
      },
    })
    if (readerOutcome.status === 'rejected') throw readerOutcome.error
    expect(readerOpen).toBe(false)
    expect(writerInvocations).toBe(1)
    expect(writerInvocationOrder).toBeGreaterThan(events.find(event => event.kind === 'reader-transaction-open')!.order)
    expect(writerInvocationOrder).toBeLessThan(readerSettledOrder)
    expect(laterReaderOperations.length).toBeGreaterThan(0)
    if (!written) throw new Error('R07_REAL_WRITER_NOT_INITIATED_INSIDE_CAPTURE')
    if (written.status === 'rejected') throw written.error
    expect(writerSuccesses).toBe(1)
    expect(writerFailures).toBe(0)
    expect(written.route).toBe('/separate-writer')
    const source = readerOutcome.source
    expect(source).toEqual(oldSource)
    expect(source.selection[0]!.testCase.title).toBe('Frozen case')
    expect(readerWrites).toEqual([])
    expect(await retainedState()).toEqual(retainedBefore)
    expect((await writer.locatorGroup.findUniqueOrThrow({ where: { id: f.group.id } })).route).toBe('/separate-writer')
    await expect(loadJourneyCapsuleSource(f.db, f.testRunId)).rejects.toThrow()
    const filesBefore = await fs.readdir(f.directory)
    await expect(
      new RuntimeCapsuleMaterializer(f.db, f.directory).materializeJourneyPrepared({ testRunId: f.testRunId }),
    ).rejects.toThrow()
    expect(vi.mocked(sealCapsuleCommandReceipt)).not.toHaveBeenCalled()
    expect(await fs.readdir(f.directory)).toEqual(filesBefore)
  })

  it('O7 positively legacy source stays frozen while independent authored compiler uses current content', async () => {
    const f = await reserved(false)
    await f.db.testCase.update({ where: { id: f.testCase.id }, data: { title: 'Current authored title' } })
    await f.db.testSuite.update({ where: { id: f.suite.id }, data: { name: 'Current authored suite' } })
    await expect(loadJourneyCapsuleSource(f.db, f.testRunId)).resolves.toMatchObject({
      sharedResourceProtection: 'LEGACY',
      selection: [{ suite: { name: 'Frozen suite' }, testCase: { title: 'Frozen case' } }],
    })
    let closed = false
    const captureOnlyClient = new Proxy(f.db, {
      get(target, key) {
        if (key === '$transaction')
          return (body: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
            f.db.$transaction(body, { timeout: 30000 }).then(async captured => {
              // Test-only competing edit AFTER successful legacy capture. Compiler
              // must keep the copied old bytes and perform no root-client substitute.
              await f.db.locator.update({ where: { id: f.locator.id }, data: { value: '#after-capture' } })
              closed = true
              return captured
            })
        if (closed) throw new Error('POST_CAPTURE_ROOT_CLIENT_SUBSTITUTION')
        return Reflect.get(target, key, target)
      },
    }) as PrismaClient
    await expect(
      new RuntimeCapsuleMaterializer(captureOnlyClient, f.directory).materializeJourneyPrepared({
        testRunId: f.testRunId,
      }),
    ).rejects.toThrow('SYNTHETIC_STOP_AFTER_PURE_COMPILER')
    expect(closed).toBe(true)
    const compiler = vi.mocked(generateExecutableBindings).mock.calls[0]![0]
    expect(compiler.selectors[f.locator.id]).toBe('#synthetic')
    expect(compiler.sealedDefinitions).toEqual([{ step: JSON.parse(f.invocationJson).step, definition: f.definition }])
    expect((await f.db.locator.findUniqueOrThrow({ where: { id: f.locator.id } })).value).toBe('#after-capture')
    expect(json(vi.mocked(generateReviewedFeature).mock.calls)).toContain('Frozen case')
    expect(json(vi.mocked(generateReviewedFeature).mock.calls)).not.toContain('Current authored title')
    vi.mocked(generateReviewedFeature).mockClear()
    const independent = await f.db.testRun.create({
      data: {
        id: f.id('independent-run'),
        name: 'Synthetic independent',
        runId: f.id('independent-external'),
        targetProjectId: f.input.targetProjectId,
        environmentId: f.input.environmentId,
        intent: 'INDEPENDENT',
        testCases: { create: { testCaseId: f.testCase.id, testSuiteId: f.suite.id } },
      },
    })
    await expect(
      new RuntimeCapsuleMaterializer(f.db, f.directory).materializeAuthored({ testRunId: independent.id }),
    ).rejects.toThrow('SYNTHETIC_STOP_AFTER_PURE_COMPILER')
    expect(json(vi.mocked(generateReviewedFeature).mock.calls)).toContain('Current authored title')
    await expect(loadJourneyCapsuleSource(f.db, independent.id)).rejects.toThrow()
  })

  it('O7/R3 preserves verified explicit no-session producer and an older legacy execution cycle', async () => {
    const f = await reserved(false, 'NO_SESSION', 'missing-proof')
    expect(await f.db.qualityJourneyAutomationMaterializationSourceProof.count()).toBe(0)
    const laterCycleId = f.id('later-legacy-cycle')
    await f.db.qualityJourneyCycle.create({
      data: { id: laterCycleId, journeyId: f.input.journeyId, sequence: 2, predecessorCycleId: f.cycleId },
    })
    await f.db.qualityJourney.update({ where: { id: f.input.journeyId }, data: { activeCycleId: laterCycleId } })
    const before = await snapshot(f)
    await expect(loadJourneyCapsuleSource(f.db, f.testRunId)).resolves.toMatchObject({
      sharedResourceProtection: 'LEGACY',
      identity: { cycleId: f.cycleId },
      selection: [{ testCase: { title: 'Frozen case' } }],
    })
    await expect(
      new RuntimeCapsuleMaterializer(f.db, f.directory).materializeJourneyPrepared({ testRunId: f.testRunId }),
    ).rejects.toThrow('SYNTHETIC_STOP_AFTER_PURE_COMPILER')
    expect(await snapshot(f)).toEqual(before)
    expect(await f.db.qualityJourneySharedResourceUse.count()).toBe(0)
  })

  it('O7/R3 preserves rich legacy resource hashes and the existing sealed deprecated-scalar support', async () => {
    const f = await reserved(false, 'RICH')
    await f.db.stepDefinition.update({
      where: { id_version: { id: f.definition.identity.id, version: f.definition.identity.version } },
      data: { status: 'deprecated' },
    })
    const cycle = await f.db.qualityJourneyExecutionCycle.findUniqueOrThrow({
      where: { id: f.reservation.executionCycleId },
    })
    expect(JSON.parse(cycle.preparedCapsulesJson)[0].resourceHashes[0]).toHaveProperty('sourceTargetProjectId')
    await expect(loadJourneyCapsuleSource(f.db, f.testRunId)).resolves.toMatchObject({
      sharedResourceProtection: 'LEGACY',
    })
    await expect(
      new RuntimeCapsuleMaterializer(f.db, f.directory).materializeJourneyPrepared({ testRunId: f.testRunId }),
    ).rejects.toThrow('SYNTHETIC_STOP_AFTER_PURE_COMPILER')
    expect(vi.mocked(generateExecutableBindings).mock.calls[0]![0].sealedDefinitions).toEqual([
      { step: JSON.parse(f.invocationJson).step, definition: f.definition },
    ])
    expect(await f.db.qualityJourneySharedResourceUse.count()).toBe(0)
  })

  it('O7 unknown original producer provenance cannot fall back to legacy', async () => {
    const f = await reserved(false)
    const client = alteredReadClient(f.db, (model, _operation, value) =>
      model === 'qualityJourneyWorkAttemptSessionBinding' && value
        ? { ...(value as object), provenance: 'UNKNOWN_SYNTHETIC_PROVENANCE' }
        : value,
    )
    await expect(loadJourneyCapsuleSource(client, f.testRunId)).rejects.toThrow()
  })
})
