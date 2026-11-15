import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describeNativeCredential } from '../../../../src/lib/quality-journey/codex-app-server/native-credential-topology'
import { nativeQualificationDigest } from '../../../../src/lib/quality-journey/codex-app-server/native-qualification-contract'
import { nativeOutcomeSourceIdentity } from '../../../../src/lib/quality-journey/codex-app-server/native-outcome-profile'
import { createManagedQualityJourneyRoleDelivery } from '../../../../src/services/coordinator/quality-journey-managed-role-delivery'
import {
  createNativeQualificationParent,
  type NativeCasePreparation,
  type NativeDriverControl,
} from './native-driver.mts'
import { createNativeJourneyLineage, nativeProducerArguments, scriptedDisposableHuman } from './native-lineage.mts'
import {
  createOriginalNativeCaseControl,
  driverDigest,
  readNativeDriverControl,
  type OriginalNativeDriverTask,
} from './native-driver-control.mts'
import { requiredC1TaskInputPaths } from './runner.mts'
import { prepareOriginalNativeDriverCase, validatePreparation } from './native-driver-prepare.mts'
import type { NativeLineageEvent } from './native-lineage.mts'

function fixture() {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), 'm13-driver-offline-'))
  chmodSync(root, 0o700)
  const auth = path.join(root, 'synthetic-auth.json')
  writeFileSync(auth, '{"synthetic":true}', { mode: 0o600 })
  const source = describeNativeCredential(auth)
  const subjectDigest = driverDigest({ syntheticCase: true })
  function approval(kind = 'CASE_PACKET', subject = subjectDigest) {
    const actualReviewPath = path.join(root, `actual-${kind}.txt`)
    writeFileSync(actualReviewPath, 'Offline test review only; no effects authorized.\n')
    const decisionPath = path.join(root, `decision-${kind}.json`)
    const bytes = JSON.stringify({
      version: 'M13_NATIVE_DRIVER_CONTROL_V1',
      decision: 'ACCEPT',
      kind,
      subjectDigest: subject,
      reviewerId: 'offline-test-reviewer',
      actualReviewReceiptDigest: nativeQualificationDigest(readFileSync(actualReviewPath)),
    })
    writeFileSync(decisionPath, bytes)
    return { decisionPath, actualReviewPath, decisionDigest: nativeQualificationDigest(bytes) }
  }
  return { root, source, subjectDigest, approval, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}
function originalCase(
  f: ReturnType<typeof fixture>,
  changes: Partial<OriginalNativeDriverTask> = {},
  leaseExpiresAt = Date.now() + 60_000,
  hooks: { verify?: () => Promise<void>; dispose?: () => Promise<void> } = {},
) {
  const events: string[] = []
  const canonical = {
    analysisRevision: { id: 'actual-original-revision', contentHash: 'actual-content-hash' },
    actualCanonicalResult: true,
  }
  let nativeState = 'stopped'
  const task: OriginalNativeDriverTask = {
    async start() {
      events.push('start')
      return { started: true }
    },
    snapshot: () => ({ state: nativeState, originalStartState: 'FULFILLED' }),
    async readAcceptedManagedDelivery(call) {
      events.push('read-original')
      assert.deepEqual(call, {
        toolName: 'quality_journey_analysis_submit',
        arguments: { idempotencyKey: 'one-original-call' },
      })
      return { result: canonical, receipt: { accepted: true }, argumentsDigest: driverDigest(call) }
    },
    async freezeCandidate() {
      events.push('freeze')
      return { actualCandidateDigest: driverDigest({ actual: true }) }
    },
    acceptIndependentReview() {
      events.push('independent-review')
      return { accepted: true }
    },
    async reconcile() {
      events.push('reconcile')
      return { originalResult: true }
    },
    async cancel() {
      events.push('cancel')
    },
    ...changes,
  }
  const control = createOriginalNativeCaseControl({
    provenance: 'OFFLINE_SYNTHETIC',
    subjectDigest: f.subjectDigest,
    source: f.source,
    leaseExpiresAt,
    toolName: 'quality_journey_analysis_submit',
    arguments: { idempotencyKey: 'one-original-call' },
    async createOriginalTask() {
      events.push('create')
      return task
    },
    async verifyReconciled(value) {
      assert.deepEqual(value, { originalResult: true })
      events.push('verify-hub')
      await hooks.verify?.()
    },
    async disposeOriginalSource() {
      events.push('dispose-original')
      await hooks.dispose?.()
    },
  })
  return {
    control,
    events,
    canonical,
    setNativeState: (value: string) => {
      nativeState = value
    },
  }
}

test('driver import and parent construction are inert and every driver file enters the C1 freeze inventory', () => {
  const parent = createNativeQualificationParent({ repositoryRoot: process.cwd(), evidenceRoot: '/does/not/exist' })
  const prepare: (packet: NativeCasePreparation) => Promise<unknown> = parent.prepareInitialCase
  assert.equal(typeof prepare, 'function')
  assert.equal(parent.snapshot().current, null)
  assert.equal(parent.snapshot().fixture.currentKind, null)
  assert.equal(parent.snapshot().originalSourceRetained, false)
  const inputs = requiredC1TaskInputPaths(process.cwd())
  for (const file of [
    'native-driver.mts',
    'native-lineage.mts',
    'native-driver-prepare.mts',
    'native-driver-control.mts',
    'native-driver.test.mts',
  ])
    assert.ok(inputs.includes(path.join(process.cwd(), 'tasks/codex-app-server-journeys/m13-runtime/c1', file)))
})

test('the closed current preparation pin matches the accepted profile; old and arbitrary pins refuse before preparation effects', async () => {
  const f = fixture()
  const packet: NativeCasePreparation = {
    campaignId: 'offline-current-pin',
    candidateTree: 'a'.repeat(40),
    native: {
      path: path.join(f.root, 'synthetic-native-never-executed'),
      sha256: '3ea20787e106af94573d3d6c19480aed93a1334b0dd32b6b04e2f780ce82cf4b',
    },
    prerequisites: {
      readinessReceipt: { path: path.join(f.root, 'synthetic-readiness'), sha256: 'b'.repeat(64) },
      existingLoginReceipt: { path: path.join(f.root, 'synthetic-login'), sha256: 'c'.repeat(64) },
    },
    credentialSource: f.source,
    dossierRoot: path.join(f.root, 'synthetic-dossier'),
    port: 4173,
    limits: {
      acquisitionMs: 10000,
      caseMs: 45000,
      requestMs: 10000,
      acknowledgementMs: 10000,
      cleanupMs: 10000,
      bodyBytes: 262144,
      httpRequests: 3,
      toolCalls: 1,
    },
    reviewControl: {
      reviewerId: 'offline-test-reviewer',
      nonce: '00000000-0000-4000-8000-000000000000',
      reviewMs: 10000,
      reconciliationMs: 10000,
    },
  }
  try {
    assert.equal(packet.native.sha256, nativeOutcomeSourceIdentity.installedSha256)
    assert.equal(validatePreparation(packet, f.root), undefined)
    assert.equal(existsSync(path.join(f.root, packet.campaignId)), false)
    for (const sha256 of ['7cb8700a47be3c81bb3c5efbf2d2adc716ce3db4806e9dc992f2925f78b2b194', '0'.repeat(64)]) {
      const refused = {
        ...packet,
        native: { ...packet.native, sha256 },
        credentialSource: { ...packet.credentialSource, path: path.join(f.root, 'missing-credential') },
      }
      let databaseAccesses = 0
      let sourceRetentions = 0
      const event = {
        get original() {
          databaseAccesses++
          throw new Error('Refused preparation must not inspect the database or source client')
        },
      } as unknown as NativeLineageEvent
      await assert.rejects(
        prepareOriginalNativeDriverCase(event, refused, {
          repositoryRoot: f.root,
          evidenceRoot: f.root,
          retainOriginalSource: () => {
            sourceRetentions++
          },
          sourceDisposed: () => assert.fail('Refused preparation must not dispose a source'),
          assertParentCurrent: () => {},
        }),
        /^Error: Exact native case preparation refused$/,
      )
      assert.equal(databaseAccesses, 0)
      assert.equal(sourceRetentions, 0)
      assert.equal(existsSync(path.join(f.root, packet.campaignId)), false)
    }
  } finally {
    f.cleanup()
  }
})

test('one exact external packet starts only the original task; original acceptance, actual review and HUB verification precede disposal', async () => {
  const f = fixture(),
    c = originalCase(f)
  try {
    assert.deepEqual(c.events, [])
    const control: NativeDriverControl = f.approval(),
      first = c.control.startVerifiedCase(control)
    assert.equal(c.control.startVerifiedCase(control), first)
    await first
    assert.deepEqual(c.events, ['create', 'start'])
    assert.throws(() => c.control.acceptedForLineage(), /Reconciled/)
    await c.control.freezeCandidate()
    assert.throws(() => c.control.acceptedForLineage(), /Reconciled/)
    c.control.acceptIndependentReview(control)
    await c.control.reconcile('one-original-observation')
    assert.deepEqual(c.events, [
      'create',
      'start',
      'read-original',
      'freeze',
      'independent-review',
      'reconcile',
      'verify-hub',
      'dispose-original',
    ])
    assert.deepEqual(c.control.acceptedForLineage().result, c.canonical)
    const copy = c.control.acceptedForLineage().result as { actualCanonicalResult: boolean }
    copy.actualCanonicalResult = false
    assert.deepEqual(c.control.acceptedForLineage().result, c.canonical)
    assert.equal(c.control.snapshot().runtimeQualified, false)
    assert.equal(c.control.snapshot().physicalQualified, false)
    assert.equal(c.control.snapshot().provenance, 'OFFLINE_SYNTHETIC')
    await assert.rejects(c.control.reconcile('second'), /One original/)
    await c.control.cancelAndRetain()
    assert.equal(c.control.snapshot().phase, 'RECONCILED')
    assert.equal(new Set<string>(c.events).has('cancel'), false)
  } finally {
    f.cleanup()
  }
})

for (const refusal of ['wrong-packet', 'expired-lease', 'credential-alias'] as const) {
  test(`pre-start ${refusal} consumes no task acquisition and leaves UNKNOWN without replacement`, async () => {
    const f = fixture(),
      c = originalCase(f, {}, refusal === 'expired-lease' ? 0 : Date.now() + 60_000)
    try {
      const control = f.approval(
        'CASE_PACKET',
        refusal === 'wrong-packet' ? driverDigest({ wrong: true }) : f.subjectDigest,
      )
      if (refusal === 'credential-alias') {
        const alias = path.join(f.root, 'alias.json')
        symlinkSync(f.source.path, alias)
        control.decisionPath = alias
      }
      await assert.rejects(c.control.startVerifiedCase(control), /UNKNOWN/)
      assert.deepEqual(c.events, [])
      assert.equal(c.control.snapshot().phase, 'UNKNOWN')
      await assert.rejects(c.control.startVerifiedCase(control), /UNKNOWN/)
    } finally {
      f.cleanup()
    }
  })
}

test('both public review paths are alias guarded before any decision bytes are interpreted', () => {
  const f = fixture()
  try {
    const control = f.approval()
    const alias = path.join(f.root, 'review-alias.txt')
    symlinkSync(f.source.path, alias)
    assert.throws(
      () => readNativeDriverControl({ ...control, actualReviewPath: alias }, 'CASE_PACKET', f.subjectDigest, f.source),
      /control refused/,
    )
  } finally {
    f.cleanup()
  }
})

test('missing original acceptance cannot freeze or manufacture a lineage result', async () => {
  const f = fixture(),
    c = originalCase(f, {
      async readAcceptedManagedDelivery() {
        return null
      },
    })
  try {
    await c.control.startVerifiedCase(f.approval())
    await assert.rejects(c.control.freezeCandidate(), /UNKNOWN/)
    assert.deepEqual(c.events, ['create', 'start'])
    assert.throws(() => c.control.acceptedForLineage(), /Reconciled/)
    assert.equal(c.control.snapshot().sourceDisposed, false)
  } finally {
    f.cleanup()
  }
})

test('a changed original public-arguments commitment cannot freeze a candidate', async () => {
  const f = fixture(),
    c = originalCase(f, {
      async readAcceptedManagedDelivery() {
        return { result: {}, receipt: { accepted: true }, argumentsDigest: driverDigest({ changed: true }) }
      },
    })
  try {
    await c.control.startVerifiedCase(f.approval())
    await assert.rejects(c.control.freezeCandidate(), /UNKNOWN/)
    assert.equal(c.events.includes('freeze'), false)
    assert.equal(c.control.snapshot().sourceDisposed, false)
  } finally {
    f.cleanup()
  }
})

test('an ambiguous original reconciliation retains source custody and blocks lineage advancement', async () => {
  const f = fixture(),
    c = originalCase(f, {
      async reconcile() {
        throw new Error('synthetic transaction reply lost')
      },
    })
  try {
    await c.control.startVerifiedCase(f.approval())
    await c.control.freezeCandidate()
    c.control.acceptIndependentReview(f.approval())
    await assert.rejects(c.control.reconcile('one-original-observation'), /UNKNOWN/)
    assert.equal(c.control.snapshot().sourceDisposed, false)
    assert.equal(c.control.snapshot().physicalQualified, false)
    assert.equal(c.events.includes('dispose-original'), false)
    assert.throws(() => c.control.acceptedForLineage(), /Reconciled/)
    await assert.rejects(c.control.reconcile('retry'), /One original/)
  } finally {
    f.cleanup()
  }
})

test('late task acquisition after original cancellation is cancelled and never started', async () => {
  const f = fixture(),
    c = originalCase(f)
  let acquire!: (value: OriginalNativeDriverTask) => void
  const calls: string[] = []
  const lateTask: OriginalNativeDriverTask = {
    async start() {
      calls.push('start')
    },
    snapshot: () => ({ state: 'stopped', originalStartState: 'FULFILLED' }),
    async readAcceptedManagedDelivery() {
      return null
    },
    async freezeCandidate() {
      return {}
    },
    acceptIndependentReview() {},
    async reconcile() {},
    async cancel() {
      calls.push('cancel')
    },
  }
  const control = createOriginalNativeCaseControl({
    provenance: 'OFFLINE_SYNTHETIC',
    subjectDigest: f.subjectDigest,
    source: f.source,
    leaseExpiresAt: Date.now() + 60_000,
    toolName: 'synthetic',
    arguments: {},
    createOriginalTask: () =>
      new Promise(resolve => {
        acquire = resolve
      }),
    async verifyReconciled() {},
    async disposeOriginalSource() {
      calls.push('dispose')
    },
  })
  try {
    const flight = control.startVerifiedCase(f.approval())
    await control.cancelAndRetain()
    acquire(lateTask)
    await assert.rejects(flight, /UNKNOWN/)
    assert.deepEqual(calls, ['cancel'])
    assert.equal(control.snapshot().phase, 'UNKNOWN')
    assert.deepEqual(c.events, [])
  } finally {
    f.cleanup()
  }
})

test('canonical disposable Analysis questions issue a fresh answer-bound successor without browser or native execution', async () => {
  const f = fixture(),
    lineage = createNativeJourneyLineage(undefined, f.root)
  let workspace: string | undefined
  try {
    const initial = await lineage.prepareInitial()
    workspace = lineage.fixtureOwned().workspace
    assert.equal(initial.kind, 'ANALYSIS_INITIAL')
    const initialAttempt = await initial.original.client.qualityJourneyWorkAttempt.findUniqueOrThrow({
      where: { id: initial.original.binding.attemptId },
    })
    assert.equal(initialAttempt.heartbeatSeconds, 300)
    assert.ok(initialAttempt.leaseExpiresAt.getTime() > Date.now() + 890000)
    assert.equal(lineage.snapshot().browserEntered, false)
    assert.equal((initial.arguments.charter as { questions: unknown[] }).questions.length, 1)
    assert.equal('schemaVersion' in (initial.arguments.charter as object), false)
    assert.deepEqual(
      nativeProducerArguments(initial.original).idempotencyKey,
      initial.original.arguments.idempotencyKey,
    )
    const delivery = await createManagedQualityJourneyRoleDelivery({
      binding: initial.original.binding,
      canonicalDefinitions: initial.original.canonicalDefinitions,
      client: initial.original.client,
    })
    const result = await delivery.invoke({
      callId: 'offline-initial-canonical',
      toolName: initial.original.toolName,
      arguments: initial.arguments,
    })
    lineage.acceptCurrentCanonicalResult(result.result)
    const successor = await lineage.prepareAnalysisFollowup(scriptedDisposableHuman)
    assert.equal(successor.kind, 'ANALYSIS_FOLLOWUP')
    const followupAttempt = await successor.original.client.qualityJourneyWorkAttempt.findUniqueOrThrow({
      where: { id: successor.original.binding.attemptId },
    })
    assert.equal(followupAttempt.heartbeatSeconds, 300)
    assert.ok(followupAttempt.leaseExpiresAt.getTime() > Date.now() + 890000)
    assert.notEqual(successor.original.binding.assignmentId, initial.original.binding.assignmentId)
    assert.notEqual(successor.original.binding.assignmentSecret, initial.original.binding.assignmentSecret)
    assert.equal(
      successor.arguments.predecessorAnalysisRevisionId,
      (result.result as { analysisRevision: { id: string } }).analysisRevision.id,
    )
    const charter = successor.arguments.charter as { questions: unknown[]; resolvedQuestionAnswerIds: string[] }
    assert.deepEqual(charter.questions, [])
    assert.equal(charter.resolvedQuestionAnswerIds.length, 1)
    const answer = await initial.original.client.qualityJourneyAnalysisAnswer.findFirstOrThrow({
      where: { answerId: charter.resolvedQuestionAnswerIds[0] },
      include: { question: true },
    })
    assert.equal(answer.question.analysisRevisionId, successor.arguments.predecessorAnalysisRevisionId)
    assert.equal(lineage.snapshot().browserEntered, false)
    assert.equal(await initial.original.client.qualityJourneyProviderRun.count(), 0)
    await assert.rejects(lineage.prepareAnalysisFollowup(scriptedDisposableHuman), /Exact scripted/)
    await assert.rejects(lineage.releaseVerifiedDiscoveryBoundary(), /Original prepared/)
    const finalDelivery = await createManagedQualityJourneyRoleDelivery({
      binding: successor.original.binding,
      canonicalDefinitions: successor.original.canonicalDefinitions,
      client: successor.original.client,
    })
    const finalCall = {
      callId: 'offline-followup-canonical',
      toolName: successor.original.toolName,
      arguments: successor.arguments,
    }
    const final = await finalDelivery.invoke(finalCall)
    const originalAccepted = await finalDelivery.readAccepted(finalCall)
    assert.deepEqual(originalAccepted?.result, final.result)
    lineage.acceptCurrentCanonicalResult(final.result)
    const boundary = await lineage.prepareDiscoveryBoundary(scriptedDisposableHuman)
    assert.equal(boundary.journeyId, initial.original.binding.journeyId)
    assert.equal(lineage.snapshot().browserEntered, true)
    assert.equal(await initial.original.client.qualityJourneyOwnedBrowser.count(), 0)
    assert.equal(
      await initial.original.client.qualityJourneyWorkAttempt.count({ where: { workItem: { role: 'SCOUT' } } }),
      0,
    )
  } finally {
    await lineage.stopAndRetain()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
    f.cleanup()
  }
})

for (const stage of ['read', 'freeze', 'reconcile', 'verify'] as const) {
  test(`cancellation fences a late original ${stage} continuation before source disposal or lineage advancement`, async () => {
    const f = fixture(),
      pending = Promise.withResolvers<void>(),
      entered = Promise.withResolvers<void>()
    let changes: Partial<OriginalNativeDriverTask> = {}
    const wait = async () => {
      entered.resolve()
      await pending.promise
    }
    if (stage === 'read')
      changes = {
        async readAcceptedManagedDelivery(call) {
          await wait()
          return { result: {}, receipt: { accepted: true }, argumentsDigest: driverDigest(call) }
        },
      }
    if (stage === 'freeze')
      changes = {
        async freezeCandidate() {
          await wait()
          return { candidateDigest: driverDigest({ OFFLINE_SYNTHETIC: true }) }
        },
      }
    if (stage === 'reconcile')
      changes = {
        async reconcile() {
          await wait()
          return { originalResult: true }
        },
      }
    const c = originalCase(f, changes, Date.now() + 60_000, stage === 'verify' ? { verify: wait } : {})
    try {
      await c.control.startVerifiedCase(f.approval())
      let flight: Promise<unknown>
      if (stage === 'read' || stage === 'freeze') flight = c.control.freezeCandidate()
      else {
        await c.control.freezeCandidate()
        c.control.acceptIndependentReview(f.approval())
        flight = c.control.reconcile('original-once')
      }
      await entered.promise
      await c.control.cancelAndRetain()
      pending.resolve()
      await assert.rejects(flight, /UNKNOWN/)
      assert.equal(c.control.snapshot().phase, 'UNKNOWN')
      assert.equal(c.control.snapshot().sourceDisposed, false)
      assert.equal(c.control.snapshot().sourceDisposalEntered, false)
      assert.equal(c.events.includes('dispose-original'), false)
      assert.throws(() => c.control.acceptedForLineage(), /Reconciled/)
      if (stage === 'read') assert.equal(c.events.includes('freeze'), false)
    } finally {
      pending.resolve()
      f.cleanup()
    }
  })
}

test('a disposal entered before cancellation cannot be undone, but its late completion never restores RECONCILED', async () => {
  const f = fixture(),
    pending = Promise.withResolvers<void>(),
    entered = Promise.withResolvers<void>()
  const c = originalCase(f, {}, Date.now() + 60_000, {
    async dispose() {
      entered.resolve()
      await pending.promise
    },
  })
  try {
    await c.control.startVerifiedCase(f.approval())
    await c.control.freezeCandidate()
    c.control.acceptIndependentReview(f.approval())
    const flight = c.control.reconcile('original-once')
    await entered.promise
    await c.control.cancelAndRetain()
    assert.equal(c.control.snapshot().sourceDisposalEntered, true)
    assert.equal(c.control.snapshot().sourceDisposed, false)
    pending.resolve()
    await assert.rejects(flight, /UNKNOWN/)
    assert.equal(c.control.snapshot().phase, 'UNKNOWN')
    assert.equal(c.control.snapshot().sourceDisposed, true)
    assert.throws(() => c.control.acceptedForLineage(), /Reconciled/)
  } finally {
    pending.resolve()
    f.cleanup()
  }
})

test('the public original parent cannot publish late initial preparation after retention', async () => {
  const f = fixture()
  const parent = createNativeQualificationParent({ repositoryRoot: process.cwd(), evidenceRoot: f.root })
  const preparation = parent.prepareInitialCase({} as NativeCasePreparation)
  try {
    const rejected = assert.rejects(preparation)
    await parent.retainUnknown()
    await rejected
    const state = parent.snapshot()
    assert.equal(state.unknown, true)
    assert.equal(state.current, null)
    assert.equal(state.originalSourceRetained, false)
    assert.deepEqual(state.lineage.cases, [])
    assert.equal(state.fixture.stopped, true)
  } finally {
    await parent.retainUnknown()
    f.cleanup()
  }
})

test('37 seconds remaining cannot construct or spend a native case requiring 65 seconds', async () => {
  const f = fixture()
  let constructed = 0
  const c = createOriginalNativeCaseControl({
    provenance: 'OFFLINE_SYNTHETIC',
    subjectDigest: f.subjectDigest,
    source: f.source,
    leaseExpiresAt: Date.now() + 37000,
    minimumLeaseMs: 65000,
    toolName: 'synthetic',
    arguments: {},
    async createOriginalTask() {
      constructed++
      throw new Error('Insufficient lease must block before construction')
    },
    async verifyReconciled() {},
    async disposeOriginalSource() {},
  })
  try {
    await assert.rejects(c.startVerifiedCase(f.approval()), /UNKNOWN/)
    assert.equal(constructed, 0)
    assert.equal(c.snapshot().phase, 'UNKNOWN')
  } finally {
    f.cleanup()
  }
})

test('source validation consuming the lease cancels the original unstarted task without spending', async context => {
  const f = fixture(),
    events: string[] = []
  let now = Date.now()
  context.mock.method(Date, 'now', () => now)
  const task: OriginalNativeDriverTask = {
    async start() {
      events.push('SPEND_AND_START')
    },
    snapshot: () => ({ state: 'startup', originalStartState: 'NOT_CALLED' }),
    async readAcceptedManagedDelivery() {
      return null
    },
    async freezeCandidate() {
      return {}
    },
    acceptIndependentReview() {},
    async reconcile() {},
    async cancel() {
      events.push('cancel-original-unstarted')
    },
  }
  const c = createOriginalNativeCaseControl({
    provenance: 'OFFLINE_SYNTHETIC',
    subjectDigest: f.subjectDigest,
    source: f.source,
    leaseExpiresAt: now + 70000,
    minimumLeaseMs: 65000,
    toolName: 'synthetic',
    arguments: {},
    async createOriginalTask() {
      events.push('validate-original-source')
      now += 6000
      return task
    },
    async verifyReconciled() {},
    async disposeOriginalSource() {},
  })
  try {
    await assert.rejects(c.startVerifiedCase(f.approval()), /UNKNOWN/)
    assert.deepEqual(events, ['validate-original-source', 'cancel-original-unstarted'])
    assert.equal(c.snapshot().phase, 'UNKNOWN')
  } finally {
    context.mock.restoreAll()
    f.cleanup()
  }
})
