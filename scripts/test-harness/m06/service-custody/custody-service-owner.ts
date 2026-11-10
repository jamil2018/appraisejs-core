import { compositionServiceCase, composeServiceOriginalNonstart } from './custody-service-composition'
import { serviceOwnerNonce, createServiceOwnerBootstrap } from './custody-owner-bootstrap'
import { createServiceOriginalSendCallback, type ServiceSendWindowState } from './custody-service-send-callback'
import { enterServiceIpcFaultWindow, type ServiceIpcWindowState } from './custody-service-ipc-window'
import { dispatchServiceComplementAfterCommit, runServiceOwnerMain } from './custody-service-routing'
import { captureServiceComplementCanonical } from './custody-complement-canonical'
import {
  countComplementPersistence,
  forwardComplementRaw,
  forwardComplementTransaction,
  forwardComplementDisconnect,
  assertComplementHeldBaseline,
  type ComplementObservationState,
  type ComplementCleanupState,
} from './custody-complement-observation'
import {
  sendFixtureTerminalHandoff,
  serviceNormalReportDelivered,
  routeNativeFixtureReply,
  fixtureRetainedFailureReport,
  persistFixtureRetainedFailure,
  notifyFixtureRetainedFailure,
  disconnectFixtureRetainedOwner,
} from './custody-fixture-transport'
import { publishIpcFaultArtifact } from './custody-fixture-ipc-fault'
import {
  encodeFixtureTerminalCallbackReceipt,
  publishFixtureTerminalCallbackReceipt,
} from './custody-fixture-terminal-receipt'
import { assertFixtureDatabaseClosed } from './custody-fixture-cleanup'
import assert from 'node:assert/strict'
import { fixtureDateTime, fixtureOriginalTemporal } from './custody-fixture-datetime'
import { fork, execFileSync, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PrismaClient, type Prisma } from '@prisma/client'
import { addManagedProviderAssignment } from '@/test/quality-journey-provider-fixture'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { OutcomeSourceUnknownError } from '@/lib/quality-journey/codex-app-server/outcome-source-contract'
import { ServiceError } from '@/services/shared/errors'
import { createSyntheticOutcomeCustodian } from '@/lib/quality-journey/codex-app-server/outcome-source'
import {
  createProviderSourcePrismaClient,
  disposeProviderSourceDatabase,
  providerSourceDatabaseSnapshot,
} from '@/lib/quality-journey/provider-source-database'
import {
  bindProviderSendPermitTransport,
  inspectProviderSenderExcluded,
  sealConsumedProviderSender,
  trustedProviderObservation,
  trustedProviderReconciliation,
} from '@/lib/quality-journey/provider-intent-contract'
import {
  providerReconciliationRequestHash,
  unavailableNativeProviderReconciliation,
  validateProviderReconciliationEvidence,
} from '@/lib/quality-journey/provider-reconciliation-contract'
import {
  armQualityJourneyProviderIntent as arm,
  claimQualityJourneyProviderIntent as claim,
  prepareQualityJourneyProviderRun as prepare,
  recordQualityJourneyProviderAcknowledgement as acknowledge,
  reconcileConsumedQualityJourneyProviderIntent as reconcile,
  writeQualityJourneyProviderTransport as write,
} from '@/services/coordinator/quality-journey-provider-run-service'
import {
  originalSourceResources,
  assertEligibleSourceDestruction,
  type OriginalSourceResourceDiagnostics,
} from './custody-source-resource-diagnostics'
type Source = Awaited<ReturnType<typeof createSyntheticOutcomeCustodian>>
type Message = Record<string, unknown>
const name = process.argv[2]
const workspace = process.argv[3]
const nativeScript = process.argv[4]
const databasePath = path.join(workspace, 'canonical.db')
const ipcFaultCase = name === 'ipc-loss-before-postcallback-sql'
const nonce = serviceOwnerNonce(process.argv)
const eventFile = path.join(workspace, 'owner-events.jsonl')
const retained: unknown[] = []
let retired = false
let completed = false
let failureReported = false
let sequence = 0
const complementNames = new Set([
  'disposed-original-after-writer-close',
  'wrong-original-client',
  'old-commit-other-key-retirement',
  'unrelated-pre-sql-retirement',
  'retired-release-sync-cleanup-throw',
])
let activationRetention: Message | undefined
let complementRetention: Message | undefined
let otherClosedClient: PrismaClient | undefined
const ipcWindowState: ServiceIpcWindowState = { waiting: false, frame: undefined }
const { lifetime, admission, terminal } = createServiceOwnerBootstrap(
  retained,
  reportUnexpectedFailure,
  name,
  nonce,
  sendTerminalHandoff,
  {
    validateFinish(type) {
      assertFixtureActive('terminal-finish-preconditions')
      if (type === 'case-known-closed') assert.equal(completed, true)
      else {
        assert.equal(retired, true)
        assert.equal(completed, false)
      }
      assert.equal(typeof process.disconnect, 'function')
    },
    prepareCommit(handoff) {
      const prepared = admission.keepActual(
        'terminal-encoded-callback-commit',
        encodeFixtureTerminalCallbackReceipt({
          case: name,
          pid: process.pid,
          nonce,
          ownerScript: process.argv[1],
          terminalType: handoff.terminalType as 'case-known-closed' | 'case-retained',
          terminalSequence: Number(handoff.terminalSequence),
          handoffSequence: Number(handoff.sequence),
          expectedFixtureSha256: String(handoff.expectedFixtureSha256),
        }),
      )
      return () => publishFixtureTerminalCallbackReceipt(workspace, prepared.encoded)
    },
    finish(type) {
      process.disconnect!()
      if (type === 'case-known-closed') clearInterval(lifetime)
    },
  },
)
const { assertActive: assertFixtureActive, admitActual, afterActual } = admission
function sendTerminalHandoff(value: Record<string, unknown>, delivered: (handoff: Record<string, unknown>) => void) {
  sendFixtureTerminalHandoff(
    admission,
    process,
    () => eventFile,
    () => ++sequence,
    retain,
    value,
    delivered,
  )
}

function reportUnexpectedFailure(error: unknown, phase: string): void {
  rememberRetentionFailure(error)
  if (failureReported) return
  failureReported = true
  const failure = {
    ...retainedFailureReport(error),
    classification: 'UNEXPECTED_FIXTURE_FAILURE',
    version: 1,
    phase,
    operationPhase: admission.currentPhase,
    referenceSummary: admission.referenceSummary(),
  }
  persistRetainedFailure(failure)
  notifyRetainedFailure(failure)
  disconnectRetainedOwner()
}
function event(type: string, detail: Message = {}) {
  assertFixtureActive('normal-report:' + type)
  const value = admission.keepActual('normal-report-object', {
    sequence: ++sequence,
    type,
    case: name,
    pid: process.pid,
    nonce,
    ...detail,
  })
  try {
    const encoded = JSON.stringify(value)
    assert.ok(Buffer.byteLength(encoded) <= 128 * 1024, 'Fixture report exceeds reviewed bound')
    appendFileSync(eventFile, encoded + '\n')
    if (type === 'case-known-closed' || type === 'case-retained') terminal.register(value)
    const sent = process.send!(value, error => {
      serviceNormalReportDelivered(admission, ipcWindowState.waiting, type, error, retain)
    })
    admission.keepActual('normal-report-send-result', sent)
  } catch (error) {
    retain(error)
    throw error
  }
}
function rememberRetentionFailure(error: unknown): void {
  try {
    retained.push(error)
  } catch {}
}
function retainedFailureReport(error: unknown): Message {
  return fixtureRetainedFailureReport(
    { case: name, pid: process.pid, nonce },
    error,
    () => ++sequence,
    rememberRetentionFailure,
  )
}
function persistRetainedFailure(failure: Message): void {
  persistFixtureRetainedFailure(workspace, () => eventFile, failure, rememberRetentionFailure)
}
function notifyRetainedFailure(failure: Message): void {
  notifyFixtureRetainedFailure(process, failure, rememberRetentionFailure)
}
function disconnectRetainedOwner(): void {
  disconnectFixtureRetainedOwner(process, rememberRetentionFailure)
}

function retain(error: unknown): void {
  admission.fail(error)
}
process.on('error', retain)
process.on('uncaughtException', retain)
process.on('unhandledRejection', retain)
process.on('disconnect', () => {
  if (!admission.expectedTerminalHandoff)
    admission.fail(new Error('Unexpected supervisor disconnect; owner retained'), 'supervisor-disconnect')
})
process.on('message', raw => {
  try {
    terminal.acknowledge(raw)
  } catch (error) {
    retain(error)
  }
})
type NativeProbeRow = {
  ok: boolean
  changes?: number
  before?: number
  after?: number
  errcode?: number
}
function assertNativeProbeRow(row: NativeProbeRow, busy: boolean): void {
  assertFixtureActive('custody-service-owner.ts:128:1:entry')
  admitActual('custody-service-owner.ts:129:3:operation', () => assert.equal(row.ok, !busy))
  if (busy) {
    assertFixtureActive('custody-service-owner.ts:130:13:operation')
    assert.ok(row.errcode === 5 || row.errcode === 6, 'Actual SQLite BUSY/LOCKED required')
  } else {
    admitActual('custody-service-owner.ts:132:5:operation', () => assert.equal(row.changes, 1))
    admitActual('custody-service-owner.ts:133:5:operation', () =>
      assert.equal(
        admitActual('custody-service-owner.ts:133:18:operation', () => Number(row.after)),
        admitActual('custody-service-owner.ts:133:37:operation', () => Number(row.before)) + 1,
      ),
    )
  }
}
function isHeldWriterWindow(): boolean {
  assertFixtureActive('custody-service-owner.ts:137:1:entry')
  return name === 'late-writer' || name === 'lost-reply'
}
class NativeContender {
  readonly child: ChildProcess
  #next = 0
  #closeRequested = false
  #pending = new Map<
    string,
    {
      resolve(value: Message): void
      reject(error: Error): void
    }
  >()
  readonly ready: Promise<Message>
  constructor() {
    assertFixtureActive('custody-service-owner.ts:146:3:entry')
    let readyResolve!: (value: Message) => void
    let readyReject!: (error: Error) => void
    this.ready = admitActual(
      'custody-service-owner.ts:149:18:operation',
      () =>
        new Promise((resolve, reject) => {
          assertFixtureActive('custody-service-owner.ts:149:30:entry')
          readyResolve = resolve
          readyReject = reject
        }),
    )
    this.child = admitActual('custody-service-owner.ts:153:18:operation', () =>
      fork(nativeScript, [databasePath], {
        execPath: process.execPath,
        execArgv: [],
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        env: { PATH: process.env.PATH } as unknown as NodeJS.ProcessEnv,
      }),
    )
    retained.push(this.child)
    admitActual('custody-service-owner.ts:160:5:operation', () =>
      this.child.stdout?.on('data', chunk => {
        try {
          admitActual('native-stdout', () => appendFileSync(path.join(workspace, 'native.stdout'), chunk))
        } catch (error) {
          retain(error)
        }
      }),
    )
    admitActual('custody-service-owner.ts:161:5:operation', () =>
      this.child.stderr?.on('data', chunk => {
        try {
          admitActual('native-stderr', () => appendFileSync(path.join(workspace, 'native.stderr'), chunk))
        } catch (error) {
          retain(error)
        }
      }),
    )
    admitActual('custody-service-owner.ts:162:5:operation', () =>
      this.child.on('message', raw => {
        routeNativeFixtureReply(admission, raw, {
          rejectFatal: value => this.#rejectFatalResponse(value, readyReject),
          report: value => event('native-message', { value }),
          retain,
          ready: readyResolve,
          pending: value => this.#resolvePendingResponse(value),
        })
      }),
    )
    admitActual('custody-service-owner.ts:172:5:operation', () =>
      this.child.on('error', error => {
        retain(error)
        readyReject(error)
      }),
    )
    admitActual('native-exit-observer', () =>
      this.child.on('exit', (code, signal) => {
        if (!this.#closeRequested || code !== 0 || signal)
          admission.fail(new Error(`Unexpected native contender exit ${code}/${signal}`), 'native-exit')
      }),
    )
    admitActual('native-stdout-error-observer', () => this.child.stdout?.on('error', retain))
    admitActual('native-stderr-error-observer', () => this.child.stderr?.on('error', retain))
  }
  #rejectFatalResponse(value: Message, readyReject: (error: Error) => void): void {
    admission.fail(value, 'native-fatal')
    const error = new Error(`Actual native contender failure: ${String(value.message)}`)
    readyReject(error)
    for (const pending of this.#pending.values()) pending.reject(error)
    this.#pending.clear()
  }
  #resolvePendingResponse(value: Message): void {
    const pending = this.#pending.get(String(value.id))
    if (!pending) return retain(new Error('Unexpected native response'))
    this.#pending.delete(String(value.id))
    pending.resolve(value)
  }
  async request(type: string, detail: Message = {}) {
    assertFixtureActive('custody-service-owner.ts:189:3:entry')
    const id = admitActual('custody-service-owner.ts:190:16:operation', () => String(++this.#next))
    const promise = admitActual(
      'custody-service-owner.ts:191:21:operation',
      () =>
        new Promise<Message>(
          (resolve, reject) => (
            assertFixtureActive('custody-service-owner.ts:191:42:entry'),
            admitActual('custody-service-owner.ts:191:63:operation', () => this.#pending.set(id, { resolve, reject }))
          ),
        ),
    )
    admitActual('custody-service-owner.ts:192:5:operation', () =>
      event('native-request', { id, command: type, ...detail }),
    )
    admitActual('custody-service-owner.ts:193:5:operation', () =>
      this.child.send({ type, id, ...detail }, error => {
        if (error) retain(error)
      }),
    )
    return promise
  }
  async probe(journeyId: string, sourceId: string, busy: boolean) {
    assertFixtureActive('custody-service-owner.ts:196:3:entry')
    const result = afterActual(
      'custody-service-owner.ts:197:20:await',
      await admitActual('custody-service-owner.ts:197:20:await-operation', () =>
        admitActual('custody-service-owner.ts:197:26:operation', () =>
          this.request(busy ? 'probe' : 'control', { journeyId, sourceId }),
        ),
      ),
    )
    const rows = result.rows as Array<NativeProbeRow>
    admitActual('custody-service-owner.ts:199:5:operation', () => assert.equal(rows.length, 2))
    for (const row of rows)
      admitActual('custody-service-owner.ts:200:29:operation', () => assertNativeProbeRow(row, busy))
  }
  async close() {
    assertFixtureActive('custody-service-owner.ts:202:3:entry')
    const exit = admitActual(
      'custody-service-owner.ts:203:18:operation',
      () =>
        new Promise<void>(
          (resolve, reject) => (
            assertFixtureActive('custody-service-owner.ts:203:36:entry'),
            admitActual('custody-service-owner.ts:204:7:operation', () =>
              this.child.once('exit', (code, signal) => {
                if (code !== 0 || signal) reject(new Error(`Native contender exit ${code}/${signal}`))
                else resolve()
              }),
            )
          ),
        ),
    )
    this.#closeRequested = true
    afterActual(
      'custody-service-owner.ts:209:5:await',
      await admitActual('custody-service-owner.ts:209:5:await-operation', () =>
        admitActual('custody-service-owner.ts:209:11:operation', () => this.request('close')),
      ),
    )
    afterActual(
      'custody-service-owner.ts:210:5:await',
      await admitActual('custody-service-owner.ts:210:5:await-operation', () => exit),
    )
  }
}
function wrapTransaction(
  client: PrismaClient,
  run: (
    callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
    original: PrismaClient['$transaction'],
  ) => Promise<unknown>,
) {
  assertFixtureActive('custody-service-owner.ts:214:1:entry')
  const original = admitActual('custody-service-owner.ts:221:20:operation', () => client.$transaction.bind(client))
  client.$transaction = ((callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => (
    assertFixtureActive('custody-service-owner.ts:222:26:entry'),
    admitActual('custody-service-owner.ts:223:5:operation', () => run(callback, original))
  )) as PrismaClient['$transaction']
  return () => {
    assertFixtureActive('custody-service-owner.ts:224:10:entry')
    client.$transaction = original
  }
}
function assertClientDestructionStable(
  baseline: ReturnType<typeof providerSourceDatabaseSnapshot>,
  actual: ReturnType<typeof providerSourceDatabaseSnapshot>,
) {
  assertFixtureActive('custody-service-owner.ts:228:1:entry')
  for (const owner of ['canonical', 'resolver'] as const)
    for (const field of ['closed', 'engineClosed', 'nativeClosed', 'stopCalls', 'nativeCalls'] as const)
      admitActual('custody-service-owner.ts:234:7:operation', () =>
        assert.equal(actual[owner][field], baseline[owner][field], `${owner}.${field}`),
      )
}
function assertRetained(source: Source, baseline: OriginalSourceResourceDiagnostics) {
  assertFixtureActive('custody-service-owner.ts:236:1:entry')
  const snapshot = admitActual('custody-service-owner.ts:237:20:operation', () => source.snapshot())
  admitActual('custody-service-owner.ts:238:3:operation', () => assert.equal(snapshot.disposed, false))
  admitActual('custody-service-owner.ts:239:3:operation', () => assert.equal(snapshot.disposeRequested, true))
  admitActual('custody-service-owner.ts:240:3:operation', () => assert.equal(snapshot.held, true))
  admitActual('custody-service-owner.ts:241:3:operation', () => assert.equal(snapshot.retired, true))
  admitActual('custody-service-owner.ts:242:3:operation', () =>
    assert.deepEqual(
      admitActual('custody-service-owner.ts:242:20:operation', () => originalSourceResources(snapshot)),
      baseline,
    ),
  )
}
let expectedFixtureSha256: string | undefined
let killPending = false
const parkedForExactKill = () => admission.keepActual('permanent-exact-kill-park', new Promise<never>(() => {}))
function stageCrash(gate: string): void {
  assertFixtureActive('custody-service-owner.ts:248:1:entry')
  admitActual('custody-service-owner.ts:249:3:operation', () => assert.equal(killPending, false))
  killPending = true
  const request = {
    pid: process.pid,
    nonce,
    case: name,
    gate,
    databasePath,
    lifecycle: 'OWNED_OFFLINE_FIXTURE_ONLY',
    expectedFixtureSha256,
  }
  admitActual('custody-service-owner.ts:260:3:operation', () =>
    writeFileSync(
      admitActual('custody-service-owner.ts:260:17:operation', () => path.join(workspace, 'crash-request.json')),
      admitActual('custody-service-owner.ts:260:61:operation', () => JSON.stringify(request, null, 2)) + '\n',
    ),
  )
  admitActual('custody-service-owner.ts:261:3:operation', () => event('crash-ready', request))
}
async function crash(gate: string): Promise<never> {
  assertFixtureActive('custody-service-owner.ts:263:1:entry')
  admitActual('custody-service-owner.ts:264:3:operation', () => stageCrash(gate))
  // The reviewed supervisor alone signals this exact child object/PID after validating this tuple.
  return parkedForExactKill()
}
const expectedFile = path.join(workspace, 'expected-fixture.json')
let expectedFixture: Message
function scalarState(row: Record<string, unknown>): Message {
  assertFixtureActive('custody-service-owner.ts:271:1:entry')
  const result = { ...row }
  delete result.createdAt
  return result
}
function writeExpectation(update: Message): void {
  assertFixtureActive('custody-service-owner.ts:276:1:entry')
  expectedFixture = { ...expectedFixture, ...update }
  const encoded =
    admitActual('custody-service-owner.ts:278:19:operation', () => JSON.stringify(expectedFixture, null, 2)) + '\n'
  {
    assertFixtureActive('custody-service-owner.ts:279:3:operation')
    assert.ok(
      admitActual('custody-service-owner.ts:279:13:operation', () => Buffer.byteLength(encoded)) <= 128 * 1024,
      'Diagnostic expected fixture metadata exceeds its bound',
    )
  }
  admitActual('custody-service-owner.ts:280:3:operation', () => writeFileSync(expectedFile, encoded))
  expectedFixtureSha256 = admitActual('custody-service-owner.ts:281:27:operation', () =>
    admitActual('custody-service-owner.ts:281:27:operation', () =>
      admitActual('custody-service-owner.ts:281:27:operation', () => createHash('sha256')).update(encoded),
    ).digest('hex'),
  )
}
async function createOriginalFixture() {
  assertFixtureActive('custody-service-owner.ts:284:1:entry')
  {
    assertFixtureActive('custody-service-owner.ts:285:3:operation')
    assert.ok(admitActual('custody-service-owner.ts:285:13:operation', () => existsSync(workspace)))
  }
  admitActual('custody-service-owner.ts:286:3:operation', () =>
    assert.equal(process.env.DATABASE_URL, `file:${databasePath}`),
  )
  admitActual('custody-service-owner.ts:287:3:operation', () => event('owner-start', { databasePath }))
  admitActual('custody-service-owner.ts:288:3:operation', () =>
    execFileSync(process.execPath, ['e2e/apply-migrations.mjs'], {
      cwd: admitActual('custody-service-owner.ts:289:10:operation', () => process.cwd()),
      env: { PATH: process.env.PATH, DATABASE_URL: `file:${databasePath}` } as unknown as NodeJS.ProcessEnv,
      stdio: 'pipe',
    }),
  )
  if (name === 'wrong-original-client') {
    otherClosedClient = afterActual('16h:wrong-setup', await admitActual('16h:wrong-setup', prepareWrongOriginalClient))
  }
  const { client, ready } = admitActual('custody-service-owner.ts:293:29:operation', () =>
    createProviderSourcePrismaClient(`file:${databasePath}`),
  )
  retained.push(client, ready)
  const database = afterActual(
    'custody-service-owner.ts:295:20:await',
    await admitActual('custody-service-owner.ts:295:20:await-operation', () => ready),
  )
  const clientDestructionBaseline = admitActual('custody-service-owner.ts:296:37:operation', () =>
    providerSourceDatabaseSnapshot(database),
  )
  const targetProjectId = 'custody-service-offline'
  afterActual(
    'custody-service-owner.ts:298:3:await',
    await admitActual('custody-service-owner.ts:298:3:await-operation', () =>
      admitActual('custody-service-owner.ts:298:9:operation', () =>
        client.targetProject.create({
          data: {
            id: targetProjectId,
            kind: 'LOCAL_WORKSPACE',
            canonicalIdentity: `path:${workspace}`,
            canonicalPath: workspace,
            displayName: 'Original sole-Prisma custody fixture',
            fingerprint: `sha256:${admitActual('custody-service-owner.ts:305:30:operation', () => 'a'.repeat(64))}`,
          },
        }),
      ),
    ),
  )
  const f = afterActual(
    'custody-service-owner.ts:308:13:await',
    await admitActual('custody-service-owner.ts:308:13:await-operation', () =>
      admitActual('custody-service-owner.ts:308:19:operation', () =>
        addManagedProviderAssignment(client, targetProjectId),
      ),
    ),
  )
  f.prepareInput.providerNamespace = `synthetic:custody:${admitActual('custody-service-owner.ts:309:59:operation', () => path.basename(workspace))}`
  const prepared = afterActual(
    'custody-service-owner.ts:310:20:await',
    await admitActual('custody-service-owner.ts:310:20:await-operation', () =>
      admitActual('custody-service-owner.ts:310:26:operation', () => prepare(f.prepareInput, client)),
    ),
  )
  const request = { ...f.binding, intentId: prepared.intent.id, claimOwner: 'offline-custody' }
  const claimed = afterActual(
    'custody-service-owner.ts:312:19:await',
    await admitActual('custody-service-owner.ts:312:19:await-operation', () =>
      admitActual('custody-service-owner.ts:312:25:operation', () => claim(request, client)),
    ),
  )
  const armed = afterActual(
    'custody-service-owner.ts:313:17:await',
    await admitActual('custody-service-owner.ts:313:17:await-operation', () =>
      admitActual('custody-service-owner.ts:313:23:operation', () =>
        arm({ ...request, claimEpoch: claimed.intent.claimEpoch }, client),
      ),
    ),
  )
  const permit = armed.permit!
  const source = afterActual(
    'custody-service-owner.ts:315:18:await',
    await admitActual('custody-service-owner.ts:315:18:await-operation', () =>
      admitActual('custody-service-owner.ts:315:24:operation', () =>
        createSyntheticOutcomeCustodian({
          database,
          identity: {
            ...permit,
            providerNamespace: f.prepareInput.providerNamespace as `synthetic:${string}`,
            configurationDigest: f.prepareInput.configurationDigest,
          },
        }),
      ),
    ),
  )
  retained.push(source)
  admitActual('custody-service-owner.ts:324:3:operation', () =>
    bindProviderSendPermitTransport(permit, source.transport.owner, f.prepareInput),
  )
  afterActual(
    'custody-service-owner.ts:325:3:await',
    await admitActual('custody-service-owner.ts:325:3:await-operation', () =>
      admitActual('custody-service-owner.ts:325:9:operation', () => source.observeEncodingHole()),
    ),
  )
  const initialState = afterActual(
    'custody-service-owner.ts:326:24:await',
    await admitActual('custody-service-owner.ts:326:24:await-operation', () =>
      admitActual('custody-service-owner.ts:326:30:operation', () =>
        client.qualityJourneyProviderSourceState.findUniqueOrThrow({
          where: { intentId: permit.intentId },
        }),
      ),
    ),
  )
  const occupiedOrdinals = afterActual(
    'custody-service-owner.ts:329:28:await',
    await admitActual('custody-service-owner.ts:329:28:await-operation', () =>
      admitActual('custody-service-owner.ts:329:34:operation', () =>
        client.qualityJourneyProviderDispatchIntent.findMany({
          where: { providerRunId: armed.run.id },
          select: { turnOrdinal: true },
          take: 4,
        }),
      ),
    ),
  )
  {
    assertFixtureActive('custody-service-owner.ts:334:3:operation')
    assert.ok(occupiedOrdinals.length <= 3)
  }
  const controlOrdinal = admitActual('custody-service-owner.ts:335:26:operation', () =>
    [1, 2, 3].find(
      ordinal => (
        assertFixtureActive('custody-service-owner.ts:335:41:entry'),
        !admitActual('custody-service-owner.ts:335:53:operation', () =>
          occupiedOrdinals.some(
            row => (assertFixtureActive('custody-service-owner.ts:335:75:entry'), row.turnOrdinal === ordinal),
          ),
        )
      ),
    ),
  )
  admitActual('custody-service-owner.ts:336:3:operation', () =>
    assert.notEqual(controlOrdinal, undefined, 'No unused canonical control ordinal'),
  )
  // A diagnostic-only row exercises identical writable-table SQL without altering the original source fence.
  const controlIntent = afterActual(
    'custody-service-owner.ts:338:25:await',
    await admitActual('custody-service-owner.ts:338:25:await-operation', () =>
      admitActual('custody-service-owner.ts:338:31:operation', () =>
        client.qualityJourneyProviderDispatchIntent.create({
          data: {
            id: `control-${nonce}`,
            providerRunId: armed.run.id,
            turnOrdinal: controlOrdinal!,
            operationKey: `control-${nonce}`,
            requestHash: `sha256:${admitActual('custody-service-owner.ts:344:30:operation', () => 'd'.repeat(64))}`,
            envelopeDigest: f.prepareInput.envelopeDigest,
            providerNamespace: `synthetic:control:${nonce}`,
          },
        }),
      ),
    ),
  )
  const controlState = initialState
  const createdControlState = afterActual(
    'custody-service-owner.ts:350:31:await',
    await admitActual('custody-service-owner.ts:350:31:await-operation', () =>
      admitActual('custody-service-owner.ts:350:37:operation', () =>
        client.qualityJourneyProviderSourceState.create({
          data: {
            ...controlState,
            sourceId: `control-${nonce}`,
            sourceIncarnation: `control-${nonce}`,
            intentId: controlIntent.id,
            providerNamespace: controlIntent.providerNamespace,
          },
        }),
      ),
    ),
  )
  const contender = admitActual('custody-service-owner.ts:359:21:operation', () => new NativeContender())
  const native = afterActual(
    'custody-service-owner.ts:360:18:await',
    await admitActual('custody-service-owner.ts:360:18:await-operation', () => contender.ready),
  )
  admitActual('custody-service-owner.ts:361:3:operation', () => assert.notEqual(native.pid, process.pid))
  admitActual('custody-service-owner.ts:362:3:operation', () =>
    assert.equal(
      native.filename,
      admitActual('custody-service-owner.ts:362:33:operation', () => realpathSync(databasePath)),
    ),
  )
  admitActual('custody-service-owner.ts:363:3:operation', () => assert.equal(native.busyTimeout, 0))
  admitActual('custody-service-owner.ts:364:3:operation', () => assert.equal(native.queryOnly, 0))
  afterActual(
    'custody-service-owner.ts:365:3:await',
    await admitActual('custody-service-owner.ts:365:3:await-operation', () =>
      admitActual('custody-service-owner.ts:365:9:operation', () =>
        contender.probe(f.binding.journeyId, `control-${nonce}`, false),
      ),
    ),
  )
  const sourceId = initialState.sourceId
  const row = () => (
    assertFixtureActive('custody-service-owner.ts:367:15:entry'),
    admitActual('custody-service-owner.ts:367:21:operation', () =>
      client.qualityJourneyProviderSourceState.findUniqueOrThrow({ where: { sourceId } }),
    )
  )
  const slot = () => (
    assertFixtureActive('custody-service-owner.ts:368:16:entry'),
    admitActual('custody-service-owner.ts:368:22:operation', () =>
      client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } }),
    )
  )
  const originalRun = admitActual('custody-service-owner.ts:369:23:operation', () =>
    Object.fromEntries(
      admitActual('custody-service-owner.ts:370:5:operation', () =>
        admitActual('custody-service-owner.ts:370:5:operation', () => Object.entries(armed.run)).filter(
          ([key]) => (
            assertFixtureActive('custody-service-owner.ts:371:7:entry'),
            !admitActual('custody-service-owner.ts:372:10:operation', () =>
              [
                'createdAt',
                'earliestIntentAt',
                'unresolvedRetentionAt',
                'terminalReconciledAt',
                'terminalRetentionAt',
              ].includes(key),
            )
          ),
        ),
      ),
    ),
  )
  const originalIntent = admitActual('custody-service-owner.ts:381:26:operation', () =>
    Object.fromEntries(
      admitActual('custody-service-owner.ts:382:5:operation', () =>
        admitActual('custody-service-owner.ts:382:5:operation', () => Object.entries(armed.intent)).filter(
          ([key]) => (
            assertFixtureActive('custody-service-owner.ts:383:7:entry'),
            !admitActual('custody-service-owner.ts:384:10:operation', () =>
              [
                'createdAt',
                'claimExpiresAt',
                'armedAt',
                'acknowledgementDueAt',
                'turnDueAt',
                'acknowledgedAt',
                'invalidatedAt',
                'reconciledAt',
              ].includes(key),
            )
          ),
        ),
      ),
    ),
  )
  const originalTemporal = afterActual(
    'custody-service-owner.ts:396:28:operation',
    (assertFixtureActive('custody-service-owner.ts:396:28:operation'),
    fixtureOriginalTemporal(
      afterActual(
        'custody-service-owner.ts:396:53:await',
        await admitActual('custody-service-owner.ts:396:53:await-operation', () =>
          admitActual('custody-service-owner.ts:396:59:operation', () => slot()),
        ),
      ).reservedAt,
      armed,
    )),
  )
  admitActual('custody-service-owner.ts:397:3:operation', () => assert.notEqual(originalTemporal.reservedAt, null))
  afterActual(
    'custody-service-owner.ts:398:3:operation',
    (assertFixtureActive('custody-service-owner.ts:398:3:operation'),
    writeExpectation({
      version: 1,
      case: name,
      pid: process.pid,
      nonce,
      databasePath,
      identity: {
        journeyId: f.binding.journeyId,
        targetProjectId,
        runId: armed.run.id,
        intentId: armed.intent.id,
        sendBoundaryId: permit.sendBoundaryId,
        claimEpoch: permit.claimEpoch,
        providerNamespace: f.prepareInput.providerNamespace,
        configurationDigest: f.prepareInput.configurationDigest,
        sourceId,
        sourceIncarnation: initialState.sourceIncarnation,
        protocolDigest: initialState.protocolDigest,
        qualificationDigest: initialState.qualificationDigest,
        identityJson: initialState.identityJson,
        observationKey: 'original-nonstart',
      },
      control: {
        intentId: controlIntent.id,
        sourceId: `control-${nonce}`,
        providerNamespace: controlIntent.providerNamespace,
        ordinal: controlOrdinal,
      },
      originalRun,
      originalIntent,
      originalTemporal,
      controlSource: {
        ...admitActual('custody-service-owner.ts:430:10:operation', () => scalarState(createdControlState)),
        commitFenceVersion: createdControlState.commitFenceVersion + 1,
      },
      turnsReserved: 1,
      frozenTurnCap: 3,
      occupiedSource: admitActual('custody-service-owner.ts:435:21:operation', () => scalarState(initialState)),
      phase: 'BEFORE_ORIGINAL_SEND',
      postCommitControls: 0,
      occupiedJourneyVersion: afterActual(
        'custody-service-owner.ts:438:30:await',
        await admitActual('custody-service-owner.ts:438:30:await-operation', () =>
          admitActual('custody-service-owner.ts:438:36:operation', () =>
            client.qualityJourney.findUniqueOrThrow({ where: { id: f.binding.journeyId } }),
          ),
        ),
      ).ownershipVersion,
    })),
  )
  return { client, database, clientDestructionBaseline, f, armed, permit, source, contender, sourceId, row, slot }
}
export type OriginalFixture = Awaited<ReturnType<typeof createOriginalFixture>>

// These ordinary method observers are installed only for the five fixed complements, before factory mint.
// They return every original raw/outer result unchanged and never fence already-admitted product work.
function instrumentComplementPersistence() {
  assertFixtureActive('16h:instrument-before-mint')
  const prototype = PrismaClient.prototype
  const methods = ['$queryRawUnsafe', '$executeRawUnsafe', '$transaction', '$disconnect'] as const
  const descriptors = new Map(methods.map(method => [method, Object.getOwnPropertyDescriptor(prototype, method)!]))
  for (const descriptor of descriptors.values()) assert.equal(typeof descriptor.value, 'function')
  const observation: ComplementObservationState = {
    receivers: new Map(),
    transactions: new WeakSet(),
    entries: 0,
    barriers: 0,
    discoveryComplete: false,
  }
  const cleanup: ComplementCleanupState<ReturnType<Source['snapshot']>> = {
    target: undefined,
    cleanupThrow: false,
    controlledCalls: 0,
    sourceAtCleanup: undefined,
    cleanupBefore: undefined,
    cleanupError: admission.keepActual(
      '16h:controlled-cleanup-error',
      new Error('CONTROLLED_RECONCILE_CLIENT_CLEANUP_THROW'),
    ),
  }
  function count(
    receiver: object,
    method: '$queryRawUnsafe' | '$executeRawUnsafe' | '$transaction' | '$disconnect',
    args: unknown[] = [],
  ) {
    countComplementPersistence(admission, observation, name, receiver, method, args)
  }
  for (const method of ['$queryRawUnsafe', '$executeRawUnsafe'] as const) {
    const descriptor = descriptors.get(method)!
    Object.defineProperty(prototype, method, {
      ...descriptor,
      value: function (...args: unknown[]) {
        return forwardComplementRaw(admission, count, this, method, descriptor.value, args)
      },
    })
  }
  const transaction = descriptors.get('$transaction')!
  Object.defineProperty(prototype, '$transaction', {
    ...transaction,
    value: function (action: unknown, ...args: unknown[]) {
      return forwardComplementTransaction(admission, observation, count, this, transaction.value, action, args)
    },
  })
  const disconnect = descriptors.get('$disconnect')!
  Object.defineProperty(prototype, '$disconnect', {
    ...disconnect,
    value: function (...args: unknown[]) {
      return forwardComplementDisconnect(admission, cleanup, count, this, disconnect.value, args)
    },
  })
  return {
    bind(fixture: OriginalFixture) {
      assertFixtureActive('16h:bind-genuine-receivers')
      cleanup.target = fixture
      assert.equal(observation.receivers.size, name === 'wrong-original-client' ? 4 : 2)
      assert.ok(observation.receivers.has(fixture.client), 'Canonical must be an actually observed ordinary receiver')
      observation.discoveryComplete = true
    },
    counts() {
      assertFixtureActive('16h:persistence-counts')
      return {
        entries: observation.entries,
        barriers: observation.barriers,
        receivers: [...observation.receivers.values()].map(row => ({ ...row })),
        canonical: cleanup.target ? { ...observation.receivers.get(cleanup.target.client)! } : undefined,
      }
    },
    armCleanup(before: OriginalSourceResourceDiagnostics) {
      assertFixtureActive('16h:arm-controlled-cleanup')
      assert.equal(name, 'retired-release-sync-cleanup-throw')
      cleanup.cleanupBefore = before
      cleanup.cleanupThrow = true
    },
    cleanupEvidence() {
      assertFixtureActive('16h:cleanup-evidence')
      return {
        controlledCalls: cleanup.controlledCalls,
        sourceAtCleanup: cleanup.sourceAtCleanup,
        cleanupError: cleanup.cleanupError,
      }
    },
  }
}
export type ComplementTrace = ReturnType<typeof instrumentComplementPersistence>
export type SealedOriginal = Awaited<ReturnType<typeof sealOriginalProof>>
type ReconciledOriginal = Awaited<ReturnType<typeof reconcile>>

async function prepareWrongOriginalClient() {
  assertFixtureActive('16h:wrong-client-setup')
  const filename = path.join(workspace, 'closed-other.db')
  admitActual('16h:other-database-migrations', () =>
    execFileSync(process.execPath, ['e2e/apply-migrations.mjs'], {
      cwd: process.cwd(),
      env: { PATH: process.env.PATH, DATABASE_URL: `file:${filename}` } as unknown as NodeJS.ProcessEnv,
      stdio: 'pipe',
    }),
  )
  const minted = admitActual('16h:other-factory', () => createProviderSourcePrismaClient(`file:${filename}`))
  admission.keepActual('16h:other-client', minted.client)
  const database = afterActual('16h:other-ready', await admitActual('16h:other-ready', () => minted.ready))
  afterActual(
    '16h:other-full-close',
    await admitActual('16h:other-full-close', () => disposeProviderSourceDatabase(database)),
  )
  const closed = admitActual('16h:other-closed-evidence', () => assertFixtureDatabaseClosed(database))
  event('16h:other-client-known-closed-before-original-mint', { filename, closed })
  return minted.client
}

function complementSnapshot(fixture: OriginalFixture) {
  assertFixtureActive('16h:resource-snapshot')
  return {
    source: admitActual('16h:actual-source-snapshot', () => fixture.source.snapshot()),
    database: admitActual('16h:actual-database-snapshot', () => providerSourceDatabaseSnapshot(fixture.database)),
  }
}

function assertExactComplementReplay(actual: ReconciledOriginal, expected: ReconciledOriginal) {
  assertFixtureActive('16h:exact-existing-result')
  assert.equal(actual.replayed, true)
  assert.deepEqual({ ...actual, replayed: false }, { ...expected, replayed: false })
  assert.ok(actual.observation.reconciliationJson)
  assert.deepEqual(JSON.parse(actual.observation.reconciliationJson), actual.receipt)
}

function captureComplementCanonical(fixture: OriginalFixture, sealed: SealedOriginal, tx: Prisma.TransactionClient) {
  return captureServiceComplementCanonical(fixture, sealed, tx, admission, expectedFixture, canonicalContractJson)
}

async function refuseComplementOperation(label: string, start: () => Promise<unknown>) {
  assertFixtureActive(label)
  const operation = admitActual(label, start)
  try {
    afterActual(label, await operation)
  } catch (error) {
    admission.keepActual(`${label}:actual-rejection`, error)
    assertFixtureActive(`${label}:expected-rejection`)
    return error
  }
  throw new Error(`Expected genuine refusal: ${label}`)
}

async function replayComplementA(fixture: OriginalFixture, sealed: SealedOriginal, result: ReconciledOriginal) {
  assertFixtureActive('16h:replay-original-A')
  const replay = afterActual(
    '16h:replay-A',
    await admitActual('16h:replay-A', () =>
      reconcile(sealed.input, fixture.source.context, trustedProviderReconciliation, fixture.client),
    ),
  )
  assertExactComplementReplay(replay, result)
  const hashOnly = afterActual(
    '16h:hash-only-A',
    await admitActual('16h:hash-only-A', () =>
      reconcile(
        {
          intentId: sealed.input.intentId,
          observationKey: sealed.input.observationKey,
          replayRequestHash: sealed.requestHash,
        },
        unavailableNativeProviderReconciliation,
        trustedProviderReconciliation,
        fixture.client,
      ),
    ),
  )
  assertExactComplementReplay(hashOnly, result)
}

async function runWrongOriginalClient(
  fixture: OriginalFixture,
  sealed: SealedOriginal,
  wrong: PrismaClient,
  trace: ComplementTrace,
) {
  assertFixtureActive('16h:wrong-clients')
  let traps = 0
  const getter = Object.defineProperty({}, '$transaction', {
    get() {
      traps++
      throw new Error('Unexpected client getter')
    },
  })
  const proxy = new Proxy(
    {},
    {
      get() {
        traps++
        throw new Error('Unexpected client property')
      },
      getPrototypeOf() {
        traps++
        throw new Error('Unexpected client prototype')
      },
    },
  )
  const baseline = complementSnapshot(fixture),
    counts = trace.counts()
  for (const candidate of [wrong, {}, getter, proxy]) {
    assertFixtureActive('16h:next-wrong-client')
    const refusal = afterActual(
      '16h:runWrongOriginalClient:await-1',
      await admitActual('16h:runWrongOriginalClient:await-1:operation', () =>
        refuseComplementOperation('16h:wrong-client-refusal', () =>
          reconcile(sealed.input, fixture.source.context, trustedProviderReconciliation, candidate as PrismaClient),
        ),
      ),
    )
    assertFixtureActive('16h:wrong-client-continuation')
    if (candidate === wrong) {
      assert.ok(refusal instanceof OutcomeSourceUnknownError)
      assert.equal(refusal.reason, 'source_database_binding')
    } else {
      assert.ok(refusal instanceof Error)
      assert.equal(refusal.name, 'ProviderSourceDatabaseError')
      assert.equal(refusal.message, 'source_database_binding')
    }
    assert.equal(traps, 0)
    assert.deepEqual(trace.counts(), counts)
    assert.deepEqual(complementSnapshot(fixture), baseline)
  }
  event('16h:wrong-client-refusals', {
    genuineClosedClient: true,
    structuralCandidates: 3,
    traps,
    persistenceCountsUnchanged: true,
  })
}

async function runDisposedWriterComplement(
  fixture: OriginalFixture,
  sealed: SealedOriginal,
  result: ReconciledOriginal,
  trace: ComplementTrace,
) {
  assertFixtureActive('16h:dispose-and-canonical-only-close')
  admitActual('16h:dispose-original', () => disposeOriginalSource(fixture.source))
  afterActual('16h:canonical-close', await admitActual('16h:canonical-close', () => fixture.client.$disconnect()))
  const baseline = complementSnapshot(fixture),
    counts = trace.counts()
  assert.equal(baseline.source.disposed, true)
  assert.equal(baseline.source.resources.keyNonzeroBytes, 0)
  assert.deepEqual(baseline.database.canonical.layers, {
    client: 'FULFILLED',
    engine: 'FULFILLED',
    native: 'FULFILLED',
  })
  assert.equal(baseline.database.canonical.stopCalls, 1)
  assert.equal(baseline.database.canonical.nativeCalls, 1)
  assert.deepEqual(baseline.database.resolver.layers, {
    client: 'UNREQUESTED',
    engine: 'UNREQUESTED',
    native: 'UNREQUESTED',
  })
  admitActual('16h:successor-factory-refusal', () =>
    assert.throws(
      () =>
        admitActual('16h:successor-factory-attempt', () => createProviderSourcePrismaClient(`file:${databasePath}`)),
      error =>
        error instanceof Error &&
        error.name === 'ProviderSourceDatabaseError' &&
        error.message === 'source_custody_slot_unavailable',
    ),
  )
  assertFixtureActive('16h:successor-factory-refusal-continuation')
  afterActual(
    '16h:runDisposedWriterComplement:await-2',
    await admitActual('16h:runDisposedWriterComplement:await-2:operation', () =>
      replayComplementA(fixture, sealed, result),
    ),
  )
  assertFixtureActive('16h:disposed-replay-continuation')
  assert.deepEqual(complementSnapshot(fixture), baseline)
  assert.deepEqual(trace.counts().canonical, counts.canonical)
  event('16h:disposed-original-replay-after-canonical-close', {
    before: baseline,
    after: complementSnapshot(fixture),
    result,
    counts: trace.counts(),
  })
}

async function runOtherKeyRetirement(
  fixture: OriginalFixture,
  sealed: SealedOriginal,
  result: ReconciledOriginal,
  trace: ComplementTrace,
) {
  assertFixtureActive('16h:B-fresh-reconcile')
  const keyB = 'other-key-B',
    hashB = providerReconciliationRequestHash(sealed.input.intentId, keyB, sealed.receipt)
  let callbackEntries = 0,
    outerRejected = false
  let outerFailure: unknown
  const barriersBefore = trace.counts().barriers
  const restore = admitActual('16h:B-observe-outer', () =>
    wrapTransaction(fixture.client, (callback, original) => {
      assertFixtureActive('16h:B-actual-outer-entry')
      const outer = admitActual('16h:B-actual-outer', () =>
        original(tx => {
          assertFixtureActive('16h:B-actual-callback-entry')
          callbackEntries++
          return admitActual('16h:B-product-callback', () => callback(tx))
        }),
      )
      admission.keepActual(
        '16h:B-actual-outer-observer',
        outer.then(
          value => {
            admission.keepActual('16h:B-unexpected-outer-fulfillment', value)
            retain(new Error('B original outer unexpectedly fulfilled'))
          },
          error => {
            admission.keepActual('16h:B-actual-outer-rejection', error)
            try {
              assertFixtureActive('16h:B-outer-rejected')
              outerFailure = error
              outerRejected = true
            } catch (failure) {
              retain(failure)
            }
          },
        ),
      )
      return outer
    }),
  )
  const refusal = afterActual(
    '16h:runOtherKeyRetirement:await-3',
    await admitActual('16h:runOtherKeyRetirement:await-3:operation', () =>
      refuseComplementOperation('16h:B-service-refusal', () =>
        reconcile(
          { ...sealed.input, observationKey: keyB },
          fixture.source.context,
          trustedProviderReconciliation,
          fixture.client,
        ),
      ),
    ),
  )
  assertFixtureActive('16h:B-rejected-continuation')
  assert.equal(outerRejected, true)
  assert.equal(refusal, outerFailure)
  assert.ok(refusal instanceof ServiceError)
  assert.equal(refusal.code, 'CONFLICT')
  assert.equal(refusal.message, 'Original source outcome custody is no longer current.')
  const barrierEntries = trace.counts().barriers - barriersBefore
  assert.equal(callbackEntries, 1)
  assert.equal(barrierEntries, 1)
  admission.keepActual('16h:B-retained-restore-not-called', restore)
  admitActual('16h:B-deferred-dispose', () => fixture.source.dispose())
  const baseline = assertComplementHeldBaseline(complementSnapshot(fixture))
  const resourceBaseline = originalSourceResources(baseline.source)
  const persistenceBaseline = trace.counts()
  afterActual(
    '16h:runOtherKeyRetirement:await-4',
    await admitActual('16h:runOtherKeyRetirement:await-4:operation', () => replayComplementA(fixture, sealed, result)),
  )
  assertFixtureActive('16h:B-after-A-replay')
  for (const probe of [
    { observationKey: keyB, replayRequestHash: hashB },
    { observationKey: keyB, replayRequestHash: sealed.requestHash },
    { observationKey: sealed.input.observationKey, replayRequestHash: hashB },
  ]) {
    afterActual(
      '16h:runOtherKeyRetirement:await-5',
      await admitActual('16h:runOtherKeyRetirement:await-5:operation', () =>
        refuseComplementOperation('16h:B-negative-existing-read', () =>
          reconcile(
            { intentId: sealed.input.intentId, ...probe },
            unavailableNativeProviderReconciliation,
            trustedProviderReconciliation,
            fixture.client,
          ),
        ),
      ),
    )
    assertFixtureActive('16h:B-negative-continuation')
  }
  assert.deepEqual(complementSnapshot(fixture), baseline)
  assert.deepEqual(trace.counts().canonical, persistenceBaseline.canonical)
  assert.deepEqual(
    originalSourceResources(admitActual('16h:B-final-source-snapshot', () => fixture.source.snapshot())),
    resourceBaseline,
  )
  complementRetention = {
    classification: 'KNOWN_COMMITTED_OTHER_REQUEST_RETIRED',
    canonicalOutcome: 'KNOWN_COMMITTED',
    retainedOperation: 'RECONCILE_B_FIRST_BARRIER_REJECTED',
    keyB,
    hashB,
    callbackEntries,
    barrierEntries,
    outerRejected,
    baseline,
    persistenceBaseline,
    persistence: trace.counts(),
  }
  retired = true
}

async function runEncodingHoleRetirement(
  fixture: OriginalFixture,
  sealed: SealedOriginal,
  result: ReconciledOriginal,
  trace: ComplementTrace,
) {
  assertFixtureActive('16h:sealed-encoding-hole')
  const before = complementSnapshot(fixture),
    counts = trace.counts()
  assert.equal(before.source.held, false)
  let probeCalls = 0
  const refusal = afterActual(
    '16h:runEncodingHoleRetirement:await-6',
    await admitActual('16h:runEncodingHoleRetirement:await-6:operation', () =>
      refuseComplementOperation('16h:actual-observeEncodingHole', () => {
        probeCalls++
        return fixture.source.observeEncodingHole()
      }),
    ),
  )
  assertFixtureActive('16h:encoding-hole-rejected')
  assert.ok(refusal instanceof OutcomeSourceUnknownError)
  assert.equal(refusal.reason, 'discard_window_refused')
  assert.equal(probeCalls, 1)
  assert.deepEqual(trace.counts(), counts)
  const baseline = assertComplementHeldBaseline(complementSnapshot(fixture))
  assert.deepEqual(originalSourceResources(baseline.source), originalSourceResources(before.source))
  afterActual(
    '16h:runEncodingHoleRetirement:await-7',
    await admitActual('16h:runEncodingHoleRetirement:await-7:operation', () =>
      replayComplementA(fixture, sealed, result),
    ),
  )
  assertFixtureActive('16h:encoding-hole-after-A-replay')
  assert.deepEqual(complementSnapshot(fixture), baseline)
  assert.deepEqual(trace.counts().canonical, counts.canonical)
  complementRetention = {
    classification: 'KNOWN_COMMITTED_UNRELATED_PRE_SQL_RETIRED',
    canonicalOutcome: 'KNOWN_COMMITTED',
    retainedOperation: 'PRE_SQL_REFUSAL_WITH_ACTUAL_SOURCE_HOLD',
    publicMethod: 'observeEncodingHole',
    probeCalls,
    newPersistenceEntries: 0,
    baseline,
  }
  retired = true
}

async function runCleanupThrowComplement(fixture: OriginalFixture, sealed: SealedOriginal, trace: ComplementTrace) {
  assertFixtureActive('16h:retired-cleanup-sequence')
  const before = originalSourceResources(
    admitActual('16h:cleanup-initial-source-snapshot', () => fixture.source.snapshot()),
  )
  admitActual('16h:arm-cleanup-wrapper', () => trace.armCleanup(before))
  const controlledReply = admission.keepActual(
    '16h:hidden-committed-reply',
    new Error('CONTROLLED_HIDE_RECONCILE_COMMITTED_REPLY'),
  )
  let outerFulfilled = false,
    disconnect: Promise<void> | undefined,
    cleanupRejection: unknown
  let canonicalInTransaction: Awaited<ReturnType<typeof captureComplementCanonical>> | undefined
  let heldWindow: ReturnType<typeof complementSnapshot> | undefined
  const restore = admitActual('16h:install-lost-reply-wrapper', () =>
    wrapTransaction(fixture.client, async (callback, original) => {
      assertFixtureActive('16h:cleanup-outer-entry')
      const actualOuter = admitActual('16h:cleanup-actual-engine-outer', () =>
        original(async tx => {
          assertFixtureActive('16h:cleanup-callback-entry')
          const value = afterActual(
            '16h:cleanup-product-callback',
            await admitActual('16h:cleanup-product-callback', () => callback(tx)),
          )
          canonicalInTransaction = afterActual(
            '16h:in-transaction-canonical',
            await admitActual('16h:in-transaction-canonical', () => captureComplementCanonical(fixture, sealed, tx)),
          )
          admitActual('16h:dispose-under-reconcile-hold', () => fixture.source.dispose())
          disconnect = admitActual('16h:queued-canonical-disconnect', () => fixture.client.$disconnect())
          admission.keepActual(
            '16h:cleanup-both-branch-observer',
            disconnect.then(
              value => {
                admission.keepActual('16h:cleanup-fulfillment', value)
                retain(new Error('Expected controlled cleanup rejection; actual cleanup fulfilled'))
              },
              error => {
                admission.keepActual('16h:actual-cleanup-rejection', error)
                try {
                  assertFixtureActive('16h:cleanup-rejection-observed')
                  cleanupRejection = error
                } catch (failure) {
                  retain(failure)
                }
              },
            ),
          )
          afterActual(
            '16h:held-contender-BUSY',
            await admitActual('16h:held-contender-BUSY', () =>
              fixture.contender.probe(fixture.f.binding.journeyId, fixture.sourceId, true),
            ),
          )
          const held = complementSnapshot(fixture)
          heldWindow = held
          assert.equal(held.database.held, true)
          assert.equal(held.source.disposed, false)
          assert.deepEqual(originalSourceResources(held.source), before)
          assertClientDestructionStable(fixture.clientDestructionBaseline, held.database)
          return value
        }),
      )
      afterActual('16h:actual-outer-fulfilled', await actualOuter)
      outerFulfilled = true
      event('16h:actual-outer-fulfilled-reply-withheld', { canonicalOutcome: 'KNOWN_COMMITTED' })
      throw controlledReply
    }),
  )
  const result = afterActual(
    '16h:automatic-pinned-positive',
    await admitActual('16h:automatic-pinned-positive', () =>
      reconcile(sealed.input, fixture.source.context, trustedProviderReconciliation, fixture.client),
    ),
  )
  assert.equal(outerFulfilled, true)
  assert.equal(result.replayed, true)
  assert.equal(result.requestHash, sealed.requestHash)
  assert.deepEqual(result.receipt, sealed.receipt)
  assert.deepEqual(result.observation, canonicalInTransaction!.observations[0])
  assert.ok(disconnect)
  afterActual(
    '16h:runCleanupThrowComplement:await-8',
    await admitActual('16h:runCleanupThrowComplement:await-8:operation', () =>
      refuseComplementOperation('16h:actual-cleanup-rejected', () => disconnect!),
    ),
  )
  assertFixtureActive('16h:cleanup-terminal-evidence')
  const evidence = trace.cleanupEvidence()
  assert.equal(cleanupRejection, evidence.cleanupError)
  assert.equal(evidence.controlledCalls, 1)
  const baseline = complementSnapshot(fixture)
  assert.equal(baseline.source.disposed, true)
  assert.equal(baseline.source.held, false)
  assert.equal(baseline.source.retired, false)
  assert.equal(baseline.database.held, false)
  assert.equal(baseline.database.retired, true)
  assert.equal(baseline.database.finalCloseRequested, false)
  assertEligibleSourceDestruction(before, originalSourceResources(baseline.source))
  assert.deepEqual(baseline.database.canonical.layers, {
    client: 'REJECTED',
    engine: 'UNREQUESTED',
    native: 'UNREQUESTED',
  })
  assert.equal(baseline.database.canonical.stopCalls, 0)
  assert.equal(baseline.database.canonical.nativeCalls, 0)
  assert.deepEqual(baseline.database.resolver.layers, {
    client: 'UNREQUESTED',
    engine: 'UNREQUESTED',
    native: 'UNREQUESTED',
  })
  assert.equal(baseline.database.resolver.closeRequested, false)
  assert.equal(baseline.database.resolver.stopCalls, 0)
  assert.equal(baseline.database.resolver.nativeCalls, 0)
  admission.keepActual('16h:retained-wrapper-restore-not-called', restore)
  complementRetention = {
    classification: 'KNOWN_COMMITTED_CLEANUP_RETIRED_UNKNOWN',
    canonicalOutcome: 'KNOWN_COMMITTED',
    cleanupOutcome: 'RETIRED_UNKNOWN_CONTROLLED_JS_CLIENT_THROW',
    resolverCleanup: 'UNREQUESTED',
    outerFulfilled,
    canonicalInTransaction,
    heldWindow,
    sourceAtClientAction: evidence.sourceAtCleanup,
    result,
    baseline,
    controlledCleanupCalls: evidence.controlledCalls,
  }
  retired = true
}

async function runComplement(fixture: OriginalFixture, trace: ComplementTrace, wrong?: PrismaClient) {
  assertFixtureActive('16h:complement-entry')
  const sealed = afterActual('16h:seal', await admitActual('16h:seal', () => sealOriginalProof(fixture)))
  const occupied = afterActual('16h:sealed-state', await admitActual('16h:sealed-state', () => fixture.row()))
  writeExpectation({
    occupiedSource: scalarState(occupied),
    receipt: sealed.receipt,
    requestHash: sealed.requestHash,
    phase: 'SEALED_BEFORE_RECONCILIATION',
  })
  if (name === 'wrong-original-client') {
    assert.ok(wrong)
    afterActual(
      '16h:wrong-client-case',
      await admitActual('16h:wrong-client-case', () => runWrongOriginalClient(fixture, sealed, wrong, trace)),
    )
  }
  if (name === 'retired-release-sync-cleanup-throw')
    return admitActual('16h:cleanup-throw-case', () => runCleanupThrowComplement(fixture, sealed, trace))
  const result = afterActual(
    '16h:fresh-A',
    await admitActual('16h:fresh-A', () =>
      reconcile(sealed.input, fixture.source.context, trustedProviderReconciliation, fixture.client),
    ),
  )
  assert.equal(result.replayed, false)
  assert.deepEqual(result.receipt, sealed.receipt)
  const canonical = afterActual(
    '16h:pre-retirement-canonical',
    await admitActual('16h:pre-retirement-canonical', () =>
      captureComplementCanonical(fixture, sealed, fixture.client),
    ),
  )
  writeExpectation({ phase: 'KNOWN_COMMITTED_COMPLEMENT_NO_POSTCOMMIT_CONTROLS', complementCanonical: canonical })
  return dispatchServiceComplementAfterCommit(name, {
    disposed: () => admitActual('16h:disposed-case', () => runDisposedWriterComplement(fixture, sealed, result, trace)),
    otherKey: () => admitActual('16h:B-case', () => runOtherKeyRetirement(fixture, sealed, result, trace)),
    encodingHole: () =>
      admitActual('16h:encoding-hole-case', () => runEncodingHoleRetirement(fixture, sealed, result, trace)),
  })
}

function enterIpcFaultWindow(
  callback: unknown,
  callbackValue: unknown,
  outerScope: Readonly<{ callback: unknown; outer: Promise<unknown> }> | undefined,
  client: PrismaClient,
  source: Source,
  restore: unknown,
): Promise<unknown> {
  return enterServiceIpcFaultWindow(
    admission,
    ipcWindowState,
    { case: name, pid: process.pid, nonce },
    workspace,
    eventFile,
    process,
    () => ++sequence,
    retain,
    callback,
    callbackValue,
    outerScope,
    client,
    source,
    restore,
  )
}

function recordIpcFaultFence(error: unknown): void {
  const frame = ipcWindowState.frame
  if (!frame) return
  try {
    const first = admission.unexpectedFailure
    assert.ok(first)
    assert.equal(first.error, error)
    assert.equal(first.phase, 'supervisor-disconnect')
    assert.equal(first.operationPhase, frame.window.phase)
    const admissionCount = admission.referenceSummary().operations
    assert.equal(admissionCount, frame.window.admissionCount)
    const held = admission.diagnostics().operationReferences
    for (const role of ['callback', 'client', 'gate', 'outer', 'restore', 'source'] as const) {
      const actual: Readonly<{ id: number; label: string; value: unknown }> | undefined = held.find(
        record => record.id === frame.window.referenceIds[role],
      )
      assert.ok(actual)
      assert.equal(actual.value, frame.references[role])
    }
    const fence = admission.keepActual('ipc-fault-failure-only-fence', {
      version: 1,
      type: 'ipc-fault-fenced',
      case: name,
      pid: process.pid,
      nonce,
      windowId: frame.window.windowId,
      site: 'POST_CALLBACK_SOURCE_STATE_READ',
      firstCauseIdentityPreserved: first.error === error,
      failurePhase: first.phase,
      admissionCount,
      referenceIds: frame.window.referenceIds,
    })
    publishIpcFaultArtifact(workspace, 'ipc-fault-fence.json', fence)
  } catch (failure) {
    rememberRetentionFailure(failure)
  }
}

async function performOriginalSend(fixture: OriginalFixture) {
  assertFixtureActive('custody-service-owner.ts:446:1:entry')
  const { client, f, permit, source, row } = fixture
  const beforeOwnership = afterActual(
    'custody-service-owner.ts:448:28:await',
    await admitActual('custody-service-owner.ts:448:28:await-operation', () =>
      admitActual('custody-service-owner.ts:448:34:operation', () =>
        client.qualityJourney.findUniqueOrThrow({ where: { id: f.binding.journeyId } }),
      ),
    ),
  ).ownershipVersion
  const sendWindow: ServiceSendWindowState = {
    actualSendWindow: false,
    faultTransportReturned: false,
    faultTransportConsumed: false,
    faultOuterScope: undefined,
    faultRestore: undefined,
  }
  function retainFaultTransportReturn<T>(actual: T): T {
    admission.keepActual('ipc-fault-original-transport-return', actual)
    try {
      assertFixtureActive('ipc-fault-original-transport-return')
      assert.equal(sendWindow.faultTransportReturned, false)
      sendWindow.faultTransportReturned = true
      return actual
    } catch (error) {
      admission.fail(error, 'ipc-fault-transport-marker')
      throw error
    }
  }
  function retainFaultOriginalOuter(callback: unknown, outer: Promise<unknown>): Promise<unknown> {
    admission.keepActual('ipc-fault-original-product-callback', callback)
    admission.keepActual('ipc-fault-original-engine-outer', outer)
    try {
      sendWindow.faultOuterScope = admission.keepActual(
        'ipc-fault-original-outer-callback-binding',
        Object.freeze({ callback, outer }),
      )
      return outer
    } catch (error) {
      admission.fail(error, 'ipc-fault-original-outer-binding')
      throw error
    }
  }
  function originalSendWindowObserved(
    current: {
      ownershipVersion: number
    },
    intent: {
      sendBoundaryId: string | null
    },
  ): boolean {
    assertFixtureActive('custody-service-owner.ts:451:3:entry')
    return (
      !sendWindow.actualSendWindow &&
      current.ownershipVersion > beforeOwnership &&
      intent.sendBoundaryId === permit.sendBoundaryId
    )
  }
  function installOriginalSendWindow() {
    assertFixtureActive('custody-service-owner.ts:459:3:entry')
    return admitActual('custody-service-owner.ts:460:12:operation', () =>
      wrapTransaction(
        client,
        async (callback, original) => (
          assertFixtureActive('custody-service-owner.ts:460:36:entry'),
          admitActual('custody-service-owner.ts:461:7:operation', () =>
            (ipcFaultCase
              ? (actual: Promise<unknown>) => retainFaultOriginalOuter(callback, actual)
              : (actual: Promise<unknown>) => actual)(
              original(
                createServiceOriginalSendCallback({
                  admission,
                  fixture,
                  name,
                  callback,
                  ipcFaultCase,
                  sendWindow,
                  beforeOwnership,
                  enterIpcFaultWindow,
                  recordIpcFaultFence,
                  originalSendWindowObserved,
                  event,
                  writeExpectation,
                  scalarState,
                  crash,
                }),
              ),
            ),
          )
        ),
      ),
    )
  }
  const restore = admitActual('custody-service-owner.ts:487:19:operation', () => installOriginalSendWindow())
  if (ipcFaultCase) sendWindow.faultRestore = admission.keepActual('ipc-fault-original-restore', restore)
  const sendOperation = admitActual('custody-service-owner.ts:488:25:operation', () =>
    write(
      { ...f.binding, permit, consume: true },
      () => (
        assertFixtureActive('custody-service-owner.ts:490:5:entry'),
        admitActual('custody-service-owner.ts:490:11:operation', () =>
          ipcFaultCase
            ? retainFaultTransportReturn(source.transport.request('turn/start', {}))
            : source.transport.request('turn/start', {}),
        )
      ),
      client,
    ),
  )
  retained.push(sendOperation)
  try {
    const result = afterActual(
      'custody-service-owner.ts:495:20:await',
      await admitActual('custody-service-owner.ts:495:20:await-operation', () => sendOperation),
    )
    afterActual(
      'custody-service-owner.ts:496:5:await',
      await admitActual('custody-service-owner.ts:496:5:await-operation', () =>
        admitActual('custody-service-owner.ts:496:11:operation', () => assert.rejects(result.reply)),
      ),
    )
  } finally {
    assertFixtureActive('custody-service-owner.ts:497:13:finally')
    admitActual('custody-service-owner.ts:498:5:operation', () => restore())
  }
  admitActual('custody-service-owner.ts:500:3:operation', () => assert.equal(sendWindow.actualSendWindow, true))
  afterActual(
    'custody-service-owner.ts:501:3:operation',
    (assertFixtureActive('custody-service-owner.ts:501:3:operation'),
    assert.equal(
      afterActual(
        'custody-service-owner.ts:501:17:await',
        await admitActual('custody-service-owner.ts:501:17:await-operation', () =>
          admitActual('custody-service-owner.ts:501:23:operation', () => row()),
        ),
      ).pendingBatchId,
      null,
    )),
  )
  afterActual(
    'custody-service-owner.ts:502:3:operation',
    (assertFixtureActive('custody-service-owner.ts:502:3:operation'),
    assert.equal(
      afterActual(
        'custody-service-owner.ts:503:6:await',
        await admitActual('custody-service-owner.ts:503:6:await-operation', () =>
          admitActual('custody-service-owner.ts:503:12:operation', () =>
            client.qualityJourney.findUniqueOrThrow({ where: { id: f.binding.journeyId } }),
          ),
        ),
      ).ownershipVersion,
      beforeOwnership + 1,
    )),
  )
  afterActual(
    'custody-service-owner.ts:506:3:operation',
    (assertFixtureActive('custody-service-owner.ts:506:3:operation'),
    writeExpectation({
      occupiedSource: afterActual(
        'custody-service-owner.ts:507:21:operation',
        (assertFixtureActive('custody-service-owner.ts:507:21:operation'),
        scalarState(
          afterActual(
            'custody-service-owner.ts:507:33:await',
            await admitActual('custody-service-owner.ts:507:33:await-operation', () =>
              admitActual('custody-service-owner.ts:507:39:operation', () => row()),
            ),
          ),
        )),
      ),
      occupiedJourneyVersion: beforeOwnership + 1,
      phase: 'AFTER_FLUSH_BEFORE_RECEIPT',
    })),
  )
}
async function sealOriginalProof(fixture: OriginalFixture) {
  assertFixtureActive('custody-service-owner.ts:513:1:entry')
  const { source, permit, armed } = fixture
  afterActual(
    'custody-service-owner.ts:515:3:await',
    await admitActual('custody-service-owner.ts:515:3:await-operation', () =>
      admitActual('custody-service-owner.ts:515:9:operation', () => source.close()),
    ),
  )
  const seal = admitActual('custody-service-owner.ts:516:16:operation', () => source.transport.sealSender())
  const senderExcluded = admitActual('custody-service-owner.ts:517:26:operation', () =>
    sealConsumedProviderSender(permit, seal, { threadId: null, turnId: null }),
  )
  const physicalEvidence = afterActual(
    'custody-service-owner.ts:518:28:await',
    await admitActual('custody-service-owner.ts:518:28:await-operation', () =>
      admitActual('custody-service-owner.ts:518:34:operation', () => source.issueNonstart(senderExcluded, seal)),
    ),
  )
  const input = { intentId: armed.intent.id, observationKey: 'original-nonstart', senderExcluded, physicalEvidence }
  const receipt = admitActual('custody-service-owner.ts:520:19:operation', () =>
    validateProviderReconciliationEvidence(senderExcluded, physicalEvidence, source.context),
  )
  const requestHash = admitActual('custody-service-owner.ts:521:23:operation', () =>
    providerReconciliationRequestHash(input.intentId, input.observationKey, receipt),
  )
  return { input, receipt, requestHash }
}
async function runPausedSend(fixture: OriginalFixture) {
  assertFixtureActive('custody-service-owner.ts:525:1:entry')
  const { client, f, permit, source, contender, sourceId, database } = fixture
  afterActual(
    'custody-service-owner.ts:527:3:await',
    await admitActual('custody-service-owner.ts:527:3:await-operation', () =>
      admitActual('custody-service-owner.ts:527:9:operation', () =>
        client.qualityJourney.update({ where: { id: f.binding.journeyId }, data: { status: 'PAUSED' } }),
      ),
    ),
  )
  let calls = 0
  const baselineResources = admitActual('custody-service-owner.ts:529:29:operation', () =>
    originalSourceResources(admitActual('custody-service-owner.ts:529:53:operation', () => source.snapshot())),
  )
  admitActual('custody-service-owner.ts:530:3:operation', () =>
    event('original-resource-baseline', {
      diagnostics: baselineResources,
      clients: admitActual('custody-service-owner.ts:532:14:operation', () => providerSourceDatabaseSnapshot(database)),
    }),
  )
  const operation = admitActual('custody-service-owner.ts:534:21:operation', () =>
    write(
      { ...f.binding, permit, consume: true },
      () => {
        assertFixtureActive('custody-service-owner.ts:536:5:entry')
        calls += 1
        return admitActual('custody-service-owner.ts:538:14:operation', () =>
          source.transport.request('turn/start', {}),
        )
      },
      client,
    ),
  )
  retained.push(operation)
  afterActual(
    'custody-service-owner.ts:543:3:await',
    await admitActual('custody-service-owner.ts:543:3:await-operation', () =>
      admitActual('custody-service-owner.ts:543:9:operation', () => assert.rejects(operation)),
    ),
  )
  admitActual('custody-service-owner.ts:544:3:operation', () => assert.equal(calls, 0))
  afterActual(
    'custody-service-owner.ts:545:3:operation',
    (assertFixtureActive('custody-service-owner.ts:545:3:operation'),
    assert.ok(
      (
        afterActual(
          'custody-service-owner.ts:545:15:await',
          await admitActual('custody-service-owner.ts:545:15:await-operation', () =>
            admitActual('custody-service-owner.ts:545:21:operation', () => contender.request('snapshot', { sourceId })),
          ),
        ).state as {
          pendingBatchId: unknown
        }
      ).pendingBatchId,
    )),
  )
  admitActual('custody-service-owner.ts:546:3:operation', () => source.dispose())
  admitActual('custody-service-owner.ts:547:3:operation', () => assertRetained(source, baselineResources))
  retired = true
}
function assertActivationUnrequestedDatabase(
  actual: ReturnType<typeof providerSourceDatabaseSnapshot>,
  baseline: ReturnType<typeof providerSourceDatabaseSnapshot>,
  held: boolean,
) {
  assertFixtureActive('16r:activation-database-retention')
  assert.equal(actual.held, held)
  assert.equal(actual.retired, held)
  assert.equal(actual.cleanupPending, false)
  assert.equal(actual.finalCloseRequested, false)
  assert.equal(actual.lookupPending, false)
  assertClientDestructionStable(baseline, actual)
  assert.deepEqual(actual.library, baseline.library)
  for (const mint of [actual.canonical, actual.resolver]) {
    assert.equal(mint.closeRequested, false)
    assert.equal(mint.cleanupAdmitted, false)
    assert.deepEqual(mint.layers, { client: 'UNREQUESTED', engine: 'UNREQUESTED', native: 'UNREQUESTED' })
    assert.equal(mint.holds > 0, held)
  }
}
async function runActivationRefusal(fixture: OriginalFixture) {
  assertFixtureActive('custody-service-owner.ts:551:1:entry')
  const { source, slot, client, database, armed, permit, sourceId } = fixture
  let activationError: OutcomeSourceUnknownError | undefined
  let closeError: OutcomeSourceUnknownError | undefined
  admitActual('custody-service-owner.ts:553:3:operation', () =>
    assert.throws(
      () => (
        assertFixtureActive('custody-service-owner.ts:553:17:entry'),
        admitActual('custody-service-owner.ts:553:23:operation', () => source.reserveActivation('network'))
      ),
      (error: unknown) => {
        admission.keepActual('16r:actual-activation-error', error)
        assertFixtureActive('16r:expected-activation-refusal')
        assert.ok(error instanceof OutcomeSourceUnknownError)
        assert.equal(error.constructor, OutcomeSourceUnknownError)
        assert.equal(error.reason, 'source_observation_admission_closed')
        activationError = error
        return true
      },
    ),
  )
  const baseline = admitActual('16r:post-activation-baseline', () => source.snapshot())
  const baselineResources = admitActual('16r:post-activation-resources', () => originalSourceResources(baseline))
  const databaseBaseline = admitActual('16r:post-activation-database', () => providerSourceDatabaseSnapshot(database))
  admitActual('16r:post-activation-state', () => {
    assert.equal(baseline.state, 'UNKNOWN')
    assert.equal(baseline.held, false)
    assert.equal(baseline.retired, false)
    assert.equal(baseline.disposed, false)
    assert.equal(baseline.disposeRequested, false)
    assert.equal(baselineResources.custody.mayHaveActivated, true)
    assert.equal(baselineResources.source.keyByteLength, 32)
    assert.ok(baselineResources.source.keyNonzeroBytes > 0)
    assert.equal(baselineResources.source.receiptEncodedBytes, 0)
    assert.equal(baselineResources.source.journalOpen, true)
    for (const field of [
      'issuedProofPresent',
      'issuedExclusionPresent',
      'liveProofContainsIssued',
      'issuedProofMatchesOriginal',
      'issuedExclusionMatchesOriginal',
      'replayTombstoneContainsOriginal',
    ] as const)
      assert.equal(baselineResources.source[field], false)
    assertActivationUnrequestedDatabase(databaseBaseline, databaseBaseline, false)
  })
  // This is the actual public proof-helper Promise, not the private rejected journal reservation Promise.
  const proofAttempt = admitActual('16r:actual-proof-helper-promise', () => sealOriginalProof(fixture))
  afterActual(
    'custody-service-owner.ts:554:3:await',
    await admitActual('custody-service-owner.ts:554:3:await-operation', () =>
      admitActual('custody-service-owner.ts:554:9:operation', () =>
        assert.rejects(proofAttempt, (error: unknown) => {
          admission.keepActual('16r:actual-close-error', error)
          assertFixtureActive('16r:expected-close-refusal')
          assert.ok(error instanceof OutcomeSourceUnknownError)
          assert.equal(error.constructor, OutcomeSourceUnknownError)
          assert.equal(error.reason, 'journal_unavailable')
          closeError = error
          return true
        }),
      ),
    ),
  )
  const afterClose = admitActual('16r:after-close-source', () => source.snapshot())
  const databaseAfterClose = admitActual('16r:after-close-database', () => providerSourceDatabaseSnapshot(database))
  admitActual('16r:after-close-retention', () => {
    assert.equal(afterClose.state, 'UNKNOWN')
    assert.equal(afterClose.held, true)
    assert.equal(afterClose.retired, true)
    assert.equal(afterClose.disposed, false)
    assert.equal(afterClose.disposeRequested, false)
    assert.deepEqual(originalSourceResources(afterClose), baselineResources)
    assertActivationUnrequestedDatabase(databaseAfterClose, databaseBaseline, true)
  })
  admitActual('16r:single-source-dispose-request', () => source.dispose())
  admitActual('16r:source-retained-after-dispose', () => assertRetained(source, baselineResources))
  const afterDispose = admitActual('16r:after-dispose-source', () => source.snapshot())
  const databaseAfterDispose = admitActual('16r:after-dispose-database', () => providerSourceDatabaseSnapshot(database))
  admitActual('16r:after-dispose-retention', () => {
    assert.equal(afterDispose.state, 'UNKNOWN')
    assert.deepEqual(originalSourceResources(afterDispose), baselineResources)
    assert.deepEqual(databaseAfterDispose, databaseAfterClose)
    assertActivationUnrequestedDatabase(databaseAfterDispose, databaseBaseline, true)
  })
  const occupiedSlot = afterActual(
    'custody-service-owner.ts:555:17:await',
    await admitActual('custody-service-owner.ts:555:17:await-operation', () =>
      admitActual('custody-service-owner.ts:555:23:operation', () => slot()),
    ),
  )
  admitActual('custody-service-owner.ts:555:3:operation', () => assert.equal(occupiedSlot.version, 1))
  const observations = afterActual(
    'custody-service-owner.ts:556:16:await',
    await admitActual('custody-service-owner.ts:556:16:await-operation', () =>
      admitActual('custody-service-owner.ts:556:22:operation', () => client.qualityJourneyProviderObservation.count()),
    ),
  )
  admitActual('custody-service-owner.ts:556:3:operation', () => assert.equal(observations, 0))
  const run = afterActual(
    '16r:canonical-run',
    await admitActual('16r:canonical-run', () =>
      client.qualityJourneyProviderRun.findUniqueOrThrow({
        where: { id: armed.run.id },
        select: {
          id: true,
          journeyId: true,
          targetProjectId: true,
          providerNamespace: true,
          configurationDigest: true,
          status: true,
          turnsReserved: true,
        },
      }),
    ),
  )
  const intent = afterActual(
    '16r:canonical-intent',
    await admitActual('16r:canonical-intent', () =>
      client.qualityJourneyProviderDispatchIntent.findUniqueOrThrow({
        where: { id: permit.intentId },
        select: {
          id: true,
          providerRunId: true,
          providerNamespace: true,
          sendBoundaryId: true,
          claimEpoch: true,
          status: true,
        },
      }),
    ),
  )
  admitActual('16r:activation-terminal-evidence', () => {
    const identity = expectedFixture.identity as Message
    assert.equal(run.id, identity.runId)
    assert.equal(run.journeyId, identity.journeyId)
    assert.equal(run.targetProjectId, identity.targetProjectId)
    assert.equal(run.providerNamespace, identity.providerNamespace)
    assert.equal(run.configurationDigest, identity.configurationDigest)
    assert.equal(run.status, 'UNKNOWN')
    assert.equal(run.turnsReserved, 1)
    assert.equal(intent.id, identity.intentId)
    assert.equal(intent.providerRunId, run.id)
    assert.equal(intent.providerNamespace, identity.providerNamespace)
    assert.equal(intent.sendBoundaryId, identity.sendBoundaryId)
    assert.equal(intent.claimEpoch, identity.claimEpoch)
    assert.equal(intent.status, 'UNKNOWN')
    assert.equal(sourceId, identity.sourceId)
    assert.equal(occupiedSlot.id, 'HUB')
    assert.equal(occupiedSlot.providerRunId, run.id)
    assert.equal(occupiedSlot.intentId, intent.id)
    assert.equal(occupiedSlot.sendBoundaryId, identity.sendBoundaryId)
    assert.equal(occupiedSlot.reservedAt?.getTime(), (expectedFixture.originalTemporal as Message).reservedAt)
    assert.ok(activationError && closeError)
    const evidence = {
      version: 1,
      case: name,
      pid: process.pid,
      nonce,
      identity,
      activationReason: activationError.reason,
      closeReason: closeError.reason,
      baseline,
      afterClose,
      afterDispose,
      databaseBaseline,
      databaseAfterClose,
      databaseAfterDispose,
      canonical: {
        run,
        intent,
        slot: { ...occupiedSlot, reservedAt: fixtureDateTime(occupiedSlot.reservedAt) },
        observations,
      },
    }
    admission.keepActual('16r:activation-terminal-evidence', evidence)
    assert.ok(Buffer.byteLength(JSON.stringify(evidence)) <= 16384)
    activationRetention = evidence
  })
  assertFixtureActive('16r:select-expected-retention')
  retired = true
}
async function runSealedOutcome(fixture: OriginalFixture) {
  assertFixtureActive('custody-service-owner.ts:559:1:entry')
  const { client, database, clientDestructionBaseline, f, armed, permit, source, contender, sourceId, row, slot } =
    fixture
  const { input, receipt, requestHash } = afterActual(
    'custody-service-owner.ts:562:43:await',
    await admitActual('custody-service-owner.ts:562:43:await-operation', () =>
      admitActual('custody-service-owner.ts:562:49:operation', () => sealOriginalProof(fixture)),
    ),
  )
  afterActual(
    'custody-service-owner.ts:563:3:operation',
    (assertFixtureActive('custody-service-owner.ts:563:3:operation'),
    writeExpectation({
      occupiedSource: afterActual(
        'custody-service-owner.ts:564:21:operation',
        (assertFixtureActive('custody-service-owner.ts:564:21:operation'),
        scalarState(
          afterActual(
            'custody-service-owner.ts:564:33:await',
            await admitActual('custody-service-owner.ts:564:33:await-operation', () =>
              admitActual('custody-service-owner.ts:564:39:operation', () => row()),
            ),
          ),
        )),
      ),
      receipt,
      requestHash,
      phase: 'SEALED_BEFORE_RECONCILIATION',
    })),
  )
  const baselineResources = admitActual('custody-service-owner.ts:569:29:operation', () =>
    originalSourceResources(admitActual('custody-service-owner.ts:569:53:operation', () => source.snapshot())),
  )
  const baselineExclusion = admitActual('custody-service-owner.ts:570:29:operation', () =>
    inspectProviderSenderExcluded(input.senderExcluded),
  )
  const originalProof = input.physicalEvidence
  const originalExclusion = input.senderExcluded
  admitActual('custody-service-owner.ts:573:3:operation', () =>
    event('original-resource-baseline', {
      diagnostics: baselineResources,
      clients: admitActual('custody-service-owner.ts:575:14:operation', () => providerSourceDatabaseSnapshot(database)),
      senderEvidenceId: baselineExclusion.senderEvidenceId,
    }),
  )
  async function runPreHoldDispose() {
    assertFixtureActive('custody-service-owner.ts:579:3:entry')
    admitActual('custody-service-owner.ts:580:5:operation', () => source.dispose())
    admitActual('custody-service-owner.ts:581:5:operation', () =>
      assert.equal(admitActual('custody-service-owner.ts:581:18:operation', () => source.snapshot()).disposed, true),
    )
    admitActual('custody-service-owner.ts:582:5:operation', () =>
      assertEligibleSourceDestruction(
        baselineResources,
        admitActual('custody-service-owner.ts:582:56:operation', () =>
          originalSourceResources(admitActual('custody-service-owner.ts:582:80:operation', () => source.snapshot())),
        ),
      ),
    )
    admitActual('custody-service-owner.ts:583:5:operation', () =>
      assert.deepEqual(
        admitActual('custody-service-owner.ts:583:22:operation', () =>
          inspectProviderSenderExcluded(originalExclusion),
        ),
        baselineExclusion,
      ),
    )
    afterActual(
      'custody-service-owner.ts:584:5:await',
      await admitActual('custody-service-owner.ts:584:5:await-operation', () =>
        admitActual('custody-service-owner.ts:584:11:operation', () =>
          assert.rejects(
            admitActual('custody-service-owner.ts:584:26:operation', () =>
              reconcile(input, source.context, trustedProviderReconciliation, client),
            ),
          ),
        ),
      ),
    )
    afterActual(
      'custody-service-owner.ts:585:5:operation',
      (assertFixtureActive('custody-service-owner.ts:585:5:operation'),
      assert.equal(
        afterActual(
          'custody-service-owner.ts:585:19:await',
          await admitActual('custody-service-owner.ts:585:19:await-operation', () =>
            admitActual('custody-service-owner.ts:585:25:operation', () => slot()),
          ),
        ).version,
        1,
      )),
    )
    afterActual(
      'custody-service-owner.ts:586:5:operation',
      (assertFixtureActive('custody-service-owner.ts:586:5:operation'),
      assert.equal(
        afterActual(
          'custody-service-owner.ts:586:18:await',
          await admitActual('custody-service-owner.ts:586:18:await-operation', () =>
            admitActual('custody-service-owner.ts:586:24:operation', () =>
              client.qualityJourneyProviderObservation.count(),
            ),
          ),
        ),
        0,
      )),
    )
  }
  async function runNegativeInputs() {
    assertFixtureActive('custody-service-owner.ts:589:3:entry')
    afterActual(
      'custody-service-owner.ts:590:5:await',
      await admitActual('custody-service-owner.ts:590:5:await-operation', () =>
        admitActual('custody-service-owner.ts:590:11:operation', () =>
          assert.rejects(
            admitActual('custody-service-owner.ts:591:7:operation', () =>
              reconcile(input, unavailableNativeProviderReconciliation, trustedProviderReconciliation, client),
            ),
          ),
        ),
      ),
    )
    afterActual(
      'custody-service-owner.ts:593:5:await',
      await admitActual('custody-service-owner.ts:593:5:await-operation', () =>
        admitActual('custody-service-owner.ts:593:11:operation', () =>
          assert.rejects(
            admitActual('custody-service-owner.ts:594:7:operation', () =>
              reconcile(
                { ...input, senderExcluded: { ...input.senderExcluded } },
                source.context,
                trustedProviderReconciliation,
                client,
              ),
            ),
          ),
        ),
      ),
    )
    afterActual(
      'custody-service-owner.ts:601:5:await',
      await admitActual('custody-service-owner.ts:601:5:await-operation', () =>
        admitActual('custody-service-owner.ts:601:11:operation', () =>
          assert.rejects(
            admitActual('custody-service-owner.ts:602:7:operation', () =>
              reconcile(
                {
                  ...input,
                  physicalEvidence: admitActual('custody-service-owner.ts:603:39:operation', () =>
                    JSON.parse(
                      admitActual('custody-service-owner.ts:603:50:operation', () =>
                        JSON.stringify(input.physicalEvidence),
                      ),
                    ),
                  ),
                },
                source.context,
                trustedProviderReconciliation,
                client,
              ),
            ),
          ),
        ),
      ),
    )
    for (const candidate of [
      admitActual('custody-service-owner.ts:610:7:operation', () => Object.freeze({ ...source.context.source! })),
      admitActual('custody-service-owner.ts:611:7:operation', () =>
        Object.freeze({
          ...source.context.source!,
          inspect: () => (
            assertFixtureActive('custody-service-owner.ts:613:18:entry'),
            { ...receipt.physical, outcome: 'TERMINAL' as const }
          ),
        }),
      ),
    ])
      afterActual(
        'custody-service-owner.ts:616:7:await',
        await admitActual('custody-service-owner.ts:616:7:await-operation', () =>
          admitActual('custody-service-owner.ts:616:13:operation', () =>
            assert.rejects(
              admitActual('custody-service-owner.ts:617:9:operation', () =>
                reconcile(
                  input,
                  { selection: 'SYNTHETIC_REPOSITORY', source: candidate },
                  trustedProviderReconciliation,
                  client,
                ),
              ),
            ),
          ),
        ),
      )
    afterActual(
      'custody-service-owner.ts:624:5:operation',
      (assertFixtureActive('custody-service-owner.ts:624:5:operation'),
      assert.equal(
        afterActual(
          'custody-service-owner.ts:624:19:await',
          await admitActual('custody-service-owner.ts:624:19:await-operation', () =>
            admitActual('custody-service-owner.ts:624:25:operation', () => slot()),
          ),
        ).version,
        1,
      )),
    )
    afterActual(
      'custody-service-owner.ts:625:5:await',
      await admitActual('custody-service-owner.ts:625:5:await-operation', () =>
        admitActual('custody-service-owner.ts:625:11:operation', () =>
          reconcile(input, source.context, trustedProviderReconciliation, client),
        ),
      ),
    )
    admitActual('custody-service-owner.ts:626:5:operation', () => source.dispose())
    admitActual('custody-service-owner.ts:627:5:operation', () =>
      assertEligibleSourceDestruction(
        baselineResources,
        admitActual('custody-service-owner.ts:627:56:operation', () =>
          originalSourceResources(admitActual('custody-service-owner.ts:627:80:operation', () => source.snapshot())),
        ),
      ),
    )
    admitActual('custody-service-owner.ts:628:5:operation', () =>
      assert.deepEqual(
        admitActual('custody-service-owner.ts:628:22:operation', () =>
          inspectProviderSenderExcluded(originalExclusion),
        ),
        baselineExclusion,
      ),
    )
    for (const replay of [
      { intentId: input.intentId, observationKey: input.observationKey },
      {
        intentId: input.intentId,
        observationKey: input.observationKey,
        replayRequestHash: `sha256:${admitActual('custody-service-owner.ts:634:38:operation', () => 'f'.repeat(64))}`,
      },
      { intentId: input.intentId, observationKey: 'foreign-key', replayRequestHash: requestHash },
    ])
      afterActual(
        'custody-service-owner.ts:638:7:await',
        await admitActual('custody-service-owner.ts:638:7:await-operation', () =>
          admitActual('custody-service-owner.ts:638:13:operation', () =>
            assert.rejects(
              admitActual('custody-service-owner.ts:639:9:operation', () =>
                reconcile(replay, unavailableNativeProviderReconciliation, trustedProviderReconciliation, client),
              ),
            ),
          ),
        ),
      )
    afterActual(
      'custody-service-owner.ts:641:5:operation',
      (assertFixtureActive('custody-service-owner.ts:641:5:operation'),
      assert.equal(
        afterActual(
          'custody-service-owner.ts:641:19:await',
          await admitActual('custody-service-owner.ts:641:19:await-operation', () =>
            admitActual('custody-service-owner.ts:641:25:operation', () => slot()),
          ),
        ).version,
        2,
      )),
    )
    afterActual(
      'custody-service-owner.ts:642:5:operation',
      (assertFixtureActive('custody-service-owner.ts:642:5:operation'),
      assert.equal(
        afterActual(
          'custody-service-owner.ts:642:18:await',
          await admitActual('custody-service-owner.ts:642:18:await-operation', () =>
            admitActual('custody-service-owner.ts:642:24:operation', () =>
              client.qualityJourneyProviderObservation.count(),
            ),
          ),
        ),
        1,
      )),
    )
  }
  async function runLateAcknowledgement() {
    assertFixtureActive('custody-service-owner.ts:645:3:entry')
    const acknowledged = afterActual(
      'custody-service-owner.ts:646:26:await',
      await admitActual('custody-service-owner.ts:646:26:await-operation', () =>
        admitActual('custody-service-owner.ts:646:32:operation', () =>
          acknowledge(
            {
              intentId: input.intentId,
              sendBoundaryId: permit.sendBoundaryId,
              providerNamespace: f.prepareInput.providerNamespace,
              observationKey: 'late-ack',
              threadId: 'late-thread',
              turnId: 'late-turn',
              evidenceDigest: `sha256:${admitActual('custody-service-owner.ts:654:35:operation', () => 'a'.repeat(64))}`,
            },
            trustedProviderObservation,
            client,
          ),
        ),
      ),
    )
    admitActual('custody-service-owner.ts:659:5:operation', () =>
      writeExpectation({ acknowledgement: acknowledged.observation }),
    )
    let outerFulfilled = false
    const restore = admitActual('custody-service-owner.ts:661:21:operation', () =>
      wrapTransaction(client, async (callback, original) => {
        assertFixtureActive('custody-service-owner.ts:661:45:entry')
        const result = afterActual(
          'custody-service-owner.ts:662:22:await',
          await admitActual('custody-service-owner.ts:662:22:await-operation', () =>
            admitActual('custody-service-owner.ts:662:28:operation', () => original(callback)),
          ),
        )
        outerFulfilled = true
        return result
      }),
    )
    const operation = admitActual('custody-service-owner.ts:666:23:operation', () =>
      reconcile(input, source.context, trustedProviderReconciliation, client),
    )
    retained.push(operation)
    afterActual(
      'custody-service-owner.ts:668:5:await',
      await admitActual('custody-service-owner.ts:668:5:await-operation', () =>
        admitActual('custody-service-owner.ts:668:11:operation', () => assert.rejects(operation)),
      ),
    )
    admitActual('custody-service-owner.ts:669:5:operation', () => restore())
    admitActual('custody-service-owner.ts:670:5:operation', () => assert.equal(outerFulfilled, true))
    const actual = afterActual(
      'custody-service-owner.ts:671:20:await',
      await admitActual('custody-service-owner.ts:671:20:await-operation', () =>
        admitActual('custody-service-owner.ts:671:26:operation', () => contender.request('snapshot', { sourceId })),
      ),
    )
    admitActual('custody-service-owner.ts:672:5:operation', () =>
      assert.equal(
        (
          actual.hub as {
            version: number
          }
        ).version,
        1,
      ),
    )
    admitActual('custody-service-owner.ts:673:5:operation', () => assert.equal(actual.nonstarts, 0))
    admitActual('custody-service-owner.ts:674:5:operation', () =>
      assert.equal(
        (
          actual.state as {
            lifecycle: string
          }
        ).lifecycle,
        'REVOKED',
      ),
    )
    afterActual(
      'custody-service-owner.ts:675:5:operation',
      (assertFixtureActive('custody-service-owner.ts:675:5:operation'),
      assert.equal(
        afterActual(
          'custody-service-owner.ts:676:7:await',
          await admitActual('custody-service-owner.ts:676:7:await-operation', () =>
            admitActual('custody-service-owner.ts:676:13:operation', () =>
              client.qualityJourneyProviderObservation.count({ where: { kind: 'RECONCILIATION_CONFLICT' } }),
            ),
          ),
        ),
        1,
      )),
    )
    admitActual('custody-service-owner.ts:679:5:operation', () =>
      writeExpectation({
        occupiedSource: admitActual('custody-service-owner.ts:680:23:operation', () =>
          scalarState(actual.state as Message),
        ),
        phase: 'KNOWN_FULFILLED_LATE_ACK_CONFLICT',
      }),
    )
    admitActual('custody-service-owner.ts:683:5:operation', () =>
      event('known-fulfilled-canonical-conflict', { lifecycle: 'REVOKED', hubVersion: 1 }),
    )
    admitActual('custody-service-owner.ts:684:5:operation', () => source.dispose())
    admitActual('custody-service-owner.ts:685:5:operation', () =>
      assert.equal(admitActual('custody-service-owner.ts:685:18:operation', () => source.snapshot()).disposed, true),
    )
    admitActual('custody-service-owner.ts:686:5:operation', () =>
      assert.equal(admitActual('custody-service-owner.ts:686:18:operation', () => source.snapshot()).retired, false),
    )
    admitActual('custody-service-owner.ts:687:5:operation', () =>
      assertEligibleSourceDestruction(
        baselineResources,
        admitActual('custody-service-owner.ts:687:56:operation', () =>
          originalSourceResources(admitActual('custody-service-owner.ts:687:80:operation', () => source.snapshot())),
        ),
      ),
    )
    admitActual('custody-service-owner.ts:688:5:operation', () =>
      assert.deepEqual(
        admitActual('custody-service-owner.ts:688:22:operation', () =>
          inspectProviderSenderExcluded(originalExclusion),
        ),
        baselineExclusion,
      ),
    )
  }
  async function runUnresolvedReconciliation() {
    assertFixtureActive('custody-service-owner.ts:691:3:entry')
    if (name === 'early-revoke')
      afterActual(
        'custody-service-owner.ts:692:34:await',
        await admitActual('custody-service-owner.ts:692:34:await-operation', () =>
          admitActual('custody-service-owner.ts:692:40:operation', () => contender.request('revoke', { sourceId })),
        ),
      )
    const restore = admitActual('custody-service-owner.ts:693:21:operation', () =>
      wrapTransaction(
        client,
        async (callback, original) => (
          assertFixtureActive('custody-service-owner.ts:693:45:entry'),
          admitActual('custody-service-owner.ts:694:7:operation', () =>
            original(
              async tx => {
                assertFixtureActive('custody-service-owner.ts:695:9:entry')
                const value = afterActual(
                  'custody-service-owner.ts:696:25:await',
                  await admitActual('custody-service-owner.ts:696:25:await-operation', () =>
                    admitActual('custody-service-owner.ts:696:31:operation', () => callback(tx)),
                  ),
                )
                admitActual('custody-service-owner.ts:697:11:operation', () => source.dispose())
                if (name === 'callback-throw') throw new Error('Actual callback throw before commit')
                if (name === 'controlled-commit-rollback')
                  throw new Error('Controlled simulated commit rollback; engine closure UNPROVEN')
                if (name === 'timeout')
                  afterActual(
                    'custody-service-owner.ts:701:35:await',
                    await admitActual('custody-service-owner.ts:701:35:await-operation', () =>
                      admitActual(
                        'custody-service-owner.ts:701:41:operation',
                        () =>
                          new Promise(
                            resolve => (
                              assertFixtureActive('custody-service-owner.ts:701:53:entry'),
                              admitActual('custody-service-owner.ts:701:64:operation', () => setTimeout(resolve, 80))
                            ),
                          ),
                      ),
                    ),
                  )
                return value
              },
              { timeout: name === 'timeout' ? 30 : 5000 },
            ),
          )
        ),
      ),
    )
    const operation = admitActual('custody-service-owner.ts:707:23:operation', () =>
      reconcile(input, source.context, trustedProviderReconciliation, client),
    )
    retained.push(operation)
    afterActual(
      'custody-service-owner.ts:709:5:await',
      await admitActual('custody-service-owner.ts:709:5:await-operation', () =>
        admitActual('custody-service-owner.ts:709:11:operation', () => assert.rejects(operation)),
      ),
    )
    admitActual('custody-service-owner.ts:710:5:operation', () => restore())
    admitActual('custody-service-owner.ts:711:5:operation', () => source.dispose())
    admitActual('custody-service-owner.ts:712:5:operation', () => assertRetained(source, baselineResources))
    admitActual('custody-service-owner.ts:713:5:operation', () => assert.equal(input.physicalEvidence, originalProof))
    admitActual('custody-service-owner.ts:714:5:operation', () => assert.equal(input.senderExcluded, originalExclusion))
    admitActual('custody-service-owner.ts:715:5:operation', () =>
      assert.deepEqual(
        admitActual('custody-service-owner.ts:715:22:operation', () =>
          inspectProviderSenderExcluded(originalExclusion),
        ),
        baselineExclusion,
      ),
    )
    const before = admitActual('custody-service-owner.ts:716:20:operation', () => source.snapshot())
    admitActual('custody-service-owner.ts:717:5:operation', () => source.dispose())
    admitActual('custody-service-owner.ts:718:5:operation', () =>
      assert.deepEqual(
        admitActual('custody-service-owner.ts:718:22:operation', () => source.snapshot()),
        before,
      ),
    )
    const actual = afterActual(
      'custody-service-owner.ts:719:20:await',
      await admitActual('custody-service-owner.ts:719:20:await-operation', () =>
        admitActual('custody-service-owner.ts:719:26:operation', () => contender.request('snapshot', { sourceId })),
      ),
    )
    admitActual('custody-service-owner.ts:720:5:operation', () =>
      assert.equal(
        (
          actual.hub as {
            version: number
          }
        ).version,
        1,
      ),
    )
    admitActual('custody-service-owner.ts:721:5:operation', () => assert.equal(actual.observations, 0))
    afterActual(
      'custody-service-owner.ts:722:5:await',
      await admitActual('custody-service-owner.ts:722:5:await-operation', () =>
        admitActual('custody-service-owner.ts:722:11:operation', () =>
          assert.rejects(
            admitActual('custody-service-owner.ts:723:7:operation', () =>
              createSyntheticOutcomeCustodian({
                database,
                identity: {
                  ...permit,
                  providerNamespace: f.prepareInput.providerNamespace as `synthetic:${string}`,
                  configurationDigest: f.prepareInput.configurationDigest,
                },
              }),
            ),
            /source_custody_slot_unavailable/,
          ),
        ),
      ),
    )
    retired = true
  }
  async function runCommittedReconciliation() {
    assertFixtureActive('custody-service-owner.ts:736:3:entry')
    let lateWindow = false
    let disconnectSettled = false
    let disconnect: Promise<void> | undefined
    function handleReconciliationEngineRejection(error: unknown): Promise<never> {
      if (name === 'around-commit-death') {
        rememberRetentionFailure(error)
        return parkedForExactKill()
      }
      assertFixtureActive('actual-engine-rejection-continuation')
      throw error
    }
    function publishReconciliationReply(value: unknown): unknown {
      assertFixtureActive('custody-service-owner.ts:747:5:entry')
      if (name === 'lost-reply') throw new Error('Controlled wrapper hid actual committed reply')
      return value
    }
    function installReconciliationCommitWindow() {
      assertFixtureActive('custody-service-owner.ts:751:5:entry')
      return admitActual('custody-service-owner.ts:752:14:operation', () =>
        wrapTransaction(client, async (callback, original) => {
          assertFixtureActive('custody-service-owner.ts:752:38:entry')
          const actualEngineOperation = admitActual('custody-service-owner.ts:753:39:operation', () =>
            original(async tx => {
              assertFixtureActive('custody-service-owner.ts:753:48:entry')
              const result = afterActual(
                'custody-service-owner.ts:754:26:await',
                await admitActual('custody-service-owner.ts:754:26:await-operation', () =>
                  admitActual('custody-service-owner.ts:754:32:operation', () => callback(tx)),
                ),
              )
              if (name === 'before-commit-death')
                afterActual(
                  'custody-service-owner.ts:756:13:await',
                  await admitActual('custody-service-owner.ts:756:13:await-operation', () =>
                    admitActual('custody-service-owner.ts:756:19:operation', () =>
                      crash('RECONCILIATION_CALLBACK_AFTER_ATOMIC_MUTATIONS_BEFORE_ENGINE_RETURN'),
                    ),
                  ),
                )
              if (name === 'around-commit-death') {
                // Return this actual callback so engine commit can race the exact signal.
                admitActual('custody-service-owner.ts:759:13:operation', () =>
                  stageCrash('RECONCILIATION_CALLBACK_RETURN_TO_OUTER_FULFILLMENT_RACE'),
                )
              }
              if (admitActual('custody-service-owner.ts:761:15:operation', () => isHeldWriterWindow())) {
                admitActual('custody-service-owner.ts:762:13:operation', () => source.dispose())
                admitActual('custody-service-owner.ts:763:13:operation', () =>
                  assert.equal(
                    admitActual('custody-service-owner.ts:763:26:operation', () => source.snapshot()).disposed,
                    false,
                  ),
                )
                admitActual('custody-service-owner.ts:764:13:operation', () =>
                  assert.deepEqual(
                    admitActual('custody-service-owner.ts:764:30:operation', () =>
                      originalSourceResources(
                        admitActual('custody-service-owner.ts:764:54:operation', () => source.snapshot()),
                      ),
                    ),
                    baselineResources,
                  ),
                )
                admitActual('custody-service-owner.ts:765:13:operation', () =>
                  assert.equal(input.physicalEvidence, originalProof),
                )
                admitActual('custody-service-owner.ts:766:13:operation', () =>
                  assert.equal(input.senderExcluded, originalExclusion),
                )
                admitActual('custody-service-owner.ts:767:13:operation', () =>
                  assert.deepEqual(
                    admitActual('custody-service-owner.ts:767:30:operation', () =>
                      inspectProviderSenderExcluded(originalExclusion),
                    ),
                    baselineExclusion,
                  ),
                )
                disconnect = admitActual('custody-service-owner.ts:768:26:operation', () => client.$disconnect())
                const actualDisconnect = disconnect
                retained.push(disconnect)
                void admitActual('custody-service-owner.ts:770:18:operation', () =>
                  actualDisconnect.then(() => {
                    assertFixtureActive('custody-service-owner.ts:770:34:entry')
                    disconnectSettled = true
                  }),
                )
                afterActual(
                  'custody-service-owner.ts:773:13:await',
                  await admitActual('custody-service-owner.ts:773:13:await-operation', () =>
                    admitActual('custody-service-owner.ts:773:19:operation', () =>
                      contender.probe(f.binding.journeyId, sourceId, true),
                    ),
                  ),
                )
                admitActual('custody-service-owner.ts:774:13:operation', () => assert.equal(disconnectSettled, false))
                const resources = admitActual('custody-service-owner.ts:775:31:operation', () =>
                  providerSourceDatabaseSnapshot(database),
                )
                admitActual('custody-service-owner.ts:776:13:operation', () => assert.equal(resources.held, true))
                admitActual('custody-service-owner.ts:777:13:operation', () =>
                  assertClientDestructionStable(clientDestructionBaseline, resources),
                )
                admitActual('custody-service-owner.ts:778:13:operation', () =>
                  assert.equal(
                    admitActual('custody-service-owner.ts:778:26:operation', () => source.snapshot()).disposed,
                    false,
                  ),
                )
                admitActual('custody-service-owner.ts:779:13:operation', () =>
                  assert.deepEqual(
                    admitActual('custody-service-owner.ts:779:30:operation', () =>
                      originalSourceResources(
                        admitActual('custody-service-owner.ts:779:54:operation', () => source.snapshot()),
                      ),
                    ),
                    baselineResources,
                  ),
                )
                admitActual('custody-service-owner.ts:780:13:operation', () =>
                  assert.deepEqual(
                    admitActual('custody-service-owner.ts:780:30:operation', () =>
                      inspectProviderSenderExcluded(originalExclusion),
                    ),
                    baselineExclusion,
                  ),
                )
                admitActual('custody-service-owner.ts:781:13:operation', () =>
                  event('held-dispose-disconnect-resources', {
                    diagnostics: admitActual('custody-service-owner.ts:782:28:operation', () =>
                      originalSourceResources(
                        admitActual('custody-service-owner.ts:782:52:operation', () => source.snapshot()),
                      ),
                    ),
                    clients: resources,
                  }),
                )
                lateWindow = true
              }
              return result
            }),
          )
          retained.push(actualEngineOperation)
          let value: unknown
          try {
            value = await actualEngineOperation
          } catch (error) {
            return handleReconciliationEngineRejection(error)
          }
          // First eligible continuation: no service settlement, replay, control or cleanup after the around-commit gate.
          if (name === 'around-commit-death') return parkedForExactKill()
          assertFixtureActive('actual-engine-fulfilled-after-aroundcommit-park')
          if (name === 'after-commit-death')
            afterActual(
              'custody-service-owner.ts:798:44:await',
              await admitActual('custody-service-owner.ts:798:44:await-operation', () =>
                admitActual('custody-service-owner.ts:798:50:operation', () =>
                  crash('KNOWN_DURABLE_OUTER_FULFILLMENT_WITHHELD_REPLY'),
                ),
              ),
            )
          return admitActual('custody-service-owner.ts:799:16:operation', () => publishReconciliationReply(value))
        }),
      )
    }
    const restore = admitActual('custody-service-owner.ts:802:21:operation', () => installReconciliationCommitWindow())
    const operation = admitActual('custody-service-owner.ts:803:23:operation', () =>
      reconcile(input, source.context, trustedProviderReconciliation, client),
    )
    retained.push(operation)
    const result = afterActual(
      'custody-service-owner.ts:805:20:await',
      await admitActual('custody-service-owner.ts:805:20:await-operation', () => operation),
    )
    admitActual('custody-service-owner.ts:806:5:operation', () => restore())
    admitActual('custody-service-owner.ts:807:5:operation', () => assert.equal(result.replayed, name === 'lost-reply'))
    if (admitActual('custody-service-owner.ts:808:9:operation', () => isHeldWriterWindow())) {
      admitActual('custody-service-owner.ts:809:7:operation', () => assert.equal(lateWindow, true))
      admitActual('custody-service-owner.ts:810:7:operation', () =>
        assert.equal(admitActual('custody-service-owner.ts:810:20:operation', () => source.snapshot()).disposed, true),
      )
      const destroyed = admitActual('custody-service-owner.ts:811:25:operation', () =>
        originalSourceResources(admitActual('custody-service-owner.ts:811:49:operation', () => source.snapshot())),
      )
      admitActual('custody-service-owner.ts:812:7:operation', () =>
        assertEligibleSourceDestruction(baselineResources, destroyed),
      )
      admitActual('custody-service-owner.ts:813:7:operation', () =>
        event('known-outcome-source-destruction', { before: baselineResources, after: destroyed }),
      )
      admitActual('custody-service-owner.ts:814:7:operation', () =>
        assert.deepEqual(
          admitActual('custody-service-owner.ts:814:24:operation', () =>
            inspectProviderSenderExcluded(originalExclusion),
          ),
          baselineExclusion,
        ),
      )
      afterActual(
        'custody-service-owner.ts:815:7:await',
        await admitActual('custody-service-owner.ts:815:7:await-operation', () => disconnect),
      )
      admitActual('custody-service-owner.ts:816:7:operation', () => assert.equal(disconnectSettled, true))
    } else {
      admitActual('custody-service-owner.ts:818:7:operation', () =>
        assert.equal(
          admitActual('custody-service-owner.ts:818:20:operation', () =>
            inspectProviderSenderExcluded(input.senderExcluded),
          ).finalWatermark.issuedRequests,
          2,
        ),
      )
      {
        assertFixtureActive('custody-service-owner.ts:819:7:operation')
        assert.ok(receipt.physical.coveredThrough.writtenBytes > 0)
      }
    }
    afterActual(
      'custody-service-owner.ts:821:5:operation',
      (assertFixtureActive('custody-service-owner.ts:821:5:operation'),
      assert.equal(
        afterActual(
          'custody-service-owner.ts:821:19:await',
          await admitActual('custody-service-owner.ts:821:19:await-operation', () =>
            admitActual('custody-service-owner.ts:821:25:operation', () =>
              reconcile(input, source.context, trustedProviderReconciliation, client),
            ),
          ),
        ).replayed,
        true,
      )),
    )
    afterActual(
      'custody-service-owner.ts:822:5:operation',
      (assertFixtureActive('custody-service-owner.ts:822:5:operation'),
      assert.equal(
        afterActual(
          'custody-service-owner.ts:824:9:await',
          await admitActual('custody-service-owner.ts:824:9:await-operation', () =>
            admitActual('custody-service-owner.ts:824:15:operation', () =>
              reconcile(
                { intentId: input.intentId, observationKey: input.observationKey, replayRequestHash: requestHash },
                unavailableNativeProviderReconciliation,
                trustedProviderReconciliation,
                client,
              ),
            ),
          ),
        ).replayed,
        true,
      )),
    )
    // Original source has committed; monotonic exact-row controls may now advance its fence without fresh proof.
    afterActual(
      'custody-service-owner.ts:834:5:await',
      await admitActual('custody-service-owner.ts:834:5:await-operation', () =>
        admitActual('custody-service-owner.ts:834:11:operation', () =>
          contender.probe(f.binding.journeyId, sourceId, false),
        ),
      ),
    )
    admitActual('custody-service-owner.ts:835:5:operation', () =>
      writeExpectation({ postCommitControls: 1, phase: 'KNOWN_COMMITTED_AFTER_MONOTONIC_CONTROL' }),
    )
    if (!disconnect) {
      afterActual(
        'custody-service-owner.ts:837:7:operation',
        (assertFixtureActive('custody-service-owner.ts:837:7:operation'),
        assert.equal(
          afterActual(
            'custody-service-owner.ts:837:21:await',
            await admitActual('custody-service-owner.ts:837:21:await-operation', () =>
              admitActual('custody-service-owner.ts:837:27:operation', () => slot()),
            ),
          ).version,
          2,
        )),
      )
      afterActual(
        'custody-service-owner.ts:838:7:operation',
        (assertFixtureActive('custody-service-owner.ts:838:7:operation'),
        assert.equal(
          afterActual(
            'custody-service-owner.ts:838:21:await',
            await admitActual('custody-service-owner.ts:838:21:await-operation', () =>
              admitActual('custody-service-owner.ts:838:27:operation', () => slot()),
            ),
          ).intentId,
          null,
        )),
      )
      afterActual(
        'custody-service-owner.ts:839:7:operation',
        (assertFixtureActive('custody-service-owner.ts:839:7:operation'),
        assert.equal(
          afterActual(
            'custody-service-owner.ts:839:20:await',
            await admitActual('custody-service-owner.ts:839:20:await-operation', () =>
              admitActual('custody-service-owner.ts:839:26:operation', () =>
                client.qualityJourneyProviderObservation.count({ where: { kind: 'NONSTART' } }),
              ),
            ),
          ),
          1,
        )),
      )
      afterActual(
        'custody-service-owner.ts:840:7:operation',
        (assertFixtureActive('custody-service-owner.ts:840:7:operation'),
        assert.equal(
          afterActual(
            'custody-service-owner.ts:841:10:await',
            await admitActual('custody-service-owner.ts:841:10:await-operation', () =>
              admitActual('custody-service-owner.ts:841:16:operation', () =>
                client.qualityJourneyProviderRun.findUniqueOrThrow({ where: { id: armed.run.id } }),
              ),
            ),
          ).turnsReserved,
          1,
        )),
      )
      const committed = afterActual(
        'custody-service-owner.ts:844:25:await',
        await admitActual('custody-service-owner.ts:844:25:await-operation', () =>
          admitActual('custody-service-owner.ts:844:31:operation', () => row()),
        ),
      )
      admitActual('custody-service-owner.ts:845:7:operation', () => assert.equal(committed.lifecycle, 'COMMITTED'))
      admitActual('custody-service-owner.ts:846:7:operation', () =>
        assert.equal(committed.committedRequestHash, requestHash),
      )
      admitActual('custody-service-owner.ts:847:7:operation', () => assert.equal(committed.pendingBatchId, null))
      if (name === compositionServiceCase) {
        assert.equal(result.conflicted, false)
        if (result.conflicted) throw new Error('Original NONSTART conflicted; owner retained')
        const composition = afterActual(
          '16z:owner-local-composition',
          await admitActual('16z:owner-local-composition', () =>
            composeServiceOriginalNonstart(
              fixture,
              result,
              baselineResources,
              admission,
              path.resolve('scripts/tests/fixtures/m06-analysis-child.mjs'),
            ),
          ),
        )
        admitActual('16z:publish-composition', () =>
          writeExpectation({ composition, phase: 'COMPOSITION_KNOWN_SETTLED_B_PHYSICAL_UNKNOWN' }),
        )
      }
    }
  }
  function runCanonicalReconciliationCase() {
    assertFixtureActive('custody-service-owner.ts:851:3:entry')
    if (name === 'late-ack')
      return admitActual('custody-service-owner.ts:852:37:operation', () => runLateAcknowledgement())
    if (
      admitActual('custody-service-owner.ts:853:9:operation', () =>
        ['callback-throw', 'timeout', 'early-revoke', 'controlled-commit-rollback'].includes(name),
      )
    )
      return admitActual('custody-service-owner.ts:854:14:operation', () => runUnresolvedReconciliation())
    return admitActual('custody-service-owner.ts:855:12:operation', () => runCommittedReconciliation())
  }
  if (name === 'pre-hold-dispose')
    return admitActual('custody-service-owner.ts:857:43:operation', () => runPreHoldDispose())
  if (name === 'negative-inputs')
    return admitActual('custody-service-owner.ts:858:42:operation', () => runNegativeInputs())
  return admitActual('custody-service-owner.ts:859:10:operation', () => runCanonicalReconciliationCase())
}
async function runOutcomeCase(fixture: OriginalFixture) {
  assertFixtureActive('custody-service-owner.ts:862:1:entry')
  if (name === 'paused-send')
    return admitActual('custody-service-owner.ts:863:38:operation', () => runPausedSend(fixture))
  if (name === 'activation-unknown')
    return admitActual('custody-service-owner.ts:864:45:operation', () => runActivationRefusal(fixture))
  return admitActual('custody-service-owner.ts:865:10:operation', () => runSealedOutcome(fixture))
}
function disposeOriginalSource(source: Source): void {
  assertFixtureActive('custody-service-owner.ts:868:1:entry')
  const cleanupWasDisposed = admitActual('custody-service-owner.ts:869:30:operation', () => source.snapshot()).disposed
  const cleanupBaseline = admitActual('custody-service-owner.ts:870:27:operation', () =>
    originalSourceResources(admitActual('custody-service-owner.ts:870:51:operation', () => source.snapshot())),
  )
  admitActual('custody-service-owner.ts:871:3:operation', () => source.dispose())
  const cleanupAfter = admitActual('custody-service-owner.ts:872:24:operation', () =>
    originalSourceResources(admitActual('custody-service-owner.ts:872:48:operation', () => source.snapshot())),
  )
  if (cleanupWasDisposed)
    admitActual('custody-service-owner.ts:873:27:operation', () => assert.deepEqual(cleanupAfter, cleanupBaseline))
  else if (cleanupBaseline.source.issuedProofPresent)
    admitActual('custody-service-owner.ts:874:55:operation', () =>
      assertEligibleSourceDestruction(cleanupBaseline, cleanupAfter),
    )
}
async function finishOriginalOwner(fixture: OriginalFixture) {
  assertFixtureActive('custody-service-owner.ts:877:1:entry')
  const { contender, database, clientDestructionBaseline, source } = fixture
  afterActual(
    'custody-service-owner.ts:879:3:await',
    await admitActual('custody-service-owner.ts:879:3:await-operation', () =>
      admitActual('custody-service-owner.ts:879:9:operation', () => contender.close()),
    ),
  )
  if (complementRetention) {
    const resources = admitActual('16h:retained-terminal-resources', () => providerSourceDatabaseSnapshot(database))
    admitActual('16h:retained-baseline-preserved', () =>
      assert.deepEqual(complementSnapshot(fixture), complementRetention!.baseline),
    )
    admitActual('16h:retained-terminal', () =>
      event('case-retained', {
        ...complementRetention,
        resources,
        databasePath,
        expectedFixtureSha256,
      }),
    )
    terminal.allowHandoff()
    return
  }
  if (retired) {
    const resources = admitActual('custody-service-owner.ts:881:23:operation', () =>
      providerSourceDatabaseSnapshot(database),
    )
    admitActual('custody-service-owner.ts:882:5:operation', () => assert.equal(resources.retired, true))
    admitActual('custody-service-owner.ts:883:5:operation', () =>
      assertClientDestructionStable(clientDestructionBaseline, resources),
    )
    admitActual('custody-service-owner.ts:884:5:operation', () =>
      event('case-retained', {
        snapshot: admitActual('custody-service-owner.ts:885:17:operation', () => source.snapshot()),
        resources,
        databasePath,
        classification: 'UNKNOWN_ACTUAL_OWNER_RETAINED',
        ...(activationRetention ? { activation: activationRetention } : {}),
        expectedFixtureSha256,
      }),
    )
    terminal.allowHandoff()
    return
  }
  admitActual('custody-service-owner.ts:894:3:operation', () => disposeOriginalSource(source))
  afterActual(
    'custody-service-owner.ts:895:3:await',
    await admitActual('custody-service-owner.ts:895:3:await-operation', () =>
      admitActual('custody-service-owner.ts:895:9:operation', () => disposeProviderSourceDatabase(database)),
    ),
  )
  const resources = admitActual('custody-service-owner.ts:896:21:operation', () =>
    assertFixtureDatabaseClosed(database),
  )
  completed = true
  admitActual('custody-service-owner.ts:898:3:operation', () =>
    event('case-known-closed', {
      snapshot: admitActual('custody-service-owner.ts:898:42:operation', () => source.snapshot()),
      resources,
      databasePath,
      expectedFixtureSha256,
    }),
  )
  terminal.allowHandoff()
}
function main() {
  return runServiceOwnerMain(name, admission, {
    complementNames,
    instrumentComplementPersistence,
    createOriginalFixture,
    performOriginalSend,
    crash,
    runComplement: (fixture, trace) => runComplement(fixture, trace, otherClosedClient),
    finishOriginalOwner,
    runOutcomeCase,
  })
}

admitActual('workspace-directory', () => mkdirSync(workspace, { recursive: true }))
admission.keepActual('main-observer', admitActual('main', () => main()).catch(retain))
