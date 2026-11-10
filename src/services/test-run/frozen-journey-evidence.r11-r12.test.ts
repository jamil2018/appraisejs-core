import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient, Environment } from '@prisma/client'
import type { FrozenJourneyRun } from '@/lib/test-run/matching'
import { summarizeRunEvidence } from './run-evidence-summary-service'
import { storeReportFromFileService } from '@/services/report/report-service'
import { scheduleTestRunCompletion } from './test-run-service'
import type { TestRunExecutionResult } from '@/lib/executor/types'
import {
  canonicalRuntimeCapsuleJson,
  hashRuntimeCapsuleValue,
  runtimeCapsuleManifestSchema,
} from '@/lib/runtime-capsule/contracts'
import {
  computeStepDefinitionHashes,
  computeStepReferenceHash,
  stepDefinitionSchema,
} from '../../../packages/cucumber-runtime/src/step-definitions/contracts'

const harness = vi.hoisted(() => ({
  report: {} as unknown,
  handlers: new Map<string, (...args: never[]) => unknown>(),
}))
vi.mock('@/config/db-config', () => ({ default: {} }))
vi.mock('@/services/test-run/test-run-artifact-context', () => ({
  createTestRunArtifactAccess: vi.fn(),
  createTestRunArtifactContext: vi.fn(),
  readTestRunArtifactText: vi.fn(async () => '{}'),
}))
vi.mock('@/lib/test-run/report-parser', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/test-run/report-parser')>()),
  parseCucumberReportText: () => harness.report,
}))
vi.mock('@/lib/test-run/process-manager', () => ({
  processManager: {
    on: (event: string, listener: (...args: never[]) => unknown) => harness.handlers.set(event, listener),
    removeListener: (event: string) => harness.handlers.delete(event),
    get: () => undefined,
  },
}))
function frozenFixture() {
  const hash = hashRuntimeCapsuleValue({ fixture: 'r10-r12-offline-only' })
  const prepared = {
    preparedCapsuleId: 'prepared',
    materializationId: 'materialization',
    testCaseId: 'case',
    suiteId: 'suite',
    capsuleHash: hash,
    manifestHash: hashRuntimeCapsuleValue({}),
    manifestJson: '{}',
    scenarioRevisionId: 'revision',
    scenarioContentHash: hash,
    targetBindingId: 'targetBinding',
    targetBindingHash: hash,
    resourceHashes: [],
  }
  const cycle = {
    id: 'execution',
    journeyId: 'journey',
    targetProjectId: 'project',
    cycleId: 'phaseCycle',
    targetFingerprint: 'fingerprint',
    environmentId: 'environment',
    browserEngine: 'CHROMIUM',
    environmentSnapshotJson: '{}',
    environmentSnapshotHash: hashRuntimeCapsuleValue({}),
    environmentSnapshotVersion: 1,
    preparedCapsulesJson: canonicalRuntimeCapsuleJson([prepared]),
    preparedCapsulesHash: hashRuntimeCapsuleValue([prepared]),
  }
  const snapshot = {
    schemaVersion: '1',
    targetProjectId: 'project',
    targetFingerprint: 'fingerprint',
    environmentId: 'environment',
    browserEngine: 'CHROMIUM',
    environmentSnapshotHash: cycle.environmentSnapshotHash,
    journey: {
      targetFingerprint: 'fingerprint',
      journeyId: 'journey',
      executionCycleId: 'execution',
      cycleId: 'phaseCycle',
      ...prepared,
    },
    selection: [
      { suite: { id: 'suite', name: 'Frozen suite' }, testCase: { id: 'case', title: 'Identical title', steps: [] } },
    ],
  }
  const definition = stepDefinitionSchema.parse({
    schemaVersion: '1',
    identity: { id: 'fixture.assert', version: '1', status: 'ready' },
    provenance: {
      creationMethod: 'human-form',
      createdBy: 'offline-test',
      createdAt: '2026-10-29T00:00:00.000Z',
      reviewedBy: 'offline-reviewer',
    },
    intent: {
      title: 'Fixture assertion',
      description: 'Offline immutable identity fixture',
      capabilities: ['fixture.assert'],
      searchTerms: [],
      examples: ['Assert fixture'],
    },
    inputs: [],
    outputs: [],
    human: {
      signature: 'fixture is checked',
      keywordCompatibility: ['Given'],
      parameterBindings: [],
      groupId: 'fixture',
    },
    agent: {
      summary: 'Check fixture',
      usageGuidance: 'Offline only',
      examples: [{ intent: 'Check fixture', inputs: {} }],
    },
    execution: { kind: 'operation', handlerId: 'fixture.assert', handlerVersion: '1', runtime: 'node' },
    lifecycle: {},
  })
  const step = {
    id: definition.identity.id,
    version: definition.identity.version,
    definitionHash: computeStepReferenceHash(definition),
  }
  const manifest = runtimeCapsuleManifestSchema.parse({
    schemaVersion: '2',
    projectId: 'project',
    runId: 'run',
    validationHash: hashRuntimeCapsuleValue(snapshot),
    operationHash: hash,
    projectionHash: hash,
    receiptHash: hash,
    runtimeInputHash: hash,
    source: { kind: 'AUTHORED_TEST_SNAPSHOT', sourceHash: hashRuntimeCapsuleValue(snapshot), snapshot },
    commandReceipt: { path: 'command-receipt.json', hash },
    generator: { id: 'appraise.validation-ast-capsule', version: '2' },
    expectedCases: [
      { validationId: 'capturedValidation', suiteId: 'suite', caseId: 'case', scenarioId: 'capturedScenario' },
    ],
    files: [{ path: 'command-receipt.json', role: 'command-receipt', hash, size: 1 }],
    rootInvocations: [{ step, inputs: {} }],
    stepDefinitions: [{ step, definition, ...computeStepDefinitionHashes(definition), publicationReceiptHash: hash }],
  })
  const run: FrozenJourneyRun = {
    id: 'dbRun',
    runId: 'run',
    intent: 'QUALITY_JOURNEY',
    targetProjectId: 'project',
    environmentId: 'environment',
    browserEngine: 'CHROMIUM',
    environmentSnapshotJson: cycle.environmentSnapshotJson,
    environmentSnapshotHash: cycle.environmentSnapshotHash,
    environmentSnapshotVersion: 1,
    runtimeCapsule: {
      id: 'capsule',
      targetProjectId: 'project',
      testRunId: 'dbRun',
      validationHash: manifest.validationHash,
      manifestHash: hashRuntimeCapsuleValue(manifest),
      manifestJson: canonicalRuntimeCapsuleJson(manifest),
    },
    qualityJourneyExecutionBinding: {
      id: 'binding',
      executionCycleId: 'execution',
      preparedCapsuleId: 'prepared',
      testRunId: 'dbRun',
      runId: 'run',
      executionCycle: cycle,
    },
    testCases: [{ id: 'link', testRunId: 'dbRun', testCaseId: 'case', testSuiteId: 'suite' }],
  }
  const tags = ['@appraise_validation_capturedValidation', '@ts_suite', '@tc_case']
  return { run, manifest, tags }
}

function evidenceHarness() {
  const { run, tags } = frozenFixture()
  const row = Object.assign(run, {
    name: 'Offline test',
    status: 'COMPLETED',
    result: 'PASSED',
    reportPath: 'reports/cucumber.json',
    logPath: 'logs/cucumber.log',
    logs: { logs: '' },
    targetProject: { kind: 'LOCAL' },
    runtimeCapsuleExecutionAttempt: {
      id: 'attempt',
      ownerToken: 'owner',
      testRunId: 'dbRun',
      capsuleId: 'capsule',
      state: 'RUNNING',
      outputCompletedAt: null,
      version: 1,
    },
  })
  Object.assign(row.testCases[0]!, {
    testCase: { id: 'case', title: 'Misleading live title', tags: [] },
    testSuite: { id: 'suite', name: 'Changed', tags: [] },
  })
  const scenario = {
    name: 'Identical title',
    description: '',
    line: 1,
    keyword: 'Scenario',
    type: 'scenario',
    cucumberId: 'scenario',
    tags: tags.map(name => ({ name, line: 1 })),
    steps: [
      { keyword: 'Given', name: 'fixture is checked', status: 'passed', duration: 1, order: 1, line: 1, hidden: false },
    ],
    hooks: [],
  }
  harness.report = {
    features: [
      {
        name: 'Frozen feature',
        description: '',
        uri: 'features/frozen.feature',
        line: 1,
        keyword: 'Feature',
        tags: [],
        scenarios: [scenario],
      },
    ],
  }
  const create = () => vi.fn(async () => ({ id: 'reportRow' }))
  const client = {
    testRun: { findUnique: vi.fn(async () => row), update: vi.fn(async () => row) },
    testRunLog: {},
    testRunTestCase: { updateMany: vi.fn(async () => ({ count: 1 })) },
    report: { create: create() },
    reportFeature: { create: create() },
    reportFeatureTag: { create: create() },
    reportScenario: { create: create() },
    reportScenarioTag: { create: create() },
    reportStep: { create: create() },
    reportHook: { create: create() },
    reportTestCase: { create: create() },
    $transaction: vi.fn(),
  }
  client.$transaction.mockImplementation(async callback => callback(client))
  return { row, tags, scenario, client, db: client as unknown as PrismaClient }
}

describe('Journey status/report/summary share frozen selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    harness.handlers.clear()
  })

  it('keeps report links and frozen counts consistent after live tag/title and released-use drift', async () => {
    const { row, db, client } = evidenceHarness()
    Object.assign(row, { use: { state: 'RELEASED' }, session: { status: 'SUPERSEDED' } })
    expect(await summarizeRunEvidence('run', db)).toMatchObject({
      evidenceHealth: 'valid',
      counts: { expectedTestCases: 1, matchedScenarios: 1, unmatchedScenarios: 0 },
    })
    expect(await storeReportFromFileService('run', 'reports/cucumber.json', db)).toMatchObject({ success: true })
    expect(client.reportTestCase.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ testCaseId: 'case', testRunTestCaseId: 'link' }),
    })
  })

  it.each(['duplicate', 'unexpected', 'omitted', 'conflicting'])(
    'refuses %s report association and valid grading',
    async mutation => {
      const { scenario, db, client } = evidenceHarness()
      const report = harness.report as { features: Array<{ scenarios: (typeof scenario)[] }> }
      if (mutation === 'duplicate') report.features[0]!.scenarios.push(scenario)
      if (mutation === 'unexpected')
        report.features[0]!.scenarios.push({ ...scenario, tags: [{ name: '@tc_foreign', line: 1 }] })
      if (mutation === 'omitted') report.features[0]!.scenarios = []
      if (mutation === 'conflicting') scenario.tags.push({ name: '@tc_foreign', line: 1 })
      expect((await summarizeRunEvidence('run', db)).grade).not.toBe('valid')
      expect(await storeReportFromFileService('run', 'reports/cucumber.json', db)).toMatchObject({
        success: false,
        reason: 'storage_failed',
      })
      expect(client.reportTestCase.create).not.toHaveBeenCalled()
    },
  )

  it.each(['missing', 'corrupt', 'SetNull', 'intent', 'project', 'run'])(
    'refuses %s retained metadata across report and summary',
    async mutation => {
      const { row, db, client } = evidenceHarness()
      if (mutation === 'missing') row.qualityJourneyExecutionBinding = null
      if (mutation === 'corrupt') row.runtimeCapsule!.manifestHash = hashRuntimeCapsuleValue({ changed: true })
      if (mutation === 'SetNull') row.testCases[0]!.testSuiteId = null
      if (mutation === 'intent') row.intent = 'INDEPENDENT'
      if (mutation === 'project') row.targetProjectId = 'foreign'
      if (mutation === 'run') row.runId = 'foreign'
      expect(await summarizeRunEvidence('run', db)).toMatchObject({ evidenceHealth: 'invalid_stale_runtime' })
      expect(await storeReportFromFileService('run', 'reports/cucumber.json', db)).toMatchObject({ success: false })
      expect(client.reportTestCase.create).not.toHaveBeenCalled()
    },
  )

  it.each(['exact', 'foreign-owner', 'closed-range', 'wrong-tags', 'swapped-intent'])(
    'anchors status to captured owner and open attempt range: %s',
    async mutation => {
      const { row, tags, db, client } = evidenceHarness()
      row.status = 'RUNNING'
      await scheduleTestRunCompletion({
        testRun: { id: 'dbRun', runId: 'run' },
        environment: {} as Environment,
        logger: { info: vi.fn(), error: vi.fn() } as unknown as Parameters<
          typeof scheduleTestRunCompletion
        >[0]['logger'],
        launch: async () =>
          ({
            process: { name: 'inert-offline-process' },
            reportPath: 'reports/cucumber.json',
          }) as unknown as TestRunExecutionResult,
        executionAttempt: { id: 'attempt', ownerToken: 'owner' },
        client: db,
        waitForProcess: () => new Promise<number | null>(() => {}),
      })
      if (mutation === 'foreign-owner') row.runtimeCapsuleExecutionAttempt.ownerToken = 'foreign'
      if (mutation === 'closed-range')
        Object.assign(row.runtimeCapsuleExecutionAttempt, { outputCompletedAt: new Date() })
      if (mutation === 'wrong-tags') tags.push('@tc_foreign')
      if (mutation === 'swapped-intent') row.intent = 'INDEPENDENT'
      const callback = harness.handlers.get('scenario::end')! as (event: unknown) => Promise<void>
      await callback({
        testRunId: 'run',
        scenarioName: 'Identical title',
        status: 'passed',
        scenarioTags: tags,
        tracePath: 'reports/traces/frozen.zip',
      })
      if (mutation === 'exact')
        expect(client.testRunTestCase.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              id: 'link',
              testRunId: 'dbRun',
              testRun: expect.objectContaining({ id: 'dbRun', runId: 'run' }),
            }),
          }),
        )
      else expect(client.testRunTestCase.updateMany).not.toHaveBeenCalled()
    },
  )
})
