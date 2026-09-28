import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it } from 'vitest'
import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import { createQualityJourneyKernelState, hashQualityJourneyExecutionValue } from '@/lib/quality-journey'
import { preparedRuntimeCapsuleSchema } from '@/lib/quality-journey/automation-contracts'
import { defaultOperationDefinitions } from '@/lib/operation-catalog'
import { processManager } from '@/lib/test-run/process-manager'
import { hashRuntimeCapsuleBytes } from '@/lib/runtime-capsule'
import { TestRunArtifactAccessService } from '@/services/test-run/test-run-artifact-access-service'
import {
  builtInStepDefinitions,
  canonicalStepDefinitionJson,
  computeStepDefinitionHashes,
  computeStepExecutableReadiness,
  computeStepReferenceHash,
  stepDefinitionContentHash,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'
import { createQualityJourney } from './quality-journey-service'
import {
  startQualityJourneyExecutionRuntime,
  reconcileQualityJourneyExecutionRuntime,
} from './quality-journey-runtime-service'
import {
  approveQualityJourneyRerun,
  cancelQualityJourneyExecution,
  grantQualityJourneyExecutionConsent,
  revokeQualityJourneyExecutionConsent,
  proposeQualityJourneyRerun,
  reconcileQualityJourneyExecution,
  registerQualityJourneyExecutionRuntimeAdapter,
  resetQualityJourneyExecutionRuntimeAdapter,
  startQualityJourneyExecution,
  startQualityJourneyRerun,
} from './quality-journey-execution-service'
import { requestQualityJourneyReportRevision } from './quality-journey-triage-service'
import { submitDurableQualityJourneyCommand } from './quality-journey-service'

const workspaces: string[] = []
const digest = (character: string) => `sha256:${character.repeat(64)}`
const json = JSON.stringify

afterEach(async () => {
  resetQualityJourneyExecutionRuntimeAdapter()
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

async function fixture(
  actualOperationId = 'browser.forms.fill',
  manifestOperationId = actualOperationId,
  capsuleCount = 1,
  realRuntime = false,
  baseUrl = 'http://127.0.0.1:3000',
) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-quality-journey-execution-'))
  workspaces.push(workspace)
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  // SQLite PRAGMAs are connection-local. Keep fixture setup and restoration
  // on one connection on every host, including multi-core Linux CI runners.
  const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}?connection_limit=1` } } })
  await client.targetProject.create({
    data: {
      id: 'target-execution',
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `path:${workspace}`,
      canonicalPath: workspace,
      displayName: 'execution',
      fingerprint: digest('a'),
    },
  })
  await client.environment.create({
    data: {
      id: 'environment-execution',
      targetProjectId: 'target-execution',
      name: 'local',
      baseUrl,
    },
  })
  await client.module.create({ data: { id: 'module-execution', targetProjectId: 'target-execution', name: 'module' } })
  await client.testSuite.create({
    data: { id: 'suite-execution', targetProjectId: 'target-execution', moduleId: 'module-execution', name: 'suite' },
  })
  await client.testCase.create({
    data: {
      id: 'case-execution',
      targetProjectId: 'target-execution',
      title: 'case',
      description: 'case',
      TestSuite: { connect: { id: 'suite-execution' } },
    },
  })
  const created = await createQualityJourney(
    {
      targetProjectId: 'target-execution',
      idempotencyKey: 'journey-create',
      requirement: { objective: 'exercise phase seven' },
    },
    client,
  )
  const state = createQualityJourneyKernelState({
    journeyId: created.journey.journeyId,
    targetProjectId: 'target-execution',
    activeCycleId: created.journey.activeCycleId,
    stage: 'AUTOMATION',
  })
  // Phase 6's relational antecedents are already tested in their own suite.
  // This uses a migrated SQLite database to seed the smallest frozen output
  // packet consumed by the Phase 7 coordinator boundary.
  await client.$executeRawUnsafe('PRAGMA foreign_keys=OFF')
  await client.qualityJourney.update({
    where: { id: created.journey.journeyId },
    data: { stage: 'AUTOMATION', stateHash: state.stateHash, activeScenarioPortfolioRevisionId: 'portfolio-execution' },
  })
  await client.qualityJourneyScenarioPortfolioRevision.create({
    data: {
      id: 'portfolio-execution',
      journeyId: created.journey.journeyId,
      targetProjectId: 'target-execution',
      cycleId: created.journey.activeCycleId,
      discoveryRevisionId: 'discovery-missing',
      discoveryCompletionHash: digest('b'),
      artifactRecordId: 'artifact-portfolio',
      artifactId: 'portfolio',
      artifactRevisionId: 'portfolio-r1',
      revision: 1,
      contentHash: digest('c'),
      behavioralIntentHash: digest('d'),
      enrichmentHash: digest('e'),
      layoutHash: digest('f'),
      coverageRationale: 'scope',
      graphJson: '{}',
      submissionIdempotencyKey: 'portfolio-submit',
      submissionHash: digest('1'),
      submittedWorkItemId: 'work-missing',
      submittedAttemptId: 'attempt-missing',
      status: 'APPROVED',
      approvedIntentHash: digest('2'),
    },
  })
  await client.qualityJourneyScenarioRevision.create({
    data: {
      id: 'scenario-row',
      portfolioRevisionId: 'portfolio-execution',
      stableScenarioId: 'scenario-stable',
      scenarioRevisionId: 'scenario-r1',
      behavioralIntentJson: '{}',
      behavioralIntentHash: digest('3'),
      enrichmentJson: '{}',
      enrichmentHash: digest('4'),
      layoutJson: '{}',
      layoutHash: digest('5'),
      contentHash: digest('6'),
    },
  })
  await client.qualityJourneyScenarioDecision.create({
    data: {
      id: 'decision-execution',
      portfolioRevisionId: 'portfolio-execution',
      scenarioRevisionId: 'scenario-r1',
      decision: 'APPROVED',
      actor: 'USER',
      idempotencyKey: 'decision-execution',
      requestHash: digest('7'),
      contentHash: digest('8'),
    },
  })
  await client.qualityJourneyAutomationMaterialization.create({
    data: {
      id: 'materialization-execution',
      journeyId: created.journey.journeyId,
      targetProjectId: 'target-execution',
      cycleId: created.journey.activeCycleId,
      scenarioRevisionId: 'scenario-r1',
      scenarioContentHash: digest('6'),
      portfolioRevisionId: 'portfolio-r1',
      portfolioRecordId: 'portfolio-execution',
      portfolioContentHash: digest('c'),
      decisionId: 'decision-execution',
      decisionHash: digest('8'),
      workItemId: 'work-missing',
      attemptId: 'attempt-missing',
      leaseId: 'lease',
      ownerTokenHash: digest('9'),
      inputHash: digest('a'),
      idempotencyKey: 'materialization',
      requestHash: digest('b'),
      materializationHash: digest('c'),
      artifactRecordId: 'artifact-materialization',
      artifactJson: '{}',
    },
  })
  const operation = defaultOperationDefinitions.find(item => item.id === actualOperationId && item.version === '1')!
  const definition = builtInStepDefinitions.find(
    item =>
      item.execution.kind === 'operation' &&
      item.execution.handlerId === operation.handler.id &&
      item.execution.handlerVersion === operation.handler.version,
  )!
  const definitionHashes = computeStepDefinitionHashes(definition)
  const registryManifestHash = stepDefinitionContentHash({ step: definition.identity })
  const publicationReceipt = {
    step: { id: definition.identity.id, version: definition.identity.version },
    ...definitionHashes,
    registryManifestHash,
    executableReadiness: computeStepExecutableReadiness(definition, registryManifestHash, 'c26-bounded-runtime'),
    conformanceRunId: 'c26-bounded-runtime',
    reviewAuthority: 'fixture-reviewer',
    publishedAt: '2026-09-29T00:00:00.000Z',
  }
  await client.stepDefinition.create({
    data: {
      id: definition.identity.id,
      version: definition.identity.version,
      status: 'ready',
      title: definition.intent.title,
      description: definition.intent.description,
      definitionJson: json(definition),
      definitionHash: definitionHashes.definitionHash,
      humanProjectionHash: definitionHashes.humanProjectionHash,
      ...(realRuntime ? { agentContractHash: definitionHashes.agentContractHash } : {}),
      executionHash: definitionHashes.executionHash,
      provenanceJson: json(definition.provenance),
      ...(realRuntime
        ? {
            publicationReceipt: {
              create: {
                receiptJson: json(publicationReceipt),
                receiptHash: stepDefinitionContentHash(publicationReceipt),
                registryManifestHash,
                conformanceRunId: 'c26-bounded-runtime',
                reviewAuthority: 'fixture-reviewer',
              },
            },
          }
        : {}),
    },
  })
  const invocation = canonicalStepDefinitionJson({
    step: {
      id: definition.identity.id,
      version: definition.identity.version,
      definitionHash: computeStepReferenceHash(definition),
    },
    inputs: {},
    presentation: { keyword: realRuntime ? 'Given' : 'Then', description: definition.intent.description },
  })
  const binding = {
    schemaVersion: 'appraise.quality-journey/v1',
    targetProjectId: 'target-execution',
    moduleId: 'module-execution',
    suite: { id: 'suite-execution', name: 'suite', description: null },
    testCase: {
      id: 'case-execution',
      title: 'case',
      description: 'case',
      steps: [
        {
          ...(realRuntime
            ? {
                order: 0,
                gherkinStep: `Given ${operation.humanProjections[0]!.signature}`,
                label: operation.title,
                icon: 'NAVIGATION',
              }
            : {}),
          invocationJson: invocation,
        },
      ],
    },
  }
  const resourceHashes = realRuntime
    ? [
        {
          id: `step:${definition.identity.id}:${definition.identity.version}`,
          contentHash: definitionHashes.definitionHash,
        },
        {
          id: `operation:${operation.id}:${operation.version}`,
          contentHash: hashQualityJourneyExecutionValue(operation),
        },
      ]
    : []
  await client.qualityJourneyAutomationTargetBinding.create({
    data: {
      id: 'binding-execution',
      journeyId: created.journey.journeyId,
      targetProjectId: 'target-execution',
      semanticHash: digest('d'),
      suiteId: 'suite-execution',
      testCaseId: 'case-execution',
      suiteHash: digest('e'),
      testCaseHash: digest('f'),
      stepHash: digest('1'),
      bindingJson: json(binding),
      resourceHashJson: json(resourceHashes),
    },
  })
  await client.qualityJourneyAutomationMaterializationBinding.create({
    data: { materializationId: 'materialization-execution', bindingId: 'binding-execution' },
  })
  const manifest = {
    schemaVersion: 'appraise.quality-journey/v1',
    testCaseId: 'case-execution',
    suiteId: 'suite-execution',
    steps: [{ operation: { id: manifestOperationId, version: '1' } }],
  }
  const manifestHash = hashQualityJourneyExecutionValue(manifest)
  const capsuleHash = realRuntime
    ? hashQualityJourneyExecutionValue(
        preparedRuntimeCapsuleSchema.parse({
          schemaVersion: 'appraise.quality-journey/v1',
          capsuleId: 'prepared-execution',
          journeyId: created.journey.journeyId,
          targetProjectId: 'target-execution',
          cycleId: created.journey.activeCycleId,
          materializationId: 'materialization-execution',
          inputHash: digest('a'),
          manifestHash,
          status: 'PREPARED',
        }),
      )
    : digest('b')
  await client.qualityJourneyPreparedRuntimeCapsule.create({
    data: {
      id: 'prepared-execution',
      journeyId: created.journey.journeyId,
      targetProjectId: 'target-execution',
      cycleId: created.journey.activeCycleId,
      materializationId: 'materialization-execution',
      inputHash: digest('a'),
      capsuleHash,
      manifestJson: json(manifest),
      manifestHash,
    },
  })
  if (capsuleCount === 2) {
    await seedSecondPreparedCapsule(client, created.journey.journeyId, created.journey.activeCycleId, manifest)
  }
  await client.$executeRawUnsafe('PRAGMA foreign_keys=ON')
  const enforcement = await client.$queryRawUnsafe<Array<{ foreign_keys: bigint }>>('PRAGMA foreign_keys')
  expect(Number(enforcement[0].foreign_keys)).toBe(1)
  return {
    client,
    journeyId: created.journey.journeyId,
    stateHash: state.stateHash,
    cycleId: created.journey.activeCycleId,
    preparedRuntimeCapsuleIds:
      capsuleCount === 2 ? ['prepared-execution', 'prepared-execution-2'] : ['prepared-execution'],
  }
}

async function seedSecondPreparedCapsule(client: PrismaClient, journeyId: string, cycleId: string, manifest: unknown) {
  await client.qualityJourneyScenarioRevision.create({
    data: {
      id: 'scenario-row-2',
      portfolioRevisionId: 'portfolio-execution',
      stableScenarioId: 'scenario-stable-2',
      scenarioRevisionId: 'scenario-r2',
      behavioralIntentJson: '{}',
      behavioralIntentHash: digest('4'),
      enrichmentJson: '{}',
      enrichmentHash: digest('5'),
      layoutJson: '{}',
      layoutHash: digest('6'),
      contentHash: digest('7'),
    },
  })
  await client.qualityJourneyScenarioDecision.create({
    data: {
      id: 'decision-execution-2',
      portfolioRevisionId: 'portfolio-execution',
      scenarioRevisionId: 'scenario-r2',
      decision: 'APPROVED',
      actor: 'USER',
      idempotencyKey: 'decision-execution-2',
      requestHash: digest('8'),
      contentHash: digest('9'),
    },
  })
  await client.qualityJourneyAutomationMaterialization.create({
    data: {
      id: 'materialization-execution-2',
      journeyId,
      targetProjectId: 'target-execution',
      cycleId,
      scenarioRevisionId: 'scenario-r2',
      scenarioContentHash: digest('7'),
      portfolioRevisionId: 'portfolio-r1',
      portfolioRecordId: 'portfolio-execution',
      portfolioContentHash: digest('c'),
      decisionId: 'decision-execution-2',
      decisionHash: digest('9'),
      workItemId: 'work-missing-2',
      attemptId: 'attempt-missing-2',
      leaseId: 'lease-2',
      ownerTokenHash: digest('a'),
      inputHash: digest('b'),
      idempotencyKey: 'materialization-2',
      requestHash: digest('c'),
      materializationHash: digest('d'),
      artifactRecordId: 'artifact-materialization-2',
      artifactJson: '{}',
    },
  })
  await client.qualityJourneyAutomationMaterializationBinding.create({
    data: { materializationId: 'materialization-execution-2', bindingId: 'binding-execution' },
  })
  await client.qualityJourneyPreparedRuntimeCapsule.create({
    data: {
      id: 'prepared-execution-2',
      journeyId,
      targetProjectId: 'target-execution',
      cycleId,
      materializationId: 'materialization-execution-2',
      inputHash: digest('b'),
      capsuleHash: digest('c'),
      manifestJson: json(manifest),
      manifestHash: hashQualityJourneyExecutionValue(manifest),
    },
  })
}

type ExecutionFixture = {
  client: PrismaClient
  journeyId: string
  stateHash: string
  cycleId: string
  preparedRuntimeCapsuleIds: string[]
}
type ExecutionStart = Awaited<ReturnType<typeof startQualityJourneyExecution>>

function startedExecution(result: ExecutionStart) {
  if ('consentRequired' in result) throw new Error('expected granted execution to reserve a cycle')
  return result
}

function startInput(fixture: ExecutionFixture, key = 'execution-start') {
  return {
    journeyId: fixture.journeyId,
    targetProjectId: 'target-execution',
    preparedRuntimeCapsuleIds: fixture.preparedRuntimeCapsuleIds,
    environmentId: 'environment-execution',
    expectedStateHash: fixture.stateHash,
    idempotencyKey: key,
  }
}

describe('Quality Journey Phase 7 execution coordinator (SQLite)', () => {
  it('allows an exact frozen harmless binding without consent and rejects a forged harmless manifest', async () => {
    const harmless = await fixture('browser.assertions.visible', 'browser.forms.fill')
    const forged = await fixture('browser.forms.fill', 'browser.assertions.visible')
    const starts: string[] = []
    registerQualityJourneyExecutionRuntimeAdapter({
      start: async value => void starts.push(value.executionCycleId),
      cancel: async () => undefined,
      reconcile: async () => undefined,
    })
    try {
      const harmlessStart = await startQualityJourneyExecution(startInput(harmless, 'harmless'), harmless.client)
      expect(harmlessStart).not.toHaveProperty('consentRequired')
      expect(await harmless.client.qualityJourneyExecutionConsent.count()).toBe(0)
      await expect(startQualityJourneyExecution(startInput(forged, 'forged'), forged.client)).resolves.toMatchObject({
        consentRequired: { executionConsentId: expect.any(String) },
      })
      expect(starts).toHaveLength(1)
    } finally {
      await Promise.all([harmless.client.$disconnect(), forged.client.$disconnect()])
    }
  })

  it('reissues an exact requested consent after an auto-selected grant expires', async () => {
    const value = await fixture()
    registerQualityJourneyExecutionRuntimeAdapter({
      start: async () => undefined,
      cancel: async () => undefined,
      reconcile: async () => undefined,
    })
    try {
      const requested = await startQualityJourneyExecution(startInput(value, 'expired'), value.client)
      if (!('consentRequired' in requested)) throw new Error('fixture must request consent')
      const initial = await value.client.qualityJourneyExecutionConsent.findFirstOrThrow()
      await grantQualityJourneyExecutionConsent(
        {
          journeyId: value.journeyId,
          targetProjectId: 'target-execution',
          executionConsentId: initial.id,
          expectedScopeHash: initial.scopeHash,
        },
        value.client,
      )
      await value.client.qualityJourneyExecutionConsent.update({
        where: { id: initial.id },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      })
      const renewed = await startQualityJourneyExecution(startInput(value, 'expired'), value.client)
      expect(renewed).toMatchObject({ consentRequired: { executionConsentId: expect.any(String) } })
      if (!('consentRequired' in renewed)) throw new Error('expired grant must request a new consent')
      expect(renewed.consentRequired.executionConsentId).not.toBe(initial.id)
    } finally {
      await value.client.$disconnect()
    }
  })

  it('commits a requested consent, grants exact scope, starts once, and rejects changed replay keys', async () => {
    const value = await fixture()
    const starts: string[] = []
    registerQualityJourneyExecutionRuntimeAdapter({
      start: async value => void starts.push(value.executionCycleId),
      cancel: async () => undefined,
      reconcile: async () => undefined,
    })
    try {
      const request = await startQualityJourneyExecution(startInput(value), value.client)
      expect(request).toMatchObject({
        consentRequired: { executionConsentId: expect.any(String), scopeHash: expect.stringMatching(/^sha256:/) },
      })
      expect(await value.client.qualityJourneyExecutionConsent.count()).toBe(1)
      const consent = await value.client.qualityJourneyExecutionConsent.findFirstOrThrow()
      await grantQualityJourneyExecutionConsent(
        {
          journeyId: value.journeyId,
          targetProjectId: 'target-execution',
          executionConsentId: consent.id,
          expectedScopeHash: consent.scopeHash,
        },
        value.client,
      )
      const started = startedExecution(
        await startQualityJourneyExecution({ ...startInput(value), executionConsentId: consent.id }, value.client),
      )
      expect(started.cycles).toHaveLength(1)
      expect(starts).toHaveLength(1)
      await expect(
        startQualityJourneyExecution(
          {
            ...startInput(value),
            preparedRuntimeCapsuleIds: ['prepared-execution'],
            environmentId: 'environment-execution',
            executionConsentId: consent.id,
          },
          value.client,
        ),
      ).resolves.toMatchObject({ cycles: [{ id: started.cycles[0]!.id }] })
      await expect(
        startQualityJourneyExecution(
          {
            ...startInput(value),
            idempotencyKey: 'execution-start',
            environmentId: 'environment-other',
            executionConsentId: consent.id,
          },
          value.client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    } finally {
      await value.client.$disconnect()
    }
  })

  it('revokes a granted exact scope before reservation and requires fresh consent', async () => {
    const value = await fixture()
    const starts: string[] = []
    registerQualityJourneyExecutionRuntimeAdapter({
      start: async input => void starts.push(input.executionCycleId),
      cancel: async () => undefined,
      reconcile: async () => undefined,
    })
    try {
      const request = await startQualityJourneyExecution(startInput(value, 'revoked'), value.client)
      if (!('consentRequired' in request)) throw new Error('fixture must request consent')
      const consentInput = {
        journeyId: value.journeyId,
        targetProjectId: 'target-execution',
        executionConsentId: request.consentRequired.executionConsentId,
        expectedScopeHash: request.consentRequired.scopeHash,
      }
      const original = await value.client.qualityJourneyExecutionConsent.findUniqueOrThrow({
        where: { id: consentInput.executionConsentId },
      })
      expect(JSON.parse(original.scopeJson)).toMatchObject({ executionInputsHash: expect.stringMatching(/^sha256:/) })
      await grantQualityJourneyExecutionConsent(consentInput, value.client)
      await expect(revokeQualityJourneyExecutionConsent(consentInput, value.client)).resolves.toMatchObject({
        status: 'REVOKED',
        revokedAt: expect.any(Date),
      })
      await expect(revokeQualityJourneyExecutionConsent(consentInput, value.client)).resolves.toMatchObject({
        status: 'REVOKED',
      })
      await expect(
        startQualityJourneyExecution(
          { ...startInput(value, 'revoked'), executionConsentId: consentInput.executionConsentId },
          value.client,
        ),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
      const renewed = await startQualityJourneyExecution(startInput(value, 'revoked'), value.client)
      expect(renewed).toHaveProperty('consentRequired')
      if (!('consentRequired' in renewed)) throw new Error('revoked grant must require a new consent')
      expect(renewed.consentRequired.executionConsentId).not.toBe(consentInput.executionConsentId)
      expect(await value.client.qualityJourneyExecutionCycle.count()).toBe(0)
      expect(starts).toHaveLength(0)
    } finally {
      await value.client.$disconnect()
    }
  })

  it('records an auto-selected UI grant in the durable execution command and refuses late revocation', async () => {
    const value = await fixture()
    registerQualityJourneyExecutionRuntimeAdapter({
      start: async () => undefined,
      cancel: async () => undefined,
      reconcile: async () => undefined,
    })
    try {
      const requested = await startQualityJourneyExecution(startInput(value, 'auto-grant'), value.client)
      if (!('consentRequired' in requested)) throw new Error('fixture must request consent')
      const consentInput = {
        journeyId: value.journeyId,
        targetProjectId: 'target-execution',
        executionConsentId: requested.consentRequired.executionConsentId,
        expectedScopeHash: requested.consentRequired.scopeHash,
      }
      await grantQualityJourneyExecutionConsent(consentInput, value.client)
      const started = startedExecution(
        await startQualityJourneyExecution(startInput(value, 'auto-grant'), value.client),
      )
      const consent = await value.client.qualityJourneyExecutionConsent.findUniqueOrThrow({
        where: { id: consentInput.executionConsentId },
      })
      expect(consent).toMatchObject({ status: 'CONSUMED', executionCycleId: started.cycles[0]!.id })
      const command = await value.client.qualityJourneyCommand.findFirstOrThrow({
        where: { journeyId: value.journeyId, idempotencyKey: 'execution:auto-grant' },
      })
      expect(JSON.parse(command.requestJson).payload).toMatchObject({ executionConsentId: consent.id })
      await expect(revokeQualityJourneyExecutionConsent(consentInput, value.client)).rejects.toMatchObject({
        code: 'CONFLICT',
      })
    } finally {
      await value.client.$disconnect()
    }
  })

  it('keeps one reservation when launch succeeds but its reply is lost', async () => {
    const value = await fixture('browser.assertions.visible')
    const effects = new Set<string>()
    let calls = 0
    registerQualityJourneyExecutionRuntimeAdapter({
      start: async input => {
        calls++
        effects.add(input.executionCycleId)
        if (calls === 1) throw new Error('lost launch reply')
      },
      cancel: async () => undefined,
      reconcile: async () => undefined,
    })
    try {
      await expect(startQualityJourneyExecution(startInput(value, 'lost-reply'), value.client)).rejects.toThrow(
        'lost launch reply',
      )
      expect(await value.client.qualityJourneyExecutionCycle.count()).toBe(1)
      expect(await value.client.testRun.count({ where: { intent: 'QUALITY_JOURNEY' } })).toBe(1)
      await startQualityJourneyExecution(startInput(value, 'lost-reply'), value.client)
      expect(calls).toBe(2)
      expect(effects.size).toBe(1)
      expect(await value.client.qualityJourneyExecutionCycle.count()).toBe(1)
      expect(await value.client.testRun.count({ where: { intent: 'QUALITY_JOURNEY' } })).toBe(1)
      await expect(
        startQualityJourneyExecution({ ...startInput(value, 'lost-reply'), browserEngine: 'FIREFOX' }, value.client),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    } finally {
      await value.client.$disconnect()
    }
  })

  it.runIf(process.env.APPRAISE_C26_REAL_RUNTIME === '1')(
    'runs a bounded real Journey capsule through launch and terminal reconciliation',
    async () => {
      const server = createServer((_request, response) => {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        response.end('<!doctype html><title>Bounded Journey runtime</title>')
      })
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('fixture server address is unavailable')
      const value = await fixture(
        'browser.navigation.navigate.to.environment.base.url',
        undefined,
        1,
        true,
        `http://127.0.0.1:${address.port}`,
      )
      const appraiseRoot = path.join(workspaces[workspaces.length - 1]!, '.appraise')
      registerQualityJourneyExecutionRuntimeAdapter({
        start: async input => startQualityJourneyExecutionRuntime(input, value.client, appraiseRoot),
        cancel: async () => undefined,
        reconcile: async input => reconcileQualityJourneyExecutionRuntime(input, value.client, appraiseRoot),
      })
      let runId: string | undefined
      try {
        const request = await startQualityJourneyExecution(startInput(value, 'real-runtime'), value.client)
        if ('consentRequired' in request) {
          await grantQualityJourneyExecutionConsent(
            {
              journeyId: value.journeyId,
              targetProjectId: 'target-execution',
              executionConsentId: request.consentRequired.executionConsentId,
              expectedScopeHash: request.consentRequired.scopeHash,
            },
            value.client,
          )
        }
        const started = startedExecution(
          'consentRequired' in request
            ? await startQualityJourneyExecution(startInput(value, 'real-runtime'), value.client)
            : request,
        )
        const executionCycleId = started.cycles[0]!.id
        const testRunId = started.cycles[0]!.testRuns[0]!.testRunId
        runId = started.cycles[0]!.testRuns[0]!.runId
        const deadline = Date.now() + 30_000
        while (Date.now() < deadline) {
          const run = await value.client.testRun.findUniqueOrThrow({ where: { id: testRunId } })
          if (['COMPLETED', 'CANCELLED'].includes(run.status)) break
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        await reconcileQualityJourneyExecutionRuntime({ executionCycleId }, value.client, appraiseRoot)
        const materialized = await value.client.runtimeCapsule.findUnique({ where: { testRunId } })
        const attempt = await value.client.runtimeCapsuleExecutionAttempt.findUnique({ where: { testRunId } })
        const run = await value.client.testRun.findUniqueOrThrow({ where: { id: testRunId } })
        expect(materialized).toMatchObject({ testRunId })
        expect(attempt).toMatchObject({ testRunId })
        expect(run).toMatchObject({ status: 'COMPLETED', result: 'PASSED', evidenceHealth: 'valid' })
        expect(await value.client.qualityJourneyExecutionEvidenceReceipt.count({ where: { executionCycleId } })).toBe(1)
        await startQualityJourneyExecution(startInput(value, 'real-runtime'), value.client)
        expect(await value.client.runtimeCapsuleExecutionAttempt.count({ where: { testRunId } })).toBe(1)
        expect(await value.client.qualityJourneyExecutionEvidenceReceipt.count({ where: { executionCycleId } })).toBe(1)
      } finally {
        if (runId) processManager.get(runId)?.process.kill('SIGTERM')
        await value.client.$disconnect()
        await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())))
      }
    },
  )

  it.runIf(process.env.APPRAISE_C26_REAL_RUNTIME === '1')(
    'seals managed trace and screenshot bytes from a failed real Journey run',
    async () => {
      const value = await fixture(
        'browser.navigation.navigate.to.environment.base.url',
        undefined,
        1,
        true,
        'http://127.0.0.1:1',
      )
      const appraiseRoot = path.join(workspaces[workspaces.length - 1]!, '.appraise')
      registerQualityJourneyExecutionRuntimeAdapter({
        start: async input => startQualityJourneyExecutionRuntime(input, value.client, appraiseRoot),
        cancel: async () => undefined,
        reconcile: async input => reconcileQualityJourneyExecutionRuntime(input, value.client, appraiseRoot),
      })
      let runId: string | undefined
      try {
        const request = await startQualityJourneyExecution(startInput(value, 'real-runtime-failure'), value.client)
        if ('consentRequired' in request)
          await grantQualityJourneyExecutionConsent(
            {
              journeyId: value.journeyId,
              targetProjectId: 'target-execution',
              executionConsentId: request.consentRequired.executionConsentId,
              expectedScopeHash: request.consentRequired.scopeHash,
            },
            value.client,
          )
        const started = startedExecution(
          'consentRequired' in request
            ? await startQualityJourneyExecution(startInput(value, 'real-runtime-failure'), value.client)
            : request,
        )
        const executionCycleId = started.cycles[0]!.id
        const testRunId = started.cycles[0]!.testRuns[0]!.testRunId
        runId = started.cycles[0]!.testRuns[0]!.runId
        const deadline = Date.now() + 30_000
        while (Date.now() < deadline) {
          const run = await value.client.testRun.findUniqueOrThrow({ where: { id: testRunId } })
          if (['COMPLETED', 'CANCELLED'].includes(run.status)) break
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        await reconcileQualityJourneyExecutionRuntime({ executionCycleId }, value.client, appraiseRoot)
        const run = await value.client.testRun.findUniqueOrThrow({ where: { id: testRunId } })
        expect(run).toMatchObject({ status: 'COMPLETED', result: 'FAILED', evidenceHealth: 'valid' })
        const receipt = await value.client.qualityJourneyExecutionEvidenceReceipt.findFirstOrThrow({
          where: { executionCycleId },
        })
        const evidence = JSON.parse(receipt.evidenceJson) as {
          artifacts: Array<{ kind: string; testCaseId?: string; reportStepId?: string; contentHash: string }>
        }
        expect(evidence.artifacts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ kind: 'trace', testCaseId: 'case-execution' }),
            expect.objectContaining({
              kind: 'screenshot',
              testCaseId: 'case-execution',
              reportStepId: expect.any(String),
            }),
          ]),
        )
        const membership = await value.client.testRunTestCase.findFirstOrThrow({ where: { testRunId } })
        const step = await value.client.reportStep.findFirstOrThrow({
          where: { reportScenario: { reportFeature: { report: { testRunId } } }, screenshotPath: { not: null } },
        })
        const access = new TestRunArtifactAccessService(value.client, appraiseRoot)
        for (const item of [
          { kind: 'trace' as const, storedPath: membership.tracePath, reportStepId: undefined },
          { kind: 'screenshot' as const, storedPath: step.screenshotPath, reportStepId: step.id },
        ]) {
          const artifact = evidence.artifacts.find(
            artifact => artifact.kind === item.kind && artifact.reportStepId === item.reportStepId,
          )
          const { bytes } = await access.readBytes({
            kind: item.kind,
            runId: runId!,
            testCaseId: 'case-execution',
            storedPath: item.storedPath,
            expectedTargetProjectId: 'target-execution',
          })
          expect(artifact?.contentHash).toBe(hashRuntimeCapsuleBytes(bytes))
        }
        await reconcileQualityJourneyExecutionRuntime({ executionCycleId }, value.client, appraiseRoot)
        expect(await value.client.qualityJourneyExecutionEvidenceReceipt.count({ where: { executionCycleId } })).toBe(1)
      } finally {
        if (runId) processManager.get(runId)?.process.kill('SIGTERM')
        await value.client.$disconnect()
      }
    },
  )

  it('rejects foreign, missing, and tampered prepared capsules before a TestRun reservation', async () => {
    const value = await fixture()
    registerQualityJourneyExecutionRuntimeAdapter({
      start: async () => undefined,
      cancel: async () => undefined,
      reconcile: async () => undefined,
    })
    try {
      await expect(
        startQualityJourneyExecution(
          { ...startInput(value), preparedRuntimeCapsuleIds: ['missing-prepared'] },
          value.client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      await expect(
        value.client.$executeRawUnsafe(
          `UPDATE "QualityJourneyPreparedRuntimeCapsule" SET "manifestJson" = '{}' WHERE "id" = 'prepared-execution'`,
        ),
      ).rejects.toThrow('Prepared runtime capsules are immutable')
      expect(await value.client.testRun.count()).toBe(0)
    } finally {
      await value.client.$disconnect()
    }
  })

  it('rejects generic execution authority and keeps cancellation scoped and replay-safe', async () => {
    const value = await fixture('browser.forms.fill', 'browser.forms.fill', 2)
    const cancellations: Array<{ executionCycleId: string; testRunIds?: string[] }> = []
    const reconciliations: string[] = []
    registerQualityJourneyExecutionRuntimeAdapter({
      start: async () => undefined,
      cancel: async request => void cancellations.push(request),
      reconcile: async request => void reconciliations.push(request.executionCycleId),
    })
    try {
      await expect(
        submitDurableQualityJourneyCommand(
          {
            schemaVersion: 'appraise.quality-journey/v1',
            command: 'START_EXECUTION',
            commandId: 'generic-execution',
            journeyId: value.journeyId,
            targetProjectId: 'target-execution',
            actor: 'RUNNER',
            expectedStateHash: value.stateHash,
            idempotencyKey: 'generic-execution',
            inputArtifactRefs: [],
            payload: { runtimeCapsuleIds: ['prepared-execution'] },
          },
          value.client,
        ),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
      await expect(
        submitDurableQualityJourneyCommand(
          {
            schemaVersion: 'appraise.quality-journey/v1',
            command: 'START_REMEDIATION_CYCLE',
            commandId: 'generic-remediation',
            journeyId: value.journeyId,
            targetProjectId: 'target-execution',
            actor: 'USER',
            expectedStateHash: value.stateHash,
            idempotencyKey: 'generic-remediation',
            inputArtifactRefs: [],
            payload: { reportRevisionId: 'report-r1', remediationScope: 'do not bypass phase eight' },
          },
          value.client,
        ),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
      const requested = await startQualityJourneyExecution(startInput(value, 'cancel'), value.client)
      if (!('consentRequired' in requested)) throw new Error('fixture must request consent')
      const consent = await value.client.qualityJourneyExecutionConsent.findFirstOrThrow()
      await grantQualityJourneyExecutionConsent(
        {
          journeyId: value.journeyId,
          targetProjectId: 'target-execution',
          executionConsentId: consent.id,
          expectedScopeHash: consent.scopeHash,
        },
        value.client,
      )
      const started = await startQualityJourneyExecution(
        { ...startInput(value, 'cancel'), executionConsentId: consent.id },
        value.client,
      )
      if ('consentRequired' in started) throw new Error('granted consent must start execution')
      const cycle = started.cycles[0]!
      const executionTestRun = await value.client.qualityJourneyExecutionTestRun.findFirstOrThrow({
        where: { executionCycleId: cycle.id },
      })
      await expect(
        value.client.$executeRawUnsafe(
          `UPDATE "QualityJourneyExecutionCycle" SET "preparedCapsulesHash" = '${digest('x')}' WHERE "id" = '${cycle.id}'`,
        ),
      ).rejects.toThrow('execution cycle binding is immutable')
      await expect(
        value.client.$executeRawUnsafe(
          `UPDATE "QualityJourneyExecutionTestRun" SET "preparedCapsuleId" = 'forged' WHERE "id" = '${executionTestRun.id}'`,
        ),
      ).rejects.toThrow('test-run binding is immutable')
      await expect(
        value.client.$executeRawUnsafe(
          `UPDATE "TestRun" SET "runId" = 'forged-run-id' WHERE "id" = '${executionTestRun.testRunId}'`,
        ),
      ).rejects.toThrow('TestRun identity is immutable')
      await expect(
        value.client.$executeRawUnsafe(
          `UPDATE "QualityJourneyExecutionConsent" SET "grantSource" = 'MCP' WHERE "id" = '${consent.id}'`,
        ),
      ).rejects.toThrow('consent scope is immutable')
      await expect(
        value.client.$executeRawUnsafe(
          `INSERT INTO "QualityJourneyExecutionEvidenceReceipt" ("id", "executionCycleId", "testRunId", "runtimeBytesHash", "receiptHash", "evidenceJson") VALUES ('forged-evidence', '${cycle.id}', 'foreign-run', '${digest('a')}', '${digest('b')}', '{}')`,
        ),
      ).rejects.toThrow('evidence is outside its TestRun binding scope')
      await expect(
        value.client.$executeRawUnsafe(
          `INSERT INTO "TestRunTestCase" ("id", "testRunId", "testCaseId") VALUES ('forged-case', '${executionTestRun.testRunId}', 'case-execution')`,
        ),
      ).rejects.toThrow('TestRun cases are append-only')
      const sourceRun = await value.client.testRun.findUniqueOrThrow({ where: { id: executionTestRun.testRunId } })
      if (!sourceRun.environmentSnapshotJson || !sourceRun.environmentSnapshotHash)
        throw new Error('reserved execution TestRun must carry an environment snapshot')
      const forgedRun = await value.client.testRun.create({
        data: {
          id: 'forged-bound-run',
          runId: 'forged-bound-run-id',
          name: 'forged',
          targetProjectId: 'target-execution',
          environmentId: 'environment-execution',
          environmentSnapshotJson: sourceRun.environmentSnapshotJson,
          environmentSnapshotHash: sourceRun.environmentSnapshotHash,
          environmentSnapshotVersion: 1,
          browserEngine: 'CHROMIUM',
          intent: 'INDEPENDENT',
        },
      })
      await expect(
        value.client.$executeRawUnsafe(
          `INSERT INTO "QualityJourneyExecutionTestRun" ("id", "executionCycleId", "preparedCapsuleId", "testRunId", "runId") VALUES ('forged-binding', '${cycle.id}', 'forged-prepared', '${forgedRun.id}', '${forgedRun.runId}')`,
        ),
      ).rejects.toThrow('TestRun binding is outside the frozen cycle scope')
      await value.client.targetProject.create({
        data: {
          id: 'target-execution-foreign',
          kind: 'LOCAL_WORKSPACE',
          canonicalIdentity: 'path:foreign',
          canonicalPath: '/foreign',
          displayName: 'foreign',
          fingerprint: digest('f'),
        },
      })
      await value.client.environment.create({
        data: {
          id: 'environment-execution-foreign',
          targetProjectId: 'target-execution-foreign',
          name: 'foreign',
          baseUrl: 'http://127.0.0.1:3001',
        },
      })
      await expect(
        value.client.$executeRawUnsafe(
          `INSERT INTO "QualityJourneyExecutionCycle" ("id", "journeyId", "targetProjectId", "cycleId", "preparedCapsulesJson", "preparedCapsulesHash", "environmentId", "environmentSnapshotJson", "environmentSnapshotHash", "environmentSnapshotVersion", "targetFingerprint", "browserEngine", "stateHash", "idempotencyKey", "requestHash") VALUES ('forged-cycle', '${value.journeyId}', 'target-execution-foreign', '${value.cycleId}', '[]', '${digest('a')}', 'environment-execution-foreign', '{}', '${digest('b')}', 1, '${digest('f')}', 'CHROMIUM', '${digest('c')}', 'forged-cycle', '${digest('d')}')`,
        ),
      ).rejects.toThrow('cycle does not belong to its journey target scope')
      const journey = await value.client.qualityJourney.findUniqueOrThrow({ where: { id: value.journeyId } })
      await expect(
        cancelQualityJourneyExecution(
          {
            journeyId: value.journeyId,
            targetProjectId: 'target-execution',
            cycleId: cycle.id,
            testRunIds: ['foreign-run'],
            reason: 'cancel scoped run',
            expectedStateHash: journey.stateHash,
            idempotencyKey: 'cancel',
          },
          value.client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      const runId = cycle.testRuns[0]!.testRunId
      const cancellation = {
        journeyId: value.journeyId,
        targetProjectId: 'target-execution',
        cycleId: cycle.id,
        testRunIds: [runId],
        reason: 'cancel scoped run',
        expectedStateHash: journey.stateHash,
        idempotencyKey: 'cancel',
      }
      await cancelQualityJourneyExecution(cancellation, value.client)
      await cancelQualityJourneyExecution(cancellation, value.client)
      expect(cancellations).toHaveLength(2)
      await expect(
        cancelQualityJourneyExecution(
          { ...cancellation, testRunIds: cycle.testRuns.map(run => run.testRunId).sort() },
          value.client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(
        await value.client.qualityJourneyExecutionCycle.findUniqueOrThrow({ where: { id: cycle.id } }),
      ).toMatchObject({ status: 'RESERVED' })
      await expect(
        reconcileQualityJourneyExecution(
          {
            journeyId: value.journeyId,
            targetProjectId: 'target-execution',
            cycleId: 'foreign-cycle',
            idempotencyKey: 'x',
          },
          value.client,
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      expect(reconciliations).toEqual([])
    } finally {
      await value.client.$disconnect()
    }
  })

  it('creates two selective rerun successors from immutable predecessor snapshots', async () => {
    const value = await fixture('browser.forms.fill', 'browser.forms.fill', 2)
    registerQualityJourneyExecutionRuntimeAdapter({
      start: async () => undefined,
      cancel: async () => undefined,
      reconcile: async () => undefined,
    })
    try {
      const requested = await startQualityJourneyExecution(startInput(value, 'initial'), value.client)
      const initialConsent = await value.client.qualityJourneyExecutionConsent.findFirstOrThrow()
      await grantQualityJourneyExecutionConsent(
        {
          journeyId: value.journeyId,
          targetProjectId: 'target-execution',
          executionConsentId: initialConsent.id,
          expectedScopeHash: initialConsent.scopeHash,
        },
        value.client,
      )
      const initial = startedExecution(
        await startQualityJourneyExecution(
          { ...startInput(value, 'initial'), executionConsentId: initialConsent.id },
          value.client,
        ),
      )
      expect(requested).toHaveProperty('consentRequired')
      const terminalize = async (executionCycleId: string, receiptId: string) => {
        const binding = await value.client.qualityJourneyExecutionTestRun.findFirstOrThrow({
          where: { executionCycleId },
        })
        await value.client.testRun.update({
          where: { id: binding.testRunId },
          data: { status: 'COMPLETED', result: 'FAILED' },
        })
        await value.client.qualityJourneyExecutionCycle.update({
          where: { id: executionCycleId },
          data: { status: 'COMPLETED' },
        })
        await value.client.qualityJourneyExecutionEvidenceReceipt.create({
          data: {
            id: receiptId,
            executionCycleId,
            testRunId: binding.testRunId,
            runtimeBytesHash: digest('a'),
            receiptHash: digest(receiptId.at(-1)!),
            evidenceJson: '{}',
          },
        })
        const journey = await value.client.qualityJourney.findUniqueOrThrow({ where: { id: value.journeyId } })
        const triage = createQualityJourneyKernelState({
          journeyId: value.journeyId,
          targetProjectId: 'target-execution',
          activeCycleId: journey.activeCycleId,
          stage: 'TRIAGE',
        })
        await value.client.qualityJourney.update({
          where: { id: value.journeyId },
          data: { stage: 'TRIAGE', stateHash: triage.stateHash },
        })
        return triage.stateHash
      }
      let stateHash = await terminalize(initial.cycles[0]!.id, 'evidence-1')
      const rerun = async (sourceCycleId: string, receiptId: string, key: string) => {
        const proposal = await proposeQualityJourneyRerun(
          {
            journeyId: value.journeyId,
            targetProjectId: 'target-execution',
            sourceCycleId,
            sourceEvidenceReceiptIds: [receiptId],
            selectedScenarioRevisionIds: ['scenario-r1'],
            reason: 'repeat exact scenario',
            idempotencyKey: `proposal-${key}`,
          },
          value.client,
        )
        if (key === 'two') {
          expect(proposal.reportRevisionId).toBe('rerun-report')
          await value.client.qualityJourney.update({
            where: { id: value.journeyId },
            data: { activeTriageReportId: null },
          })
          await expect(
            approveQualityJourneyRerun(
              {
                journeyId: value.journeyId,
                targetProjectId: 'target-execution',
                proposalId: proposal.id,
                expectedProposalHash: proposal.proposalHash,
              },
              value.client,
            ),
          ).rejects.toMatchObject({ code: 'CONFLICT' })
          await value.client.qualityJourney.update({
            where: { id: value.journeyId },
            data: { activeTriageReportId: 'rerun-report' },
          })
        }
        await approveQualityJourneyRerun(
          {
            journeyId: value.journeyId,
            targetProjectId: 'target-execution',
            proposalId: proposal.id,
            expectedProposalHash: proposal.proposalHash,
          },
          value.client,
        )
        if (key === 'two') {
          expect(
            await value.client.qualityJourneyReportReview.findUnique({ where: { reportRevisionId: 'rerun-report' } }),
          ).toMatchObject({ kind: 'RERUN_APPROVED' })
          await expect(
            requestQualityJourneyReportRevision(
              {
                journeyId: value.journeyId,
                targetProjectId: 'target-execution',
                reportRevisionId: 'rerun-report',
                expectedReportHash: digest('e'),
                expectedStateHash: stateHash,
                idempotencyKey: 'competing-report-review',
                feedback: 'Cannot supersede an approved rerun.',
              },
              value.client,
            ),
          ).rejects.toMatchObject({ code: 'CONFLICT' })
        }
        const first = await startQualityJourneyRerun(
          {
            journeyId: value.journeyId,
            targetProjectId: 'target-execution',
            proposalId: proposal.id,
            environmentId: 'environment-execution',
            expectedStateHash: stateHash,
            idempotencyKey: `rerun-${key}`,
          },
          value.client,
        )
        expect(first).toHaveProperty('consentRequired')
        const consent = await value.client.qualityJourneyExecutionConsent.findFirstOrThrow({
          where: { status: 'REQUESTED' },
          orderBy: { createdAt: 'desc' },
        })
        await grantQualityJourneyExecutionConsent(
          {
            journeyId: value.journeyId,
            targetProjectId: 'target-execution',
            executionConsentId: consent.id,
            expectedScopeHash: consent.scopeHash,
          },
          value.client,
        )
        return startQualityJourneyRerun(
          {
            journeyId: value.journeyId,
            targetProjectId: 'target-execution',
            proposalId: proposal.id,
            environmentId: 'environment-execution',
            expectedStateHash: stateHash,
            executionConsentId: consent.id,
            idempotencyKey: `rerun-${key}`,
          },
          value.client,
        )
      }
      const first = startedExecution(await rerun(initial.cycles[0]!.id, 'evidence-1', 'one'))
      expect(initial.cycles[0]!.testRuns).toHaveLength(2)
      expect(first.cycles[0]!.testRuns).toHaveLength(1)
      stateHash = await terminalize(first.cycles[0]!.id, 'evidence-2')
      // Report review supports the same managed rerun, bound to the exact reviewed report.
      const active = await value.client.qualityJourney.findUniqueOrThrow({ where: { id: value.journeyId } })
      await value.client.qualityJourneyWorkItem.create({
        data: {
          id: 'rerun-report-work',
          journeyId: value.journeyId,
          targetProjectId: 'target-execution',
          cycleId: active.activeCycleId,
          role: 'TRIAGER',
          status: 'COMPLETED',
          inputHash: digest('d'),
          roleContractDigest: digest('d'),
        },
      })
      await value.client.qualityJourneyTriageAssignment.create({
        data: {
          id: 'rerun-report-assignment',
          journeyId: value.journeyId,
          executionCycleId: first.cycles[0]!.id,
          workItemId: 'rerun-report-work',
          inputHash: digest('d'),
          inputJson: '{}',
        },
      })
      await value.client.qualityJourneyTriageReport.create({
        data: {
          id: 'rerun-report',
          journeyId: value.journeyId,
          assignmentId: 'rerun-report-assignment',
          contentHash: digest('e'),
          reportJson: '{}',
          idempotencyKey: 'rerun-report',
          requestHash: digest('e'),
        },
      })
      await expect(
        value.client.qualityJourneyReportReview.create({
          data: {
            id: 'bad-successor-review',
            journeyId: value.journeyId,
            reportRevisionId: 'rerun-report',
            kind: 'AUTOMATION_CORRECTION_APPROVED',
            feedback: 'bad',
            idempotencyKey: 'bad-successor',
            requestHash: digest('d'),
            successorCycleId: 'nonexistent-cycle',
          },
        }),
      ).rejects.toThrow(/successor scope mismatch|Foreign key constraint/)
      const foreignJourney = await createQualityJourney(
        {
          targetProjectId: 'target-execution',
          idempotencyKey: 'foreign-rerun-review-journey',
          requirement: { objective: 'Other journey.' },
        },
        value.client,
      )
      await expect(
        value.client.qualityJourneyReportReview.create({
          data: {
            id: 'cross-successor-review',
            journeyId: value.journeyId,
            reportRevisionId: 'rerun-report',
            kind: 'AUTOMATION_CORRECTION_APPROVED',
            feedback: 'bad',
            idempotencyKey: 'cross-successor',
            requestHash: digest('d'),
            successorCycleId: foreignJourney.journey.activeCycleId,
          },
        }),
      ).rejects.toThrow(/successor scope mismatch|Foreign key constraint/)
      const reviewed = createQualityJourneyKernelState({
        journeyId: value.journeyId,
        targetProjectId: 'target-execution',
        activeCycleId: active.activeCycleId,
        stage: 'REPORT_REVIEW',
      })
      await value.client.qualityJourney.update({
        where: { id: value.journeyId },
        data: { stage: 'REPORT_REVIEW', stateHash: reviewed.stateHash, activeTriageReportId: 'rerun-report' },
      })
      stateHash = reviewed.stateHash
      const second = startedExecution(await rerun(first.cycles[0]!.id, 'evidence-2', 'two'))
      expect(second.cycles[0]!.id).not.toBe(first.cycles[0]!.id)
      expect(await value.client.qualityJourneyCycle.count({ where: { journeyId: value.journeyId } })).toBe(3)
    } finally {
      await value.client.$disconnect()
    }
  })
})
