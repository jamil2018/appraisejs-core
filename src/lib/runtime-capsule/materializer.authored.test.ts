import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  builtInStepDefinitions,
  computeStepDefinitionHashes,
  computeStepReferenceHash,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashCanonical } from '@/lib/quality-design/state'

const { state, sealedCommandInputs, locatorFindMany, capsuleCreate, materializeFile } = vi.hoisted(() => {
  const frozen = {
    id: 'environment-1',
    targetProjectId: 'target-1',
    name: 'Frozen Sauce Demo',
    baseUrl: 'https://frozen.saucedemo.test',
    expectedPageTitle: null,
    apiBaseUrl: null,
    username: 'frozen-user',
    hasPassword: true,
    credentialBindingState: 'REFERENCE_CONFIGURED' as const,
    credentialReference: 'FROZEN_PASSWORD',
    scopeVersion: 7,
  }
  return {
    state: {
      sealed: null as Record<string, unknown> | null,
      frozen,
      testRun: null as Record<string, unknown> | null,
    },
    sealedCommandInputs: [] as Array<Record<string, unknown>>,
    locatorFindMany: vi.fn(async () => []),
    capsuleCreate: vi.fn(async () => ({ id: 'capsule-1', validationHash: `sha256:${'c'.repeat(64)}` })),
    materializeFile: vi.fn(async () => undefined),
  }
})

vi.mock('./step-definition-closure', () => ({
  resolveRuntimeStepDefinitionClosure: vi.fn(async () => [state.sealed]),
}))
vi.mock('./command-receipt-sealer', () => ({
  sealCapsuleCommandReceipt: vi.fn(async (input: Record<string, unknown>) => {
    sealedCommandInputs.push(input)
    return { schemaVersion: 'test' }
  }),
}))
vi.mock('./command-receipt-contract', () => ({
  canonicalCapsuleCommandReceipt: vi.fn((value: unknown) => JSON.stringify(value)),
  hashCapsuleCommandReceipt: vi.fn(() => `sha256:${'b'.repeat(64)}`),
}))
vi.mock('./project-manifest', () => ({
  ManagedProjectManifestRepository: class {
    async refresh() {}
  },
}))
vi.mock('./lease-repository', () => ({
  RuntimeCapsuleLeaseRepository: class {
    async acquire() {
      return { ownerToken: 'lease-token' }
    }
    async renew() {}
    async release() {
      return true
    }
  },
}))
vi.mock('./repository', () => ({
  RuntimeCapsuleBlobRepository: class {
    async put() {
      return { storagePath: 'cache/blobs/test' }
    }
  },
  RuntimeCapsuleRepository: class {
    async create() {
      return capsuleCreate()
    }
  },
}))
vi.mock('./storage', async importOriginal => {
  const actual = await importOriginal<typeof import('./storage')>()
  return { ...actual, materializeRuntimeCapsuleFile: materializeFile }
})

import { RuntimeCapsuleMaterializer } from './materializer'
import { frozenEnvironmentSnapshot } from '@/lib/quality-design/frozen-environment-snapshot'
import { validationArtifactSchema } from '@/lib/quality-design/validation-artifact-contract'

const definition = builtInStepDefinitions.find(item => item.inputs.length === 0)!
const hashes = computeStepDefinitionHashes(definition)
const step = {
  id: definition.identity.id,
  version: definition.identity.version,
  definitionHash: computeStepReferenceHash(definition),
}
state.sealed = {
  step,
  definition,
  hashes: {
    definition: hashes.definitionHash,
    humanProjection: hashes.humanProjectionHash,
    agentContract: hashes.agentContractHash,
    execution: hashes.executionHash,
    publicationReceipt: `sha256:${'a'.repeat(64)}`,
  },
}

function authoredRun(kind: 'REMOTE_BLACK_BOX' | 'LOCAL_WORKSPACE' = 'REMOTE_BLACK_BOX') {
  const frozen = state.frozen
  return {
    id: 'test-run-1',
    runId: 'authored-run-1',
    targetProjectId: 'target-1',
    environmentId: frozen.id,
    intent: 'INDEPENDENT',
    browserEngine: 'CHROMIUM',
    targetProject: { kind, fingerprint: `sha256:${'d'.repeat(64)}` },
    // These mutable values must never reach a remote command receipt.
    environment: {
      id: frozen.id,
      targetProjectId: frozen.targetProjectId,
      name: frozen.name,
      baseUrl: 'https://mutated.invalid',
      expectedPageTitle: null,
      apiBaseUrl: null,
      username: 'mutated-user',
      credentialState: 'REFERENCE_CONFIGURED',
      passwordEnvironmentVariable: 'MUTATED_PASSWORD',
      scopeVersion: frozen.scopeVersion,
    },
    environmentSnapshotJson: canonicalContractJson(frozen),
    environmentSnapshotHash: hashCanonical(frozen),
    environmentSnapshotVersion: frozen.scopeVersion,
    assessmentRunBinding: null,
    testCases: [
      {
        testSuite: { id: 'suite-1', targetProjectId: 'target-1', name: 'Authored suite' },
        testCaseId: 'case-1',
        testCase: {
          id: 'case-1',
          targetProjectId: 'target-1',
          title: 'Authored case',
          description: null,
          steps: [
            {
              id: 'case-step-1',
              order: 1,
              label: null,
              gherkinStep: 'Given the fixture is ready',
              invocationJson: JSON.stringify({ step, inputs: {} }),
            },
          ],
        },
      },
    ],
  }
}

function client() {
  return {
    testRun: { findUniqueOrThrow: vi.fn(async () => state.testRun) },
    qualityValidationPublication: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: 'publication-1',
        phase: 'review_ready',
        targetProjectId: 'target-1',
        targetProject: { kind: 'REMOTE_BLACK_BOX' },
        validationVersion: {},
        extensionReviews: [],
        qualityPlanRevisionId: 'revision-1',
        validationProjectionJson: '{}',
      })),
    },
    locator: { findMany: locatorFindMany },
    stepReviewedExtension: { findMany: vi.fn(async () => []) },
  }
}

describe('authored RuntimeCapsuleMaterializer remote environment packets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sealedCommandInputs.splice(0)
    state.testRun = authoredRun()
  })

  it.each([
    ['missing', { environmentSnapshotJson: undefined }],
    ['null JSON', { environmentSnapshotJson: null }],
    ['null hash', { environmentSnapshotHash: null }],
    ['tampered', { environmentSnapshotHash: `sha256:${'9'.repeat(64)}` }],
  ])(
    'rejects a remote Quality %s packet before parsing, locator resolution, receipt, or capsule writes',
    async (_name, override) => {
      state.testRun = { ...authoredRun(), ...override }
      const parse = vi.spyOn(validationArtifactSchema, 'parse')
      try {
        await expect(
          new RuntimeCapsuleMaterializer(client() as never, '/tmp/appraise-quality-test').materializeQuality({
            publicationId: 'publication-1',
            testRunId: 'test-run-1',
          }),
        ).rejects.toThrow()
        expect(parse).not.toHaveBeenCalled()
        expect(locatorFindMany).not.toHaveBeenCalled()
        expect(sealedCommandInputs).toEqual([])
        expect(materializeFile).not.toHaveBeenCalled()
        expect(capsuleCreate).not.toHaveBeenCalled()
      } finally {
        parse.mockRestore()
      }
    },
  )

  it('rejects a publication whose v2 authority alone is foreign before parsing or capsule writes', async () => {
    const testClient = client()
    testClient.qualityValidationPublication.findUniqueOrThrow.mockResolvedValue({
      id: 'publication-1',
      phase: 'review_ready',
      targetProjectId: 'target-1',
      targetProject: { kind: 'REMOTE_BLACK_BOX' },
      validationVersion: {},
      extensionReviews: [],
      qualityPlanRevisionId: 'revision-1',
      validationProjectionJson: '{}',
      preflightAlgorithmVersion: 'appraise.quality-assessment-preflight/v2',
      preflightDisposition: 'ACTIVE',
      preflightAuthority: 'foreign:authority',
    } as never)
    const parse = vi.spyOn(validationArtifactSchema, 'parse')
    try {
      await expect(
        new RuntimeCapsuleMaterializer(testClient as never, '/tmp/appraise-quality-authority').materializeQuality({
          publicationId: 'publication-1',
          testRunId: 'test-run-1',
        }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        details: { code: 'preflight_algorithm_unsupported', targetOutcome: 'not_evaluated' },
      })
      expect(parse).not.toHaveBeenCalled()
      expect(locatorFindMany).not.toHaveBeenCalled()
      expect(sealedCommandInputs).toEqual([])
      expect(materializeFile).not.toHaveBeenCalled()
      expect(capsuleCreate).not.toHaveBeenCalled()
    } finally {
      parse.mockRestore()
    }
  })

  it('does not trust a valid packet seen before materializer re-reads a now-corrupt remote TestRun', async () => {
    const testClient = client()
    const valid = authoredRun()
    const corrupt = { ...authoredRun(), environmentSnapshotJson: null }
    testClient.testRun.findUniqueOrThrow.mockResolvedValueOnce(valid).mockResolvedValueOnce(corrupt)
    const callerObserved = await (
      testClient.testRun.findUniqueOrThrow as (args: unknown) => Promise<Record<string, unknown>>
    )({ where: { id: 'test-run-1' } })
    expect(frozenEnvironmentSnapshot(callerObserved as never, { required: true })).toEqual(state.frozen)

    const parse = vi.spyOn(validationArtifactSchema, 'parse')
    try {
      await expect(
        new RuntimeCapsuleMaterializer(testClient as never, '/tmp/appraise-quality-toctou').materializeQuality({
          publicationId: 'publication-1',
          testRunId: 'test-run-1',
        }),
      ).rejects.toThrow('lacks its required frozen environment snapshot')
      expect(parse).not.toHaveBeenCalled()
      expect(locatorFindMany).not.toHaveBeenCalled()
      expect(sealedCommandInputs).toEqual([])
      expect(materializeFile).not.toHaveBeenCalled()
      expect(capsuleCreate).not.toHaveBeenCalled()
    } finally {
      parse.mockRestore()
    }
  })

  it('materializes an actual remote authored run from the frozen origin and credential reference after its Environment row changes', async () => {
    const result = await new RuntimeCapsuleMaterializer(
      client() as never,
      '/tmp/appraise-authored-test',
    ).materializeAuthored({
      testRunId: 'test-run-1',
    })

    expect(result.manifest.source).toMatchObject({
      kind: 'AUTHORED_TEST_SNAPSHOT',
      snapshot: {
        remoteEnvironment: {
          snapshotHash: hashCanonical(state.frozen),
          snapshotVersion: 7,
          binding: {
            baseUrl: 'https://frozen.saucedemo.test',
            username: 'frozen-user',
            credentialState: 'REFERENCE_CONFIGURED',
            passwordEnvironmentVariable: 'FROZEN_PASSWORD',
          },
        },
      },
    })
    expect(sealedCommandInputs).toHaveLength(1)
    expect((sealedCommandInputs[0]!.testRun as { environment: unknown }).environment).toMatchObject({
      baseUrl: 'https://frozen.saucedemo.test',
      username: 'frozen-user',
      credentialState: 'REFERENCE_CONFIGURED',
      passwordEnvironmentVariable: 'FROZEN_PASSWORD',
    })
  })

  it.each([
    ['missing JSON', { environmentSnapshotJson: null }],
    ['invalid JSON', { environmentSnapshotJson: '{bad' }],
    ['wrong hash', { environmentSnapshotHash: `sha256:${'9'.repeat(64)}` }],
    ['wrong scope version', { environmentSnapshotVersion: 8 }],
  ])('rejects an invalid remote %s packet before authored resolution or sealing', async (_name, override) => {
    state.testRun = { ...authoredRun(), ...override }
    await expect(
      new RuntimeCapsuleMaterializer(client() as never, '/tmp/appraise-authored-test').materializeAuthored({
        testRunId: 'test-run-1',
      }),
    ).rejects.toThrow()
    expect(locatorFindMany).not.toHaveBeenCalled()
    expect(sealedCommandInputs).toEqual([])
  })

  it('keeps local authored materialization compatible when no remote packet exists', async () => {
    const local = authoredRun('LOCAL_WORKSPACE') as Record<string, unknown>
    local.environmentSnapshotJson = null
    local.environmentSnapshotHash = null
    local.environmentSnapshotVersion = null
    state.testRun = local
    await expect(
      new RuntimeCapsuleMaterializer(client() as never, '/tmp/appraise-authored-test').materializeAuthored({
        testRunId: 'test-run-1',
      }),
    ).resolves.toMatchObject({ row: { id: 'capsule-1' } })
    expect((sealedCommandInputs[0]!.testRun as { environment: { baseUrl: string } }).environment.baseUrl).toBe(
      'https://mutated.invalid',
    )
  })
})

describe('Journey prepared source materialization', () => {
  function journeyClient() {
    state.testRun = authoredRun()
    const run = state.testRun as ReturnType<typeof authoredRun>
    Object.assign(run, { qualityJourneyExecutionBinding: { id: 'binding-1' } })
    run.testCases[0].testCase.title = 'MUTATED catalog title'
    run.testCases[0].testCase.steps[0].invocationJson = '{}'
    const binding = {
      schemaVersion: 'appraise.quality-journey/v1',
      targetProjectId: 'target-1',
      moduleId: 'module-1',
      suite: { id: 'suite-1', name: 'Approved suite', description: null },
      testCase: {
        id: 'case-1',
        title: 'Approved scenario',
        description: 'Frozen intent',
        steps: [
          {
            order: 1,
            gherkinStep: 'Given the fixture is ready',
            label: 'Frozen step',
            icon: 'check',
            invocationJson: JSON.stringify({ step, inputs: {} }),
          },
        ],
      },
    }
    const resources = [{ id: `step:${step.id}:${step.version}`, contentHash: hashes.definitionHash }]
    const preparedIdentity = {
      schemaVersion: 'appraise.quality-journey/v1',
      capsuleId: 'prepared-1',
      journeyId: 'journey-1',
      targetProjectId: 'target-1',
      cycleId: 'cycle-1',
      materializationId: 'materialization-1',
      inputHash: hashCanonical({}),
      manifestHash: hashCanonical({}),
      status: 'PREPARED',
    }
    const source = {
      preparedCapsuleId: 'prepared-1',
      capsuleHash: hashCanonical(preparedIdentity),
      manifestHash: hashCanonical({}),
      manifestJson: '{}',
      materializationId: 'materialization-1',
      scenarioRevisionId: 'scenario-1',
      scenarioContentHash: hashCanonical({}),
      targetBindingId: 'binding-1',
      targetBindingHash: hashCanonical(binding),
      testCaseId: 'case-1',
      suiteId: 'suite-1',
      resourceHashes: resources,
    }
    const cycle = {
      targetFingerprint: `sha256:${'d'.repeat(64)}`,
      environmentSnapshotJson: run.environmentSnapshotJson,
      environmentSnapshotHash: run.environmentSnapshotHash,
      environmentSnapshotVersion: run.environmentSnapshotVersion,
      id: 'execution-1',
      journeyId: 'journey-1',
      cycleId: 'cycle-1',
      targetProjectId: 'target-1',
      environmentId: state.frozen.id,
      browserEngine: 'CHROMIUM',
      preparedCapsulesJson: canonicalContractJson([source]),
      preparedCapsulesHash: hashCanonical([source]),
    }
    const owner = {
      preparedCapsuleId: 'prepared-1',
      runId: run.runId,
      executionCycle: cycle,
      testRun: { ...run, testCases: [{ testCaseId: 'case-1', testSuiteId: 'suite-1' }] },
    }
    return {
      ...client(),
      qualityJourneyPreparedRuntimeCapsule: {
        findUniqueOrThrow: vi.fn(async () => ({
          ...preparedIdentity,
          id: 'prepared-1',
          manifestJson: '{}',
          capsuleHash: source.capsuleHash,
          materialization: {
            scenarioRevisionId: 'scenario-1',
            scenarioContentHash: hashCanonical({}),
            status: 'MATERIALIZED',
          },
        })),
      },
      qualityJourneyExecutionTestRun: { findUniqueOrThrow: vi.fn(async () => owner) },
      qualityJourneyAutomationTargetBinding: {
        findUniqueOrThrow: vi.fn(async () => ({
          bindingJson: canonicalContractJson(binding),
          resourceHashJson: canonicalContractJson(resources),
        })),
      },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    sealedCommandInputs.splice(0)
  })

  it('executes the immutable approved packet even after catalog title and invocation bytes change', async () => {
    const result = await new RuntimeCapsuleMaterializer(
      journeyClient() as never,
      '/tmp/appraise-journey-test',
    ).materializeJourneyPrepared({ testRunId: 'test-run-1' })
    expect(result.manifest.rootInvocations).toEqual([{ step, inputs: {} }])
    expect(result.manifest.source).toMatchObject({
      kind: 'AUTHORED_TEST_SNAPSHOT',
      snapshot: {
        journey: { journeyId: 'journey-1', executionCycleId: 'execution-1', preparedCapsuleId: 'prepared-1' },
        selection: [{ testCase: { title: 'Approved scenario' } }],
      },
    })
  })

  it('rejects a different valid environment snapshot before capsule materialization', async () => {
    const db = journeyClient()
    const owner = await db.qualityJourneyExecutionTestRun.findUniqueOrThrow()
    owner.testRun.environmentSnapshotHash = hashCanonical({ redirected: true })
    await expect(
      new RuntimeCapsuleMaterializer(db as never, '/tmp/appraise-journey-test').materializeJourneyPrepared({
        testRunId: 'test-run-1',
      }),
    ).rejects.toThrow('differs from its immutable execution cycle')
    expect(db.qualityJourneyPreparedRuntimeCapsule.findUniqueOrThrow).not.toHaveBeenCalled()
  })

  it('blocks corrupt frozen binding before capsule writes', async () => {
    const db = journeyClient()
    db.qualityJourneyAutomationTargetBinding.findUniqueOrThrow.mockImplementation(async () => ({
      bindingJson: '{}',
      resourceHashJson: '[]',
    }))
    await expect(
      new RuntimeCapsuleMaterializer(db as never, '/tmp/appraise-journey-test').materializeJourneyPrepared({
        testRunId: 'test-run-1',
      }),
    ).rejects.toThrow()
    expect(capsuleCreate).not.toHaveBeenCalled()
  })
})
