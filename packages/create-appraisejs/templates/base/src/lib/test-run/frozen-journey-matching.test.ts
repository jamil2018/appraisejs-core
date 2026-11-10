import { describe, expect, it } from 'vitest'
import {
  validateFrozenJourneySelection,
  requiresFrozenJourneyMatching,
  matchFrozenJourneyScenario,
  reconcileFrozenJourneyReport,
  type FrozenJourneyRun,
} from './matching'
import { generateReviewedFeature } from '@/lib/runtime-capsule/file-generator'
import type { SelectedTestNode } from '@/lib/runtime-capsule/selected-test-contract'
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
      reviewedBy: 'synthetic-fixture-reviewer',
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

describe('retained Journey matching R11/R12', () => {
  it('uses the actual generated validation/suite/case triple after live metadata and lifecycle drift', () => {
    const { run } = frozenFixture()
    const feature = generateReviewedFeature({
      id: 'capturedValidation',
      appraiseArtifacts: {
        testSuites: [{ id: 'suite', name: 'Frozen suite', testCaseIds: ['case'] }],
        testCases: [
          { id: 'case', title: 'Identical title', steps: [{ order: 1, gherkinStep: 'Given fixture is checked' }] },
        ],
      },
    } as unknown as SelectedTestNode)
    const generatedTags = feature
      .split('\n')
      .find(line => line.includes('@appraise_validation_'))!
      .trim()
      .split(' ')
    Object.assign(run.testCases[0]!, {
      testCase: { title: 'Changed', tags: [{ name: '@tc_foreign' }] },
      testSuite: { name: 'Changed', tags: [] },
    })
    Object.assign(run, { use: { state: 'RELEASED' }, session: { status: 'SUPERSEDED' } })
    const frozen = validateFrozenJourneySelection(run)
    expect(frozen.ok).toBe(true)
    if (!frozen.ok) throw new Error(frozen.reason)
    expect(matchFrozenJourneyScenario(frozen.selection, generatedTags)).toMatchObject({
      ok: true,
      expectedCase: { link: { id: 'link' } },
    })
    expect(reconcileFrozenJourneyReport(frozen.selection, [{ scenarioTags: generatedTags }])).toMatchObject({
      ok: true,
      matchedScenarios: 1,
      unexecutedExpectedTestCases: 0,
    })
  })

  it.each([
    [
      'missing manifest',
      (run: FrozenJourneyRun) => {
        run.runtimeCapsule = null
      },
    ],
    [
      'missing binding',
      (run: FrozenJourneyRun) => {
        run.qualityJourneyExecutionBinding = null
      },
    ],
    [
      'corrupt manifest',
      (run: FrozenJourneyRun) => {
        run.runtimeCapsule!.manifestJson += ' '
      },
    ],
    [
      'foreign manifest hash',
      (run: FrozenJourneyRun) => {
        run.runtimeCapsule!.manifestHash = hashRuntimeCapsuleValue({ foreign: true })
      },
    ],
    [
      'foreign cycle',
      (run: FrozenJourneyRun) => {
        run.qualityJourneyExecutionBinding!.executionCycleId = 'foreign'
      },
    ],
    [
      'foreign prepared',
      (run: FrozenJourneyRun) => {
        run.qualityJourneyExecutionBinding!.preparedCapsuleId = 'foreign'
      },
    ],
    [
      'foreign run',
      (run: FrozenJourneyRun) => {
        run.runId = 'foreign'
      },
    ],
    [
      'foreign target',
      (run: FrozenJourneyRun) => {
        run.targetProjectId = 'foreign'
      },
    ],
    [
      'swapped intent',
      (run: FrozenJourneyRun) => {
        run.intent = 'INDEPENDENT'
      },
    ],
    [
      'missing link',
      (run: FrozenJourneyRun) => {
        run.testCases = []
      },
    ],
    [
      'SetNull suite link',
      (run: FrozenJourneyRun) => {
        run.testCases[0]!.testSuiteId = null
      },
    ],
    [
      'foreign link owner',
      (run: FrozenJourneyRun) => {
        run.testCases[0]!.testRunId = 'foreign'
      },
    ],
  ] as const)('refuses %s without live reconstruction', (_name, mutate) => {
    const { run } = frozenFixture()
    mutate(run)
    expect(validateFrozenJourneySelection(run).ok).toBe(false)
    expect(requiresFrozenJourneyMatching(run)).toBe(true)
  })

  it('refuses incomplete, foreign or conflicting triples and whole-report duplicates, omissions and extras', () => {
    const { run, tags } = frozenFixture()
    const frozen = validateFrozenJourneySelection(run)
    if (!frozen.ok) throw new Error(frozen.reason)
    for (const scenarioTags of [
      tags.slice(1),
      [...tags.slice(0, 2), '@tc_foreign'],
      [...tags, '@tc_foreign'],
      [...tags, tags[0]!],
    ])
      expect(matchFrozenJourneyScenario(frozen.selection, scenarioTags).ok).toBe(false)
    for (const scenarios of [
      [],
      [{ scenarioTags: tags }, { scenarioTags: tags }],
      [{ scenarioTags: tags }, { scenarioTags: ['@tc_foreign'] }],
    ])
      expect(reconcileFrozenJourneyReport(frozen.selection, scenarios).ok).toBe(false)
  })

  it('detects independently rehashed snapshot/selection contradiction and preserves independent routing', () => {
    const { run, manifest } = frozenFixture()
    const snapshot = manifest.source.snapshot as { selection: Array<{ testCase: { id: string } }> }
    snapshot.selection[0]!.testCase.id = 'foreign'
    manifest.source.sourceHash = hashRuntimeCapsuleValue(snapshot)
    run.runtimeCapsule!.manifestJson = canonicalRuntimeCapsuleJson(manifest)
    run.runtimeCapsule!.manifestHash = hashRuntimeCapsuleValue(manifest)
    expect(validateFrozenJourneySelection(run).ok).toBe(false)
    run.intent = 'INDEPENDENT'
    run.qualityJourneyExecutionBinding = null
    expect(requiresFrozenJourneyMatching(run)).toBe(true)
    expect(
      requiresFrozenJourneyMatching({
        intent: 'INDEPENDENT',
        qualityJourneyExecutionBinding: null,
        runtimeCapsule: null,
      }),
    ).toBe(false)
  })
})
