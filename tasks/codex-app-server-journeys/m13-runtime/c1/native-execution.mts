import { randomUUID } from 'node:crypto'
import { lstatSync } from 'node:fs'
import path from 'node:path'
import type { prepareM10AutomationFixture } from '../../../../src/test/m10-journey-fixture'
import { getQualityJourney } from '../../../../src/services/coordinator/quality-journey-service'
import {
  grantQualityJourneyExecutionConsent,
  startQualityJourneyExecution,
  cancelQualityJourneyExecution,
  registerQualityJourneyExecutionRuntimeAdapter,
} from '../../../../src/services/coordinator/quality-journey-execution-service'
import {
  startQualityJourneyExecutionRuntime,
  cancelQualityJourneyExecutionRuntime,
  reconcileQualityJourneyExecutionRuntime,
} from '../../../../src/services/coordinator/quality-journey-runtime-service'
import { compileQualityJourneyTriageInput } from '../../../../src/services/coordinator/quality-journey-triage-input'
import { freezeJourneyExecutionEnvironment } from '../../../../src/lib/quality-journey/execution-environment'
import { taskSpawner } from '../../../../src/lib/process/task-spawner'
import { stopOwnedProcessGroup, type OwnedProcessStopObservation } from '../../../../src/lib/process/owned-process-stop'
import { processManager } from '../../../../src/lib/test-run/process-manager'
import {
  assertNativePublicInput,
  verifyNativeCredential,
  readNativePublicBytes,
} from '../../../../src/lib/quality-journey/codex-app-server/native-credential-topology'
import {
  nativeQualificationDigest,
  type NativeQualificationManifest,
} from '../../../../src/lib/quality-journey/codex-app-server/native-qualification-contract'
import { qualityJourneyExecutionConsentScopeSchema } from '../../../../src/lib/quality-journey'
import { driverDigest } from './native-driver-control.mts'
import { persistNativeDriverPublic } from './native-driver-prepare.mts'
import {
  createOriginalExecutionControl,
  captureNativeExecutionBudgets,
  createOriginalExecutionAcquisition,
  type NativeExecutionObservation,
} from './native-execution-state.mts'

type Fixture = Awaited<ReturnType<typeof prepareM10AutomationFixture>>
export type NativeExecutionPreparation = Readonly<{ caseMs: number; cleanupMs: number }>
export const nativeExecutionRuntimeFunctions = Object.freeze({
  start: startQualityJourneyExecutionRuntime,
  cancel: cancelQualityJourneyExecutionRuntime,
  reconcile: reconcileQualityJourneyExecutionRuntime,
})
let originalRuntimeOwner: object | undefined

function assertInputs(manifest: NativeQualificationManifest) {
  verifyNativeCredential(manifest.credentialSource)
  const database = lstatSync(manifest.database.path, { bigint: true })
  if (
    !database.isFile() ||
    database.isSymbolicLink() ||
    String(database.dev) !== manifest.database.dev ||
    String(database.ino) !== manifest.database.ino
  )
    throw new Error('Original execution database identity changed')
  for (const input of manifest.inputs) assertNativePublicInput(input.path, manifest.credentialSource)
  for (const input of manifest.inputs)
    if (
      nativeQualificationDigest(readNativePublicBytes(input.path, manifest.credentialSource)) !==
      `sha256:${input.sha256}`
    )
      throw new Error('Frozen execution source inputs changed')
}
function completeEvidence(value: Record<string, unknown>) {
  const artifacts = Array.isArray(value.artifacts) ? value.artifacts : []
  const kinds = artifacts.map(item =>
    item && typeof item === 'object' ? (item as Record<string, unknown>).kind : null,
  )
  return (
    value.evidenceHealth === 'valid' &&
    Array.isArray(value.missingArtifacts) &&
    value.missingArtifacts.length === 0 &&
    kinds.includes('report') &&
    kinds.includes('log') &&
    typeof value.attemptId === 'string'
  )
}
function anonymousLoopback(environment: Awaited<ReturnType<Fixture['client']['environment']['findUniqueOrThrow']>>) {
  const url = new URL(environment.baseUrl)
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.username ||
    url.password ||
    url.hash ||
    environment.credentialState !== 'NONE' ||
    environment.username ||
    environment.passwordEnvironmentVariable
  )
    throw new Error('Exact anonymous loopback execution target required')
}

/** Concrete task-only canonical adapter. No public callback, fake runtime, credential fallback or default Prisma. */
export async function prepareOriginalNativeExecution(
  originalFixture: Fixture,
  originalManifest: NativeQualificationManifest,
  repositoryRoot: string,
  evidenceRoot: string,
  provided: NativeExecutionPreparation,
  assertParentCurrent: () => void,
) {
  assertParentCurrent()
  const limits = captureNativeExecutionBudgets(provided)
  const f = originalFixture,
    manifest = structuredClone(originalManifest)
  const client = f.client,
    credentials = Object.freeze({ ...f.credentials }),
    scope = Object.freeze({ ...f.scope })
  const appraiseRoot = path.join(f.workspace, '.appraise'),
    idempotencyKey = `m13-execution-${randomUUID()}`
  if (originalRuntimeOwner) throw new Error('One bounded original execution owner required')
  originalRuntimeOwner = Object.freeze({})
  assertInputs(manifest)
  let launchGranted = false,
    runtimeEntered = false,
    scopeUnknown = false,
    runtimeFenced = false
  let cycleId: string | undefined, runId: string | undefined, testRunId: string | undefined
  const acquisition = createOriginalExecutionAcquisition(
    process.execPath,
    path.join(repositoryRoot, 'scripts/owned-process-supervisor.mjs'),
    'ORIGINAL_CANONICAL_RUNTIME',
  )
  const operations: Array<{ promise: Promise<unknown>; state: 'PENDING' | 'FULFILLED' | 'REJECTED' }> = []
  let stop: Promise<OwnedProcessStopObservation> | undefined, cleanup: OwnedProcessStopObservation | undefined
  function tracked<T>(promise: Promise<T>): Promise<T> {
    const entry = { promise, state: 'PENDING' as 'PENDING' | 'FULFILLED' | 'REJECTED' }
    operations.push(entry)
    void promise.then(
      () => {
        entry.state = 'FULFILLED'
      },
      () => {
        entry.state = 'REJECTED'
      },
    )
    return promise
  }
  async function assertCycle(selected: string) {
    if (cycleId && selected !== cycleId) throw new Error('Original execution cycle changed')
    const cycle = await client.qualityJourneyExecutionCycle.findUniqueOrThrow({
      where: { id: selected },
      include: { testRuns: true },
    })
    if (
      cycle.journeyId !== scope.journeyId ||
      cycle.targetProjectId !== scope.targetProjectId ||
      cycle.testRuns.length !== 1 ||
      (await client.qualityJourneyExecutionCycle.count({ where: { journeyId: scope.journeyId } })) !== 1
    )
      throw new Error('Exactly one original execution cycle and TestRun required')
    const binding = cycle.testRuns[0]
    cycleId = cycle.id
    runId = binding.runId
    testRunId = binding.testRunId
  }
  registerQualityJourneyExecutionRuntimeAdapter(
    Object.freeze({
      async start(input) {
        if (!launchGranted || runtimeEntered || runtimeFenced)
          throw new Error('One explicitly consented original runtime start required')
        runtimeEntered = true
        await assertCycle(input.executionCycleId)
        if (runtimeFenced) throw new Error('Original runtime admission fenced')
        taskSpawner.on('spawn', acquisition.onSpawn)
        try {
          await tracked(nativeExecutionRuntimeFunctions.start(input, client, appraiseRoot))
          acquisition.requireOriginal(processManager.get(runId!))
        } finally {
          taskSpawner.removeListener('spawn', acquisition.onSpawn)
        }
      },
      async cancel(input) {
        if (!runtimeEntered) throw new Error('Original execution was not entered')
        await assertCycle(input.executionCycleId)
        await tracked(nativeExecutionRuntimeFunctions.cancel(input, client))
      },
      async reconcile(input) {
        if (!runtimeEntered || runtimeFenced) throw new Error('Original execution reconciliation unavailable')
        await assertCycle(input.executionCycleId)
        await tracked(nativeExecutionRuntimeFunctions.reconcile(input, client, appraiseRoot))
      },
    }),
  )
  const snapshot = await getQualityJourney(scope, client)
  assertParentCurrent()
  if (
    snapshot.journey.stage !== 'EXECUTION' ||
    f.prepared.length !== 1 ||
    (await client.testRun.count()) ||
    (await client.qualityJourneyExecutionCycle.count()) ||
    (await client.qualityJourneyExecutionConsent.count())
  )
    throw new Error('Pristine one-capsule execution preparation required')
  assertParentCurrent()
  const prepared = await client.qualityJourneyPreparedRuntimeCapsule.findUniqueOrThrow({
    where: { id: f.prepared[0].id },
    include: { materialization: true },
  })
  assertParentCurrent()
  if (
    prepared.status !== 'PREPARED' ||
    prepared.materialization.scenarioRevisionId !== f.scenarioRevisionId ||
    driverDigest(JSON.parse(prepared.manifestJson)) !== prepared.manifestHash
  )
    throw new Error('Exact current prepared capsule readiness required')
  const environment = await client.environment.findUniqueOrThrow({ where: { id: f.environmentId } })
  assertParentCurrent()
  anonymousLoopback(environment)
  const target = await client.targetProject.findUniqueOrThrow({ where: { id: scope.targetProjectId } })
  assertParentCurrent()
  const environmentSnapshot = freezeJourneyExecutionEnvironment(environment, target.kind)
  const request = Object.freeze({
    ...scope,
    preparedRuntimeCapsuleIds: [f.prepared[0].id],
    environmentId: f.environmentId,
    browserEngine: 'CHROMIUM' as const,
    expectedStateHash: snapshot.journey.stateHash,
    idempotencyKey,
  })
  // The exact fixture's reload operation requires UI consent. A surprise dispatch hits the closed adapter gate.
  const waiting = await startQualityJourneyExecution(request, client, credentials)
  if (
    !('consentRequired' in waiting) ||
    (await client.testRun.count()) ||
    (await client.qualityJourneyExecutionCycle.count())
  )
    throw new Error('Canonical execution preparation did not remain consent-only')
  assertParentCurrent()
  const consent = Object.freeze({
    executionConsentId: waiting.consentRequired.executionConsentId,
    expectedScopeHash: waiting.consentRequired.scopeHash,
  })
  const consentRow = await client.qualityJourneyExecutionConsent.findUniqueOrThrow({
    where: { id: consent.executionConsentId },
  })
  assertParentCurrent()
  const consentScope = qualityJourneyExecutionConsentScopeSchema.parse(JSON.parse(consentRow.scopeJson))
  if (driverDigest(consentScope) !== consent.expectedScopeHash || consentRow.status !== 'REQUESTED')
    throw new Error('Exact requested execution consent scope required')
  const subject = Object.freeze({
    version: 'M13_NATIVE_EXECUTION_PREPARED_V1',
    ...scope,
    expectedStateHash: request.expectedStateHash,
    scenarioRevisionId: f.scenarioRevisionId,
    preparedCapsuleId: f.prepared[0].id,
    capsuleHash: prepared.capsuleHash,
    manifestHash: prepared.manifestHash,
    preparedStatus: prepared.status,
    environmentId: f.environmentId,
    environmentSnapshotHash: environmentSnapshot.hash,
    targetBaseUrl: environment.baseUrl,
    appraiseRoot,
    browserEngine: 'CHROMIUM',
    readiness: 'CANONICAL_PREPARED_ACTUAL_PREFLIGHT_AT_AUTHORIZED_START',
    consent,
    consentScope,
    limits,
    allowance: { executionCycles: 1, testRuns: 1, runtimeStarts: 1, retries: 0, reruns: 0 },
    sourceInventoryDigest: driverDigest(manifest.inputs),
    persona: 'SCRIPTED_DISPOSABLE_TEST_HUMAN',
    runtimeQualified: false,
    physicalQualified: false,
  })
  const subjectDigest = driverDigest(subject)
  persistNativeDriverPublic(path.join(evidenceRoot, 'execution-prepared.json'), { ...subject, subjectDigest })
  async function cancelOriginal() {
    runtimeFenced = true
    if (!cycleId) {
      scopeUnknown = true
      return
    }
    try {
      await cancelQualityJourneyExecution(
        {
          ...scope,
          cycleId,
          idempotencyKey: `${idempotencyKey}:cancel`,
          expectedStateHash: (await getQualityJourney(scope, client)).journey.stateHash,
          reason: 'Bounded disposable qualification execution stopped; no retry',
        },
        client,
        credentials,
      )
    } finally {
      const drains = await Promise.allSettled(
        acquisition.originals().map(original => tracked(stopOwnedProcessGroup(original))),
      )
      if (drains.some(result => result.status === 'rejected')) scopeUnknown = true
    }
  }
  async function originalCleanup(): Promise<'CONFIRMED' | 'PENDING' | 'UNKNOWN'> {
    if (scopeUnknown || acquisition.snapshot().unknown) return 'UNKNOWN'
    const original = acquisition.requireOriginal(processManager.get(runId!))
    if (original.process.exitCode === null && original.process.signalCode === null) return 'PENDING'
    stop ??= tracked(stopOwnedProcessGroup(original))
    cleanup = await stop
    return cleanup.kind === 'group_exit_observed' &&
      cleanup.supervisorProtocol === 'appraise.owned-supervisor/v1' &&
      cleanup.runtimeBrowserCleanup === 'CLOSE_ACKNOWLEDGED'
      ? 'CONFIRMED'
      : 'UNKNOWN'
  }
  function assertGranted(granted: Awaited<ReturnType<typeof grantQualityJourneyExecutionConsent>>) {
    if (
      granted.id !== consent.executionConsentId ||
      granted.scopeHash !== consent.expectedScopeHash ||
      granted.status !== 'GRANTED'
    )
      throw new Error('Exact execution consent was not granted')
  }
  function assertStarted(started: Awaited<ReturnType<typeof startQualityJourneyExecution>>) {
    if ('consentRequired' in started) throw new Error('Original execution still requires consent')
    if (
      started.cycles.length !== 1 ||
      started.cycles[0].testRuns.length !== 1 ||
      !cycleId ||
      started.cycles[0].id !== cycleId
    )
      throw new Error('Original execution start did not bind one cycle')
  }
  function originalIdentity() {
    if (!cycleId || !runId || !testRunId) throw new Error('Original execution identity unavailable')
    return { cycleId, runId, testRunId }
  }
  function readOriginalCycle(id: string) {
    return client.qualityJourneyExecutionCycle.findUniqueOrThrow({
      where: { id },
      include: {
        testRuns: { include: { testRun: { include: { runtimeCapsuleExecutionAttempt: true } } } },
        evidenceReceipts: true,
      },
    })
  }
  type ObservedCycle = Awaited<ReturnType<typeof readOriginalCycle>>
  function originalRun(cycle: ObservedCycle, identity: ReturnType<typeof originalIdentity>) {
    if (cycle.testRuns.length !== 1) throw new Error('Exactly one original TestRun required')
    const run = cycle.testRuns[0].testRun
    if (run.id !== identity.testRunId || run.runId !== identity.runId)
      throw new Error('Original execution identity changed')
    return run
  }
  function receiptIdentity(cycle: ObservedCycle) {
    if (cycle.evidenceReceipts.length !== 1) return { receiptId: null, receiptHash: null }
    return { receiptId: cycle.evidenceReceipts[0].id, receiptHash: cycle.evidenceReceipts[0].receiptHash }
  }
  function collectedAttempt(run: ReturnType<typeof originalRun>) {
    const attempt = run.runtimeCapsuleExecutionAttempt
    return !!attempt && !!attempt.outputCompletedAt && ['COMPLETED', 'FAILED'].includes(attempt.state)
  }
  async function sealedEvidence(cycle: ObservedCycle, run: ReturnType<typeof originalRun>) {
    const receipt = receiptIdentity(cycle)
    if (cycle.status !== 'COMPLETED' || !receipt.receiptId)
      return { ...receipt, sealed: false, completeValidEvidence: false }
    const input = await client.$transaction(tx =>
      compileQualityJourneyTriageInput({ ...scope, executionCycleId: cycle.id }, tx),
    )
    return {
      ...receipt,
      sealed: true,
      completeValidEvidence: completeEvidence(input.runs[0].evidence) && collectedAttempt(run),
    }
  }
  const control = createOriginalExecutionControl({
    provenance: 'ORIGINAL_CANONICAL_RUNTIME',
    source: manifest.credentialSource,
    subjectDigest,
    ...limits,
    async grantAndStart() {
      assertParentCurrent()
      assertInputs(manifest)
      persistNativeDriverPublic(path.join(evidenceRoot, 'execution-spent.json'), {
        version: 'M13_NATIVE_EXECUTION_SPENT_V1',
        subjectDigest,
        allowance: subject.allowance,
        disposition: 'SPENT_BEFORE_EFFECTS',
        outcome: 'UNKNOWN',
        refundPermitted: false,
      })
      const granted = await grantQualityJourneyExecutionConsent({ ...scope, ...consent }, client, credentials)
      assertParentCurrent()
      assertGranted(granted)
      if (runtimeFenced) throw new Error('Original runtime admission fenced')
      launchGranted = true
      const started = await startQualityJourneyExecution(
        { ...request, executionConsentId: consent.executionConsentId },
        client,
        credentials,
      )
      assertParentCurrent()
      assertStarted(started)
    },
    async observeOriginal(): Promise<NativeExecutionObservation> {
      const identity = originalIdentity()
      await tracked(
        nativeExecutionRuntimeFunctions.reconcile({ executionCycleId: identity.cycleId }, client, appraiseRoot),
      )
      const cycle = await readOriginalCycle(identity.cycleId)
      const run = originalRun(cycle, identity)
      const evidence = await sealedEvidence(cycle, run)
      return {
        ...identity,
        ...evidence,
        executionCycles: await client.qualityJourneyExecutionCycle.count({ where: { journeyId: scope.journeyId } }),
        testRuns: await client.testRun.count(),
        cycleStatus: cycle.status,
        runStatus: run.status,
        result: run.result,
        originalCleanup: await originalCleanup(),
        originalOperationsSettled: operations.every(entry => entry.state === 'FULFILLED'),
      }
    },
    cancelOriginal,
    hardUnknown() {
      try {
        persistNativeDriverPublic(path.join(evidenceRoot, 'execution-hard-unknown.json'), {
          outcome: 'UNKNOWN',
          consumed: true,
          nextCasePermitted: false,
        })
      } finally {
        try {
          for (const original of acquisition.originals()) if (original.process.connected) original.process.disconnect()
        } finally {
          process.exit(2)
        }
      }
    },
  })
  return Object.freeze({
    publicPrepared: () => structuredClone({ subject, subjectDigest }),
    control,
    source: structuredClone(manifest.credentialSource),
  })
}
