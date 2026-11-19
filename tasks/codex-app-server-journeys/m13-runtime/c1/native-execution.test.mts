import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lstatSync, mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describeNativeCredential } from '../../../../src/lib/quality-journey/codex-app-server/native-credential-topology'
import { nativeQualificationDigest } from '../../../../src/lib/quality-journey/codex-app-server/native-qualification-contract'
import { syntheticNativeManifest } from '../../../../src/lib/quality-journey/codex-app-server/native-qualification.test-support'
import { resetQualityJourneyExecutionRuntimeAdapter } from '../../../../src/services/coordinator/quality-journey-execution-service'
import {
  startQualityJourneyExecutionRuntime,
  cancelQualityJourneyExecutionRuntime,
  reconcileQualityJourneyExecutionRuntime,
} from '../../../../src/services/coordinator/quality-journey-runtime-service'
import { getQualityJourney } from '../../../../src/services/coordinator/quality-journey-service'
import {
  createM10DiscoveryMetadataRuntime,
  prepareM10AutomationFixture,
} from '../../../../src/test/m10-journey-fixture'
import { driverDigest } from './native-driver-control.mts'
import {
  createOriginalExecutionControl,
  captureNativeExecutionBudgets,
  sealedOriginalExecution,
  createOriginalExecutionAcquisition,
  type NativeExecutionObservation,
} from './native-execution-state.mts'
import { nativeExecutionRuntimeFunctions, prepareOriginalNativeExecution } from './native-execution.mts'
import { nativeSealedReportCandidate, nativeReportQualityAssessment } from './native-execution-report.mts'
import { scriptedDisposableHuman } from './native-lineage.mts'
import type { NativeExecutionPreparation, NativeClosureChoice } from './native-driver.mts'

function syntheticFixture() {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), 'm13-execution-synthetic-'))
  const filename = path.join(root, 'synthetic-auth.json')
  writeFileSync(filename, '{"synthetic":true}', { mode: 0o600 })
  const source = describeNativeCredential(filename),
    subjectDigest = driverDigest({ OFFLINE_SYNTHETIC: true })
  const actualReviewPath = path.join(root, 'actual-review.txt')
  writeFileSync(actualReviewPath, 'OFFLINE_SYNTHETIC source-state test; authorizes no runtime effect.')
  function control(subject = subjectDigest) {
    const body = JSON.stringify({
      version: 'M13_NATIVE_DRIVER_CONTROL_V1',
      decision: 'ACCEPT',
      kind: 'EXECUTION',
      subjectDigest: subject,
      reviewerId: 'offline-test-only',
      actualReviewReceiptDigest: nativeQualificationDigest(
        'OFFLINE_SYNTHETIC source-state test; authorizes no runtime effect.',
      ),
    })
    const decisionPath = path.join(root, 'control.json')
    writeFileSync(decisionPath, body)
    return { decisionPath, actualReviewPath, decisionDigest: nativeQualificationDigest(body) }
  }
  const observation: NativeExecutionObservation = {
    executionCycles: 1,
    testRuns: 1,
    cycleId: 'synthetic-cycle',
    testRunId: 'synthetic-run',
    runId: 'synthetic-runtime',
    cycleStatus: 'COMPLETED',
    runStatus: 'COMPLETED',
    result: 'FAILED',
    sealed: true,
    completeValidEvidence: true,
    originalCleanup: 'CONFIRMED',
    originalOperationsSettled: true,
    receiptId: 'synthetic-receipt',
    receiptHash: driverDigest({ OFFLINE_SYNTHETIC: 'receipt' }),
  }
  return {
    root,
    source,
    subjectDigest,
    control,
    observation,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}
function syntheticOwner(
  f: ReturnType<typeof syntheticFixture>,
  options: { observation?: NativeExecutionObservation; start?: () => Promise<void> } = {},
) {
  const events: string[] = []
  const limits: NativeExecutionPreparation = { caseMs: 10, cleanupMs: 5 }
  const owner = createOriginalExecutionControl({
    ...limits,
    provenance: 'OFFLINE_SYNTHETIC',
    source: f.source,
    subjectDigest: f.subjectDigest,
    async grantAndStart() {
      events.push('original-consent-and-start')
      await options.start?.()
    },
    async observeOriginal() {
      events.push('reconcile-original')
      return options.observation ?? f.observation
    },
    async cancelOriginal() {
      events.push('cancel-original')
    },
    hardUnknown(): never {
      events.push('hard-original-parent')
      throw new Error('SYNTHETIC_HARD_EXIT')
    },
  })
  return { owner, events }
}

test('concrete driver binds only the genuine canonical runtime functions and has no fake callback override', () => {
  assert.equal(nativeExecutionRuntimeFunctions.start, startQualityJourneyExecutionRuntime)
  assert.equal(nativeExecutionRuntimeFunctions.cancel, cancelQualityJourneyExecutionRuntime)
  assert.equal(nativeExecutionRuntimeFunctions.reconcile, reconcileQualityJourneyExecutionRuntime)
  assert.equal(Object.isFrozen(nativeExecutionRuntimeFunctions), true)
  const explicitChoice: NativeClosureChoice = {
    decision: 'RISK_ACCEPTED',
    rationale: 'Synthetic type check only; no closure authority.',
    acceptedItemIds: [],
  }
  assert.equal(explicitChoice.decision, 'RISK_ACCEPTED')
})

test('original execution preparation requests consent from the materialized AUTOMATION stage without reserving or launching', async () => {
  const synthetic = syntheticNativeManifest()
  try {
    const journey = await prepareM10AutomationFixture(undefined, {
      workspaceParent: synthetic.parent,
      qualificationLeaseSeconds: 900,
      serialDiscoveryAdmissions: true,
      requireObservedDiscoveryCleanup: true,
      discoveryRuntime: createM10DiscoveryMetadataRuntime(),
      dispatch: event => event.directInvoke(),
    })
    try {
      const database = lstatSync(journey.databasePath, { bigint: true })
      const manifest = {
        ...synthetic.manifest,
        database: { path: journey.databasePath, dev: String(database.dev), ino: String(database.ino) },
      }
      const preparation = await prepareOriginalNativeExecution(
        journey,
        manifest,
        process.cwd(),
        synthetic.parent,
        { caseMs: 90_000, cleanupMs: 10_000 },
        () => {},
      )
      const subject = preparation.publicPrepared().subject
      assert.equal(subject.preparedStatus, 'PREPARED')
      assert.equal(preparation.control.snapshot().originalExecutionEntered, false)
      const consent = await journey.client.qualityJourneyExecutionConsent.findUniqueOrThrow({
        where: { id: subject.consent.executionConsentId },
      })
      assert.equal(consent.status, 'REQUESTED')
      assert.equal(consent.scopeHash, subject.consent.expectedScopeHash)
      assert.equal((await getQualityJourney(journey.scope, journey.client)).journey.stage, 'AUTOMATION')
      assert.equal(await journey.client.qualityJourneyExecutionCycle.count(), 0)
      assert.equal(await journey.client.testRun.count(), 0)
    } finally {
      resetQualityJourneyExecutionRuntimeAdapter()
      await journey.cleanup()
    }
  } finally {
    rmSync(synthetic.parent, { recursive: true, force: true })
  }
})

test('wrong exact execution consent packet hash blocks original start and any sealed progression', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const f = syntheticFixture(),
    c = syntheticOwner(f)
  try {
    await assert.rejects(
      c.owner.startVerified(f.control(driverDigest({ changedConsent: true })), scriptedDisposableHuman),
      /UNKNOWN/,
    )
    assert.deepEqual(c.events, [])
    assert.equal(c.owner.snapshot().originalExecutionEntered, false)
    assert.throws(() => c.owner.requireSealed(), /Sealed original/)
    assert.equal(c.owner.snapshot().physicalQualified, false)
  } finally {
    context.mock.timers.reset()
    f.cleanup()
  }
})

test('exact execution starts once; actual sealed FAILED and confirmed original cleanup permit only explicit next-stage preparation', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const f = syntheticFixture(),
    c = syntheticOwner(f)
  try {
    assert.deepEqual(c.events, [])
    const first = c.owner.startVerified(f.control(), scriptedDisposableHuman)
    assert.equal(c.owner.startVerified(f.control(), scriptedDisposableHuman), first)
    await first
    assert.throws(() => c.owner.requireSealed(), /Sealed original/)
    await c.owner.pollOriginal()
    assert.equal(c.owner.requireSealed().result, 'FAILED')
    assert.equal(c.owner.snapshot().provenance, 'OFFLINE_SYNTHETIC')
    assert.equal(c.owner.snapshot().runtimeQualified, false)
    assert.equal(c.owner.snapshot().physicalQualified, false)
    context.mock.timers.tick(100)
    await c.owner.cancelAndRetain()
    assert.deepEqual(c.events, ['original-consent-and-start', 'reconcile-original'])
  } finally {
    context.mock.timers.reset()
    f.cleanup()
  }
})

for (const [label, change] of [
  ['pending TestRun', { runStatus: 'RUNNING', result: 'PENDING' }],
  ['unsealed terminal', { sealed: false }],
  ['missing runtime artifacts', { completeValidEvidence: false }],
  ['pending original cleanup', { originalCleanup: 'PENDING' }],
  ['pending original operation', { originalOperationsSettled: false }],
  ['extra execution cycle', { executionCycles: 2 }],
  ['extra TestRun', { testRuns: 2 }],
] as const) {
  test(`${label} blocks Triager eligibility and never starts another execution`, async context => {
    context.mock.timers.enable({ apis: ['setTimeout'] })
    const f = syntheticFixture(),
      c = syntheticOwner(f, { observation: { ...f.observation, ...change } })
    try {
      await c.owner.startVerified(f.control(), scriptedDisposableHuman)
      await c.owner.pollOriginal()
      assert.equal(c.owner.snapshot().phase, 'RUNNING')
      assert.throws(() => c.owner.requireSealed(), /Sealed original/)
      context.mock.timers.tick(10)
      assert.equal(c.owner.snapshot().phase, 'UNKNOWN')
      assert.deepEqual(c.events, ['original-consent-and-start', 'reconcile-original', 'cancel-original'])
      assert.throws(() => context.mock.timers.tick(5), /SYNTHETIC_HARD_EXIT/)
    } finally {
      context.mock.timers.reset()
      f.cleanup()
    }
  })
}

test('UNKNOWN original cleanup immediately poisons sealed eligibility and retains the hard lifetime', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const f = syntheticFixture(),
    c = syntheticOwner(f, { observation: { ...f.observation, originalCleanup: 'UNKNOWN' } })
  try {
    await c.owner.startVerified(f.control(), scriptedDisposableHuman)
    await assert.rejects(c.owner.pollOriginal(), /UNKNOWN/)
    assert.throws(() => c.owner.requireSealed(), /Sealed original/)
    context.mock.timers.tick(10)
    assert.throws(() => context.mock.timers.tick(5), /SYNTHETIC_HARD_EXIT/)
  } finally {
    context.mock.timers.reset()
    f.cleanup()
  }
})

test('a pending original start cannot qualify; late fulfillment after cancellation never restores admission', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const f = syntheticFixture()
  let settle!: () => void
  const c = syntheticOwner(f, {
    start: () =>
      new Promise<void>(resolve => {
        settle = resolve
      }),
  })
  try {
    const original = c.owner.startVerified(f.control(), scriptedDisposableHuman)
    assert.equal(c.owner.snapshot().originalStartState, 'PENDING')
    assert.equal(c.owner.snapshot().originalExecutionEntered, true)
    await assert.rejects(c.owner.pollOriginal(), /pending or UNKNOWN/)
    context.mock.timers.tick(10)
    settle()
    await assert.rejects(original, /UNKNOWN/)
    assert.equal(c.owner.snapshot().originalStartState, 'FULFILLED')
    assert.equal(c.owner.snapshot().phase, 'UNKNOWN')
    assert.throws(() => c.owner.requireSealed(), /Sealed original/)
    assert.throws(() => context.mock.timers.tick(5), /SYNTHETIC_HARD_EXIT/)
  } finally {
    context.mock.timers.reset()
    f.cleanup()
  }
})

test('a canonical consent rejection cannot enter polling or manufacture a sealed run', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const f = syntheticFixture(),
    c = syntheticOwner(f, {
      async start() {
        throw new Error('OFFLINE_SYNTHETIC wrong scope')
      },
    })
  try {
    await assert.rejects(c.owner.startVerified(f.control(), scriptedDisposableHuman), /UNKNOWN/)
    await assert.rejects(c.owner.pollOriginal(), /pending or UNKNOWN/)
    assert.throws(() => c.owner.requireSealed(), /Sealed original/)
    context.mock.timers.tick(10)
    assert.throws(() => context.mock.timers.tick(5), /SYNTHETIC_HARD_EXIT/)
  } finally {
    context.mock.timers.reset()
    f.cleanup()
  }
})

test('the sealed predicate accepts only actual terminal PASSED/FAILED shape and exact original cleanup', () => {
  const f = syntheticFixture()
  try {
    assert.equal(sealedOriginalExecution(f.observation), true)
    assert.equal(sealedOriginalExecution({ ...f.observation, result: 'PASSED' }), true)
    for (const change of [
      { result: 'PENDING' },
      { result: 'CANCELLED' },
      { receiptHash: 'changed' },
      { receiptId: null },
      { cycleStatus: 'CANCELLED' },
      { originalCleanup: 'UNKNOWN' as const },
    ])
      assert.equal(sealedOriginalExecution({ ...f.observation, ...change }), false)
  } finally {
    f.cleanup()
  }
})

function syntheticTriageInput(result: 'PASSED' | 'FAILED') {
  return {
    journeyId: 'synthetic-journey',
    targetProjectId: 'synthetic-target',
    executionCycleId: 'synthetic-cycle',
    cycleId: 'synthetic-journey-cycle',
    inputHash: driverDigest({ OFFLINE_SYNTHETIC: true }),
    scopeHash: driverDigest({ OFFLINE_SYNTHETIC: 'scope' }),
    reportRevisionId: 'synthetic-report',
    analysis: {
      artifactId: 'synthetic-analysis',
      revisionId: 'synthetic-revision',
      contentHash: driverDigest({ OFFLINE_SYNTHETIC: 'analysis' }),
      content: { requirements: [{ requirementId: 'REQ-SYNTHETIC', statement: 'Offline synthetic test only.' }] },
    },
    scenarios: [
      {
        artifactId: 'synthetic-scenario',
        revisionId: 'synthetic-scenario-revision',
        contentHash: driverDigest({ OFFLINE_SYNTHETIC: 'scenario' }),
        intent: { requirementIds: ['REQ-SYNTHETIC'] },
      },
    ],
    runs: [
      {
        testRunId: 'synthetic-test-run',
        runId: 'synthetic-runtime',
        scenarioRevisionId: 'synthetic-scenario-revision',
        evidenceReceiptId: 'synthetic-receipt',
        receiptHash: driverDigest({ OFFLINE_SYNTHETIC: 'receipt' }),
        evidence: {
          result,
          status: 'COMPLETED',
          evidenceHealth: 'valid',
          missingArtifacts: [],
          artifacts: [{ kind: 'report' }, { kind: 'log' }],
        },
      },
    ],
  }
}
test('sealed failure candidate preserves exact evidence IDs and unresolved attribution; a pass is never inferred from worker completion', () => {
  const failed = nativeSealedReportCandidate(syntheticTriageInput('FAILED'))
  assert.equal(failed.findings[0].evidenceReceiptId, 'synthetic-receipt')
  assert.equal(failed.findings[0].kind, 'INCONCLUSIVE')
  assert.equal(failed.findings[0].unresolved, true)
  assert.equal(failed.findings[0].targetOutcome, 'NOT_EVALUATED')
  assert.equal(failed.coverage[0].outcome, 'UNRESOLVED')
  assert.equal(nativeReportQualityAssessment(failed), 'NEEDS_WORK')
  assert.equal('remediation' in failed, false)
  const passed = nativeSealedReportCandidate(syntheticTriageInput('PASSED'))
  assert.deepEqual(passed.findings, [])
  assert.equal(passed.coverage[0].outcome, 'PASSED')
  assert.equal(nativeReportQualityAssessment(passed), 'PASSED')
})

test('original acquisition retains the exact handle after registry removal and rejects missing, mismatched or multiple events', () => {
  type Original = Parameters<ReturnType<typeof createOriginalExecutionAcquisition>['onSpawn']>[0]
  const record = () =>
    ({
      process: { spawnargs: ['/synthetic/node', '/synthetic/supervisor.mjs'] },
      OFFLINE_SYNTHETIC: true,
    }) as unknown as Original
  const one = createOriginalExecutionAcquisition('/synthetic/node', '/synthetic/supervisor.mjs', 'OFFLINE_SYNTHETIC')
  const original = record()
  one.onSpawn(original)
  assert.equal(one.requireOriginal(original), original)
  assert.equal(one.requireOriginal(undefined), original)
  assert.equal(one.originals()[0], original)
  assert.equal(one.snapshot().physicalQualified, false)
  for (const failure of ['missing', 'foreign-event', 'multiple', 'foreign-registry'] as const) {
    const owned = createOriginalExecutionAcquisition(
      '/synthetic/node',
      '/synthetic/supervisor.mjs',
      'OFFLINE_SYNTHETIC',
    )
    if (failure !== 'missing') owned.onSpawn(original)
    if (failure === 'foreign-event')
      owned.onSpawn({ ...record(), process: { spawnargs: ['/synthetic/other'] } } as unknown as Original)
    if (failure === 'multiple') owned.onSpawn(record())
    assert.throws(
      () => owned.requireOriginal(failure === 'foreign-registry' ? record() : undefined),
      /acquisition UNKNOWN/,
    )
    assert.equal(owned.snapshot().runtimeQualified, false)
  }
})

test('execution budgets reject public callback, source, subject and unknown-field overrides before preparation', () => {
  assert.deepEqual(captureNativeExecutionBudgets({ caseMs: 10, cleanupMs: 5 }), { caseMs: 10, cleanupMs: 5 })
  for (const extras of [
    { source: {} },
    { subjectDigest: driverDigest({ forged: true }) },
    { grantAndStart() {} },
    { provenance: 'OFFLINE_SYNTHETIC' },
  ])
    assert.throws(() => captureNativeExecutionBudgets({ caseMs: 10, cleanupMs: 5, ...extras }))
  for (const caseMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 300001])
    assert.throws(() => captureNativeExecutionBudgets({ caseMs, cleanupMs: 5 }))
})
