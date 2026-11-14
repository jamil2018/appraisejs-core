import { canonicalContractJson } from '@/lib/catalog-contracts'
import { randomUUID } from 'node:crypto'
import { PassThrough, Writable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createOriginalNativeOutcomeCandidate,
  acquireOriginalNativeOutcomeCustody,
  readOriginalNativeOutcomeReplay,
} from './native-outcome-source'
import type { NativeOutcomeReviewDecision } from './native-outcome-source'
import type { NativeOutcomeProfile } from './native-outcome-profile'
import type { NativeDiagnosticObserver } from './native-qualification-diagnostics'
import type { NativeChildOutcomeObserver } from './native-qualification-child'
import type { CapturedNativeQualificationPlan } from './native-qualification-contract'
import type { ProviderSourceDatabase } from '../provider-source-database'
import type { OwnedFixtureChild } from './owned-child'
import {
  createProviderSendPermit,
  consumeProviderSendPermit,
  trustedProviderArm,
  inspectProviderSendPermitTransport,
  type ProviderSendPermit,
} from '../provider-intent-contract'
import {
  validateProviderReconciliationEvidence,
  providerReconciliationRequestHash,
} from '../provider-reconciliation-contract'
import { canonicalOutcomeJson, outcomeDigest } from './outcome-source-contract'
import { RpcTransport } from './rpc-transport'

const fake = vi.hoisted(() => ({
  claim: vi.fn(),
  profile: vi.fn(),
  plan: vi.fn(),
  initialize: vi.fn(),
  bind: vi.fn(),
  domain: vi.fn(),
  hold: vi.fn(),
  replay: vi.fn(),
}))
vi.mock('./native-qualification-child', () => ({ claimOriginalNativeQualificationChild: fake.claim }))
vi.mock('./native-outcome-profile', async importOriginal => ({
  ...(await importOriginal<typeof import('./native-outcome-profile')>()),
  nativeOutcomeProtocolDigest: `sha256:${'c'.repeat(64)}`,
  inspectNativeOutcomeProfile: fake.profile,
}))
vi.mock('./native-qualification-contract', () => ({ inspectNativeQualificationPlan: fake.plan }))
vi.mock('./native-qualification-configuration', () => ({
  verifyNativeQualificationConfiguration: (value: unknown) => (value as { valid?: boolean }).valid === true,
}))
vi.mock('../provider-source-database', () => ({
  proveProviderSourceNativeConnectionDomain: fake.domain,
  assertProviderSourceNativeConnectionDomain: vi.fn(),
  assertProviderSourceDatabaseClient: vi.fn(),
  acquireProviderSourceDatabaseHold: fake.hold,
  assertProviderSourceTransactionSettingsForClient: vi.fn(),
  resolveProviderSourceDatabaseHold: vi.fn(),
  readProviderSourceCommittedSnapshot: vi.fn(),
}))
vi.mock('./native-outcome-replay', () => ({ readNativeOutcomeCommittedReplay: fake.replay }))
vi.mock('./native-outcome-journal', () => ({
  NativeOutcomeJournal: class {
    initialize = fake.initialize
    #digest?: string
    async bindAndSeal(identity: unknown, digest: string) {
      await fake.bind(identity, digest)
      this.#digest = digest
    }
    state() {
      return { sealedEnvelopeDigest: this.#digest }
    }
    records() {
      return []
    }
    verifyLocked() {}
  },
}))
const transports: RpcTransport[] = []
afterEach(() => {
  transports.splice(0).forEach(t => t.fence('test_cleanup'))
  vi.useRealTimers()
  vi.clearAllMocks()
})
const digest = `sha256:${'a'.repeat(64)}`
async function fixture(
  options: {
    diagnostics?: NativeDiagnosticObserver
    permit?: ProviderSendPermit
    badDomain?: boolean
    pendingWrite?: boolean
    configuration?: unknown
    pendingFinalWrite?: boolean
    changedControl?: boolean
    wrongOwner?: boolean
  } = {},
) {
  const permit =
    options.permit ??
    createProviderSendPermit(
      { runId: randomUUID(), intentId: randomUUID(), sendBoundaryId: randomUUID(), claimEpoch: 1 },
      trustedProviderArm,
    )
  const envelope = { input: [{ type: 'text', text: 'source-only fake' }], model: 'gpt-6.1-sol', effort: 'medium' }
  const plan = {} as CapturedNativeQualificationPlan
  fake.profile.mockReturnValue({
    profileDigest: digest,
    dossierDigest: `sha256:${'b'.repeat(64)}`,
    artifactDigest: `sha256:${'d'.repeat(64)}`,
    configurationDigest: `sha256:${'e'.repeat(64)}`,
    plan,
  })
  fake.plan.mockReturnValue({
    manifest: { freshRoot: '/private/fresh', envelopeDigest: outcomeDigest(canonicalOutcomeJson(envelope)) },
    capability: 'private',
  })
  fake.domain.mockImplementation(async () => {
    if (options.badDomain) throw new Error('domain')
    return {}
  })
  fake.initialize.mockResolvedValue(undefined)
  fake.bind.mockResolvedValue({})
  let observer!: NativeChildOutcomeObserver
  const stdout = new PassThrough(),
    stderr = new PassThrough()
  let callback: (() => void) | undefined
  const stdin = new Writable({
    write(_bytes, _encoding, done) {
      if (options.pendingWrite || (options.pendingFinalWrite && String(_bytes).includes('turn/start'))) callback = done
      else done()
    },
  })
  const transportId = randomUUID()
  const raw = new RpcTransport(
    { stdin, stdout, stderr },
    {
      transportId: options.wrongOwner ? randomUUID() : transportId,
      onNotification() {},
      onFault() {},
      retainReadStreamsOnFence: true,
    },
  )
  transports.push(raw)
  fake.claim.mockImplementation((_child, _plan, captured) => {
    observer = captured
    return { owner: raw.owner, snapshot: () => raw.snapshot(), sealSender: () => raw.sealSender() }
  })
  const control = { reviewerId: 'independent-reviewer', nonce: randomUUID(), reviewMs: 10000, reconciliationMs: 10000 }
  fake.profile.mockReturnValue({
    profileDigest: digest,
    dossierDigest: `sha256:${'b'.repeat(64)}`,
    artifactDigest: `sha256:${'d'.repeat(64)}`,
    configurationDigest: `sha256:${'e'.repeat(64)}`,
    plan,
    reviewControlDigest: outcomeDigest(canonicalContractJson(control)),
  })
  const candidate = await createOriginalNativeOutcomeCandidate({
    profile: {} as NativeOutcomeProfile,
    permit,
    database: {} as ProviderSourceDatabase,
    providerNamespace: 'native_source_fake',
    transportId,
    reviewControl: options.changedControl ? { ...control, reviewMs: control.reviewMs + 1 } : control,
    diagnostics: options.diagnostics,
  })
  candidate.attach({} as OwnedFixtureChild)
  const threadId = randomUUID(),
    turnId = randomUUID()
  async function send(
    method: Parameters<NativeChildOutcomeObserver['beforeRequest']>[0],
    params: Record<string, unknown>,
    response: unknown,
  ) {
    observer.beforeRequest(method, params)
    const operation = raw.request(method, params)
    observer.operation(operation, method)
    stdout.write(`${JSON.stringify({ id: raw.snapshot().issuedRequests, result: response })}\n`)
    await operation
    await Promise.resolve()
    await Promise.resolve()
  }
  async function ready() {
    await send(
      'initialize',
      { capabilities: { experimentalApi: false }, clientInfo: { name: 'appraise-journey-supervisor', version: '1' } },
      {},
    )
    const initialized = raw.notifyInitialized()
    observer.operation(initialized, 'initialized')
    await initialized
    await send(
      'config/read',
      { cwd: '/private/fresh/cwd', includeLayers: false },
      Object.hasOwn(options, 'configuration') ? options.configuration : { valid: true, config: {} },
    )
    await send(
      'thread/start',
      {
        cwd: '/private/fresh/cwd',
        ephemeral: true,
        model: 'gpt-6.1-sol',
        sandbox: 'read-only',
        approvalPolicy: 'never',
      },
      { thread: { id: threadId, ephemeral: true, turns: [] } },
    )
    await send('mcpServerStatus/list', { threadId, serverName: 'appraise_worker', detail: 'full', limit: 1 }, {})
  }
  async function complete({ error = null, status = 'completed' }: { error?: unknown; status?: string } = {}) {
    await ready()
    consumeProviderSendPermit(permit)
    await send('turn/start', { threadId, ...envelope }, { turn: { id: turnId } })
    observer.notification('turn/started', { threadId, turn: { id: turnId } })
    observer.notification('turn/completed', { threadId, turn: { id: turnId, status, error } })
  }
  async function cleanup(originalStop: Promise<unknown> = Promise.resolve()) {
    candidate.captureSupervisorStop(originalStop)
    raw.fence('logical_completion')
    const originalClose = Promise.resolve({ closed: true, effectUnknown: false })
    candidate.captureSdkClose(originalClose)
    await originalClose
    await Promise.resolve()
    observer.cleanup({
      status: 'stopped',
      groupExitObserved: true,
      privateRootRemoved: true,
      privateRootRetained: false,
    })
  }
  function review(
    body: Awaited<ReturnType<typeof candidate.freezeCandidate>>,
    changes = {},
  ): NativeOutcomeReviewDecision {
    return {
      version: 'M13_NATIVE_OUTCOME_REVIEW_V1',
      decision: 'ACCEPT',
      reviewerId: control.reviewerId,
      nonce: control.nonce,
      candidateDigest: body.candidateDigest,
      dossierDigest: String(body.dossierDigest),
      profileDigest: String(body.profileDigest),
      artifactDigest: String(body.artifactDigest),
      identityDigest: String(body.identityDigest),
      actualReviewReceiptDigest: digest,
      ...changes,
    }
  }
  return {
    candidate,
    raw,
    stdout,
    envelope,
    observer: () => observer,
    ready,
    complete,
    cleanup,
    review,
    permit,
    plan,
    threadId,
    turnId,
    send,
    callback: () => callback?.(),
  }
}
describe('task-private native candidate original custody (source-only fake, no native acquisition)', () => {
  it('admits the issuer digest through constructor/init/domain and rejects changed control before journal writes', async () => {
    await fixture()
    const issued = fake.profile.mock.results.at(-1)!.value
    expect(issued.reviewControlDigest).not.toBe(issued.profileDigest)
    expect(
      new Set([issued.profileDigest, issued.dossierDigest, issued.artifactDigest, issued.configurationDigest]).size,
    ).toBe(4)
    expect(fake.initialize).toHaveBeenCalledOnce()
    expect(fake.domain).toHaveBeenCalledOnce()
    vi.clearAllMocks()
    await expect(fixture({ changedControl: true })).rejects.toThrow(/unreconciled UNKNOWN/)
    expect(fake.initialize).not.toHaveBeenCalled()
    expect(fake.domain).not.toHaveBeenCalled()
    expect(fake.claim).not.toHaveBeenCalled()
  })
  it('binds the original armed permit before handshake and enrolls after cleanup without another native write', async () => {
    const f = await fixture()
    expect(inspectProviderSendPermitTransport(f.permit).owner).toBe(f.raw.owner)
    expect(fake.initialize.mock.invocationCallOrder[0]).toBeLessThan(fake.domain.mock.invocationCallOrder[0])
    expect(fake.domain.mock.invocationCallOrder[0]).toBeLessThan(fake.claim.mock.invocationCallOrder[0])
    await f.complete()
    await f.cleanup()
    const before = f.raw.snapshot()
    const body = await f.candidate.freezeCandidate()
    const enrollment = f.candidate.acceptTaskReview(f.review(body))
    expect(f.raw.snapshot()).toEqual(before)
    expect(
      validateProviderReconciliationEvidence(enrollment.senderExcluded, enrollment.physicalEvidence, enrollment.context)
        .physical,
    ).toMatchObject({
      provenance: 'NATIVE_QUALIFIED',
      outcome: 'TERMINAL',
      coveredThrough: { issuedRequests: 5, writtenBytes: before.writtenBytes },
    })
    expect(() => enrollment.context.source!.inspect({ ...enrollment.physicalEvidence })).toThrow()
    expect(() => f.candidate.acceptTaskReview(f.review(body))).toThrow()
  })
  it('refuses copied original permits before initialization and does not acquire a child after failed domain proof', async () => {
    const permit = createProviderSendPermit(
      { runId: randomUUID(), intentId: randomUUID(), sendBoundaryId: randomUUID(), claimEpoch: 1 },
      trustedProviderArm,
    )
    await expect(fixture({ permit: { ...permit } })).rejects.toThrow(/Original provider sender/)
    expect(fake.initialize).not.toHaveBeenCalled()
    await expect(fixture({ badDomain: true })).rejects.toThrow('domain')
    expect(fake.claim).not.toHaveBeenCalled()
  })
  it.each(['pending-gateway', 'rejected-gateway', 'pending-heartbeat', 'rejected-heartbeat'])(
    'retains UNKNOWN for %s',
    async mode => {
      const f = await fixture()
      await f.complete()
      const operation = mode.startsWith('pending') ? new Promise(() => {}) : Promise.reject(new Error('lost reply'))
      if (mode.endsWith('gateway')) f.candidate.gateway(operation)
      else f.candidate.supervisorOperation(operation)
      await Promise.resolve()
      await Promise.resolve()
      await f.cleanup()
      await expect(f.candidate.freezeCandidate()).rejects.toThrow(/UNKNOWN/)
    },
  )
  it.each(['failed', 'interrupted'])('refuses %s completion', async status => {
    const f = await fixture()
    await expect(f.complete({ status })).rejects.toThrow(/UNKNOWN/)
    await f.cleanup()
    await expect(f.candidate.freezeCandidate()).rejects.toThrow()
  })
  it('refuses a completed turn with an error, extra turn/input, or foreign thread', async () => {
    const f = await fixture()
    await expect(f.complete({ error: { message: 'error' } })).rejects.toThrow()
    expect(() => f.observer().beforeRequest('turn/start', {})).toThrow()
    expect(() => f.observer().notification('thread/queue/changed', { threadId: randomUUID() })).toThrow()
  })
  it.each([
    'candidateDigest',
    'dossierDigest',
    'profileDigest',
    'artifactDigest',
    'identityDigest',
    'nonce',
    'reviewerId',
  ])('consumes mismatched %s review without enrollment', async field => {
    const f = await fixture()
    await f.complete()
    await f.cleanup()
    const body = await f.candidate.freezeCandidate()
    expect(() => f.candidate.acceptTaskReview(f.review(body, { [field]: 'wrong' }))).toThrow()
    expect(() => f.candidate.acceptTaskReview(f.review(body))).toThrow()
  })
  it('refuses expired review and a reconstructed source after owner loss', async () => {
    const f = await fixture()
    await f.complete()
    await f.cleanup()
    const body = await f.candidate.freezeCandidate()
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 10001)
    expect(() => f.candidate.acceptTaskReview(f.review(body))).toThrow()
    expect(() =>
      validateProviderReconciliationEvidence({} as never, {}, { selection: 'NATIVE', source: {} as never }),
    ).toThrow()
  })
  it('poisons late original callbacks and revokes an already enrolled proof', async () => {
    const f = await fixture()
    await f.complete()
    await f.cleanup()
    const body = await f.candidate.freezeCandidate()
    const enrollment = f.candidate.acceptTaskReview(f.review(body))
    expect(() => f.observer().notification('account/rateLimits/updated', {})).toThrow()
    expect(() => enrollment.context.source!.inspect(enrollment.physicalEvidence)).toThrow()
  })
  it('retains bounded disabled remote status and refuses active/errored/remote-bound status even after fence', async () => {
    const f = await fixture()
    await f.complete()
    f.raw.fence('logical_completion')
    expect(() =>
      f.observer().notification('remoteControl/status/changed', { status: 'disabled', environmentId: null }),
    ).not.toThrow()
    expect(() =>
      f.observer().notification('remoteControl/status/changed', { status: 'active', environmentId: null }),
    ).toThrow()
    await f.cleanup()
    await expect(f.candidate.freezeCandidate()).rejects.toThrow()
  })
  it.each(['thread/started', 'turn/started', 'error', 'thread/queue/changed'])(
    'refuses late producer %s through passive cleanup observation',
    async method => {
      const f = await fixture()
      await f.complete()
      f.raw.fence('logical_completion')
      expect(() =>
        f
          .observer()
          .notification(method, { threadId: randomUUID(), turn: { id: randomUUID() }, thread: { id: randomUUID() } }),
      ).toThrow()
      await f.cleanup()
      await expect(f.candidate.freezeCandidate()).rejects.toThrow()
    },
  )
  it('does not consume its original clean lookup while the captured transaction Promise is pending', async () => {
    const f = await fixture()
    await f.complete()
    await f.cleanup()
    const body = await f.candidate.freezeCandidate(),
      enrollment = f.candidate.acceptTaskReview(f.review(body))
    const receipt = validateProviderReconciliationEvidence(
      enrollment.senderExcluded,
      enrollment.physicalEvidence,
      enrollment.context,
    )
    const key = 'original-key',
      hash = providerReconciliationRequestHash(receipt.identity.intentId, key, receipt)
    const client = {} as import('@prisma/client').PrismaClient
    fake.hold.mockReturnValue({ complete: (finalize: () => void) => finalize(), retire: vi.fn() })
    const custody = acquireOriginalNativeOutcomeCustody(
      enrollment.context.source!,
      enrollment.physicalEvidence,
      enrollment.senderExcluded,
      client,
      receipt,
      { observationKey: key, requestHash: hash },
    )
    let resolve!: () => void
    const actual = new Promise<void>(done => {
      resolve = done
    })
    custody.captureTransaction(actual)
    const input = {
      intentId: receipt.identity.intentId,
      observationKey: key,
      senderExcluded: enrollment.senderExcluded,
      physicalEvidence: enrollment.physicalEvidence,
    }
    await expect(readOriginalNativeOutcomeReplay(enrollment.context.source!, input, client)).rejects.toThrow()
    expect(fake.replay).not.toHaveBeenCalled()
    resolve()
    await actual
    custody.completeFulfilled()
    const positive = {
      receipt,
      requestHash: hash,
      replayed: true,
      conflicted: false,
      quarantined: false,
      observation: { intentId: receipt.identity.intentId, observationKey: key },
    }
    fake.replay.mockResolvedValue(positive)
    expect(await readOriginalNativeOutcomeReplay(enrollment.context.source!, input, client)).toEqual(positive)
    expect(fake.replay).toHaveBeenCalledOnce()
  })
  it('refuses a different original raw owner before initialize', async () => {
    await expect(fixture({ wrongOwner: true })).rejects.toThrow()
  })
  it.each(['missing-ack', 'pending-write'])('refuses %s despite a correlated ordinary completion', async mode => {
    const f = await fixture({ pendingFinalWrite: mode === 'pending-write' })
    await f.ready()
    consumeProviderSendPermit(f.permit)
    f.observer().beforeRequest('turn/start', { threadId: f.threadId, ...f.envelope })
    const original = f.raw.request('turn/start', { threadId: f.threadId, ...f.envelope })
    f.observer().operation(original, 'turn/start')
    const rejected = expect(original).rejects.toThrow()
    if (mode === 'pending-write') f.stdout.write(JSON.stringify({ id: 5, result: { turn: { id: f.turnId } } }) + '\n')
    f.observer().notification('turn/completed', {
      threadId: f.threadId,
      turn: { id: f.turnId, status: 'completed', error: null },
    })
    await f.cleanup()
    await rejected
    await expect(f.candidate.freezeCandidate()).rejects.toThrow()
  })
  it.each(['pending', 'rejected', 'sticky-unknown'])(
    'retains actual SDK cleanup %s Promise and refuses qualification',
    async mode => {
      const f = await fixture()
      await f.complete()
      f.raw.fence('logical_completion')
      let resolve!: (value: { closed: boolean; effectUnknown: boolean }) => void
      const actual =
        mode === 'pending'
          ? new Promise<{ closed: boolean; effectUnknown: boolean }>(done => {
              resolve = done
            })
          : mode === 'rejected'
            ? Promise.reject(new Error('Original SDK cleanup rejected'))
            : Promise.resolve({ closed: true, effectUnknown: true })
      f.candidate.captureSdkClose(actual)
      await Promise.resolve()
      await Promise.resolve()
      f.candidate.captureSupervisorStop(Promise.resolve())
      f.observer().cleanup({
        status: 'stopped',
        groupExitObserved: true,
        privateRootRemoved: true,
        privateRootRetained: false,
      })
      await expect(f.candidate.freezeCandidate()).rejects.toThrow()
      if (mode === 'pending') {
        resolve({ closed: true, effectUnknown: false })
        await actual
        await Promise.resolve()
        await expect(f.candidate.freezeCandidate()).rejects.toThrow()
      }
      expect(() => f.candidate.captureSdkClose(Promise.resolve({ closed: true, effectUnknown: false }))).toThrow()
    },
  )
  it('refuses a late same-thread/same-turn enabled MCP producer after ordinary completion during passive drain', async () => {
    const f = await fixture()
    await f.complete()
    f.raw.fence('logical_completion')
    expect(() =>
      f.observer().notification('item/started', {
        threadId: f.threadId,
        turnId: f.turnId,
        item: {
          id: 'late-tool',
          type: 'mcpToolCall',
          server: 'appraise_worker',
          tool: 'quality_journey_discovery_get',
          status: 'inProgress',
        },
      }),
    ).toThrow()
    await f.cleanup()
    await expect(f.candidate.freezeCandidate()).rejects.toThrow()
  })
  it.each(['fulfilled', 'rejected'])(
    'joins actual supervisor stop %s after native and SDK cleanup',
    async settlement => {
      const f = await fixture()
      await f.complete()
      let resolve!: () => void, reject!: (reason: unknown) => void
      const originalStop = new Promise<void>((done, failed) => {
        resolve = done
        reject = failed
      })
      await f.cleanup(originalStop)
      const before = f.raw.snapshot(),
        frozen = f.candidate.freezeCandidate()
      let settled = false
      void frozen.then(
        () => {
          settled = true
        },
        () => {
          settled = true
        },
      )
      await Promise.resolve()
      expect(settled).toBe(false)
      if (settlement === 'fulfilled') {
        resolve()
        expect(await frozen).toHaveProperty('candidateDigest')
      } else {
        const refused = expect(frozen).rejects.toThrow()
        reject(new Error('original final persistence rejected'))
        await refused
        expect(fake.bind).not.toHaveBeenCalled()
      }
      expect(f.raw.snapshot()).toEqual(before)
    },
  )
  it('freezes one exact candidate under concurrent calls and binds its local digest once', async () => {
    const f = await fixture()
    await f.complete()
    let resolve!: () => void
    const stop = new Promise<void>(done => {
      resolve = done
    })
    await f.cleanup(stop)
    const first = f.candidate.freezeCandidate()
    await expect(f.candidate.freezeCandidate()).rejects.toThrow()
    resolve()
    const result = await first
    const { candidateDigest, ...body } = result
    expect(candidateDigest).toBe(outcomeDigest(canonicalOutcomeJson(body)))
    expect(fake.bind).toHaveBeenCalledExactlyOnceWith(expect.anything(), candidateDigest)
  })
  it.each([undefined, null, '/private/fresh/codex-home'])(
    'accepts source-closed private SQLite home %s',
    async sqlite_home => {
      const f = await fixture({ configuration: { valid: true, config: { sqlite_home } } })
      await f.complete()
      await f.cleanup()
      expect(await f.candidate.freezeCandidate()).toHaveProperty('candidateDigest')
    },
  )
  it.each([
    { valid: true },
    { valid: true, config: null },
    { valid: true, config: { sqlite_home: '/outside/shared' } },
    { valid: true, config: { sqlite_home: false } },
    { valid: true, config: { sqlite_home: [] } },
    { valid: true, config: { sqlite_home: '/private/other/codex-home' } },
  ])('refuses missing/external/unknown SQLite state-home config %j', async configuration => {
    const f = await fixture({ configuration })
    await expect(f.complete()).rejects.toThrow()
    expect(f.raw.snapshot().issuedRequests).toBeLessThan(5)
  })
  it('refuses missing acknowledgements/cleanup and SDK sticky uncertainty', async () => {
    const f = await fixture()
    await f.ready()
    f.candidate.captureSdkClose(Promise.resolve({ closed: true, effectUnknown: true }))
    await Promise.resolve()
    await expect(f.candidate.freezeCandidate()).rejects.toThrow()
  })
})

function passiveDiagnostics() {
  const rows: Array<[string, string, string | undefined]> = []
  const diagnostics: NativeDiagnosticObserver = {
    record(stage, status, reason) {
      rows.push([stage, status, reason])
      return true
    },
    failed: () => false,
    onFailure() {},
  }
  return { diagnostics, rows: () => rows.filter(([stage]) => stage.startsWith('PASSIVE_')) }
}
describe('source-only fixed passive predicates preserve rejection policy and counter order', () => {
  it.each([
    ['status', 'REMOTE_STATUS_NOT_DISABLED'],
    ['environment', 'REMOTE_ENVIRONMENT_PRESENT'],
  ] as const)('records %s refusal before remote count without reading short-circuited fields', async (mode, reason) => {
    const d = passiveDiagnostics(),
      f = await fixture({ diagnostics: d.diagnostics })
    const environment = vi.fn(() => {
      throw new Error('environment must not be inspected')
    })
    const params =
      mode === 'status'
        ? Object.defineProperty({ status: 'active' }, 'environmentId', { get: environment })
        : { status: 'disabled', environmentId: 'synthetic-present' }
    expect(() => f.observer().notification('remoteControl/status/changed', params)).toThrow(/unreconciled UNKNOWN/)
    expect(environment).not.toHaveBeenCalled()
    expect(d.rows()).toEqual([['PASSIVE_OUTCOME_REMOTE_STATUS', 'REFUSED', reason]])
    for (let index = 0; index < 32; index++)
      expect(() =>
        f.observer().notification('remoteControl/status/changed', { status: 'disabled', environmentId: null }),
      ).not.toThrow()
    expect(() =>
      f.observer().notification('remoteControl/status/changed', { status: 'disabled', environmentId: null }),
    ).toThrow()
    expect(d.rows()).toHaveLength(1)
  })
  it('records the actual excessive remote count predicate on the original 33rd disabled notification', async () => {
    const d = passiveDiagnostics(),
      f = await fixture({ diagnostics: d.diagnostics })
    for (let index = 0; index < 32; index++)
      f.observer().notification('remoteControl/status/changed', { status: 'disabled', environmentId: null })
    expect(d.rows()).toEqual([])
    expect(() =>
      f.observer().notification('remoteControl/status/changed', { status: 'disabled', environmentId: null }),
    ).toThrow()
    expect(d.rows()).toEqual([['PASSIVE_OUTCOME_REMOTE_STATUS', 'REFUSED', 'REMOTE_STATUS_LIMIT_EXCEEDED']])
  })
  it('continues permitting MCP startup and locates an actual thread scope mismatch', async () => {
    const d = passiveDiagnostics(),
      f = await fixture({ diagnostics: d.diagnostics })
    await f.ready()
    expect(() => f.observer().notification('mcpServer/startupStatus/updated', { threadId: f.threadId })).not.toThrow()
    expect(d.rows()).toEqual([])
    expect(() =>
      f.observer().notification('mcpServer/startupStatus/updated', { threadId: 'synthetic-foreign-thread' }),
    ).toThrow()
    expect(d.rows()).toEqual([['PASSIVE_OUTCOME_MCP_STARTUP', 'REFUSED', 'THREAD_SCOPE_MISMATCH']])
  })
  it('records the actual turn scope mismatch without reading a turnId when the original scope is absent', async () => {
    const d = passiveDiagnostics(),
      f = await fixture({ diagnostics: d.diagnostics }),
      read = vi.fn(() => {
        throw new Error('turnId should short circuit')
      })
    const params = Object.defineProperty({}, 'turnId', { get: read })
    expect(() => f.observer().notification('mcpServer/startupStatus/updated', params)).toThrow()
    expect(read).not.toHaveBeenCalled()
    expect(d.rows()).toEqual([['PASSIVE_OUTCOME_MCP_STARTUP', 'REFUSED', 'TURN_SCOPE_MISMATCH']])
  })
  it('locates a conflicting original turn object at the existing notification reply predicate', async () => {
    const d = passiveDiagnostics(),
      f = await fixture({ diagnostics: d.diagnostics })
    await f.complete()
    expect(() =>
      f.observer().notification('turn/completed', { threadId: f.threadId, turn: { id: 'synthetic-foreign-turn' } }),
    ).toThrow()
    expect(d.rows()).toEqual([['PASSIVE_OUTCOME_OTHER', 'REFUSED', 'TURN_SCOPE_MISMATCH']])
  })
  it('retains the original account exclusion and never serializes payload or thrown error properties', async () => {
    const d = passiveDiagnostics(),
      f = await fixture({ diagnostics: d.diagnostics }),
      read = vi.fn(() => {
        throw new Error('private error getter read')
      })
    const hostile = Object.create(null)
    for (const key of ['message', 'stack', 'cause', 'name', 'code', 'token'])
      Object.defineProperty(hostile, key, { get: read })
    expect(() =>
      f.observer().notification('account/updated', { authMode: null, planType: null, privatePayload: hostile }),
    ).toThrow(/unreconciled UNKNOWN/)
    expect(() => f.observer().notification('secret future /private/method', { privatePayload: hostile })).toThrow()
    expect(d.rows()).toEqual([['PASSIVE_OUTCOME_ACCOUNT_UPDATED', 'REFUSED', 'UNCLASSIFIED_NOTIFICATION']])
    expect(read).not.toHaveBeenCalled()
    expect(JSON.stringify(d.rows())).not.toMatch(/privatePayload|secret|token|method/)
  })
  it('uses only the fixed fallback when a remaining policy accessor throws a hostile error', async () => {
    const d = passiveDiagnostics(),
      f = await fixture({ diagnostics: d.diagnostics }),
      read = vi.fn(() => {
        throw new Error('raw error inspected')
      })
    const hostile = Object.create(null)
    for (const key of ['message', 'stack', 'cause', 'name', 'code']) Object.defineProperty(hostile, key, { get: read })
    const params = Object.defineProperty({}, 'status', {
      get() {
        throw hostile
      },
    })
    expect(() => f.observer().notification('thread/status/changed', params)).toThrow(/unreconciled UNKNOWN/)
    expect(read).not.toHaveBeenCalled()
    expect(d.rows()).toEqual([['PASSIVE_OUTCOME_OTHER', 'REFUSED', 'SOURCE_NOTIFICATION_REFUSED']])
  })
  it('keeps the original global notification limit and records only its first refusal', async () => {
    const d = passiveDiagnostics(),
      f = await fixture({ diagnostics: d.diagnostics })
    for (let index = 0; index < 8192; index++) f.observer().notification('mcpServer/startupStatus/updated', {})
    expect(d.rows()).toEqual([])
    expect(() => f.observer().notification('mcpServer/startupStatus/updated', {})).toThrow()
    expect(d.rows()).toEqual([['PASSIVE_OUTCOME_MCP_STARTUP', 'REFUSED', 'NOTIFICATION_LIMIT_EXCEEDED']])
  })
  it('records after-cleanup before inspecting notification scope or payload', async () => {
    const d = passiveDiagnostics(),
      f = await fixture({ diagnostics: d.diagnostics }),
      read = vi.fn(() => {
        throw new Error('scope should not be read')
      })
    f.observer().cleanup({
      status: 'stopped',
      groupExitObserved: true,
      privateRootRemoved: true,
      privateRootRetained: false,
    })
    expect(() =>
      f
        .observer()
        .notification('mcpServer/startupStatus/updated', Object.defineProperty({}, 'threadId', { get: read })),
    ).toThrow()
    expect(read).not.toHaveBeenCalled()
    expect(d.rows()).toEqual([['PASSIVE_OUTCOME_MCP_STARTUP', 'REFUSED', 'NOTIFICATION_AFTER_CLEANUP']])
  })
})
