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
  disableProviderSendPermit,
  trustedProviderReconciliation,
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
import { nativeStartupWarning } from './native-startup-metadata'

const fake = vi.hoisted(() => ({
  claim: vi.fn(),
  profile: vi.fn(),
  plan: vi.fn(),
  initialize: vi.fn(),
  bind: vi.fn(),
  domain: vi.fn(),
  assertDomain: vi.fn(),
  hold: vi.fn(),
  replay: vi.fn(),
  loss: vi.fn(),
}))
vi.mock('./native-qualification-loss', async importOriginal => ({
  ...(await importOriginal<typeof import('./native-qualification-loss')>()),
  inspectNativeQualificationLoss: fake.loss,
}))
vi.mock('./native-qualification-child', () => ({ claimOriginalNativeQualificationChild: fake.claim }))
vi.mock('./native-outcome-profile', async importOriginal => ({
  ...(await importOriginal<typeof import('./native-outcome-profile')>()),
  nativeOutcomeProtocolDigest: `sha256:${'c'.repeat(64)}`,
  inspectNativeOutcomeProfile: fake.profile,
}))
vi.mock('./native-qualification-contract', () => ({ inspectNativeQualificationPlan: fake.plan }))
vi.mock('./native-qualification-configuration', async importOriginal => ({
  ...(await importOriginal<typeof import('./native-qualification-configuration')>()),
  verifyNativeQualificationConfiguration: (value: unknown) => (value as { valid?: boolean }).valid === true,
}))
vi.mock('../provider-source-database', () => ({
  proveProviderSourceNativeConnectionDomain: fake.domain,
  assertProviderSourceNativeConnectionDomain: fake.assertDomain,
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
    threadId?: string
    threadNotificationId?: string
    nonce?: string
    loss?: boolean
  } = {},
) {
  if (options.loss)
    fake.loss.mockReturnValue({ proof: { VALIDATED: false, WITHHELD: false, PAUSE_COMMITTED: false, UNPROVEN: false } })
  const permit =
    options.permit ??
    createProviderSendPermit(
      { runId: randomUUID(), intentId: randomUUID(), sendBoundaryId: randomUUID(), claimEpoch: 1 },
      trustedProviderArm,
    )
  const envelope = { input: [{ type: 'text', text: 'source-only fake' }], model: 'gpt-5.5', effort: 'medium' }
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
    return {
      fence: () => raw.fence('source_poison'),
      owner: raw.owner,
      snapshot: () => raw.snapshot(),
      sealSender: () => raw.sealSender(),
    }
  })
  const control = {
    reviewerId: 'independent-reviewer',
    nonce: options.nonce ?? randomUUID(),
    reviewMs: 10000,
    reconciliationMs: 10000,
  }
  fake.profile.mockReturnValue({
    profileDigest: digest,
    dossierDigest: `sha256:${'b'.repeat(64)}`,
    artifactDigest: `sha256:${'d'.repeat(64)}`,
    configurationDigest: `sha256:${'e'.repeat(64)}`,
    plan,
    reviewControlDigest: outcomeDigest(canonicalContractJson(control)),
  })
  const profile = {} as NativeOutcomeProfile
  const candidate = await createOriginalNativeOutcomeCandidate({
    profile,
    permit,
    database: {} as ProviderSourceDatabase,
    providerNamespace: 'native_source_fake',
    transportId,
    reviewControl: options.changedControl ? { ...control, reviewMs: control.reviewMs + 1 } : control,
    diagnostics: options.diagnostics,
    qualificationLoss: options.loss ? ({} as never) : undefined,
  })
  candidate.attach({} as OwnedFixtureChild)
  const threadId = options.threadId ?? randomUUID(),
    turnId = randomUUID()
  async function send(
    method: Parameters<NativeChildOutcomeObserver['beforeRequest']>[0],
    params: Record<string, unknown>,
    response: unknown,
  ) {
    if (method === 'thread/start') await observer.startupReady!(Date.now() + 1000)
    observer.beforeRequest(method, params)
    if (method === 'thread/start') observer.admitStartup!()
    const operation = raw.request(method, params)
    observer.operation(operation, method)
    if (method === 'initialize') observer.validatedInitialize!()
    if (method === 'thread/start' && options.threadNotificationId !== undefined)
      observer.notification('thread/started', {
        thread: { id: options.threadNotificationId, ephemeral: true, turns: [] },
      })
    stdout.write(`${JSON.stringify({ id: raw.snapshot().issuedRequests, result: response })}\n`)
    await operation
    await Promise.resolve()
    await Promise.resolve()
  }
  async function ready(beforeMcp?: () => void) {
    await send(
      'initialize',
      { capabilities: { experimentalApi: false }, clientInfo: { name: 'appraise-journey-supervisor', version: '1' } },
      {},
    )
    observer.notification('configWarning', { summary: nativeStartupWarning })
    observer.notification('account/updated', { authMode: 'chatgpt', planType: 'unknown' })
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
        model: 'gpt-5.5',
        sandbox: 'read-only',
        approvalPolicy: 'never',
      },
      { thread: { id: threadId, ephemeral: true, turns: [] } },
    )
    beforeMcp?.()
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
    profile,
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
  // Trusted task/dependencies/source stay frozen until sealing; concurrent hostile filesystem writers are outside this scope.
  it('does not recapture the frozen profile during send admission or the startup/turn handshake', async () => {
    const f = await fixture()
    fake.profile.mockClear()
    f.observer().assertSendAdmission!()
    await f.complete()
    f.observer().assertSendAdmission!()
    expect(fake.profile).not.toHaveBeenCalled()
    expect(fake.assertDomain).toHaveBeenCalled()
  })
  it.each(['poisoned', 'revoked', 'domain', 'disabled-permit'] as const)(
    'still refuses %s send admission without a full profile recapture',
    async failure => {
      const f = await fixture()
      fake.profile.mockClear()
      if (failure === 'poisoned') f.observer().fault()
      if (failure === 'revoked') f.candidate.revoke()
      if (failure === 'domain')
        fake.assertDomain.mockImplementationOnce(() => {
          throw new Error('original domain refused')
        })
      if (failure === 'disabled-permit') disableProviderSendPermit(f.permit, trustedProviderReconciliation)
      expect(() => f.observer().assertSendAdmission!()).toThrow()
      expect(fake.profile).not.toHaveBeenCalled()
    },
  )
  it('fully revalidates the original profile after stop settles and before candidate evidence is sealed', async () => {
    const f = await fixture()
    await f.complete()
    let resolve!: () => void
    const originalStop = new Promise<void>(done => {
      resolve = done
    })
    await f.cleanup(originalStop)
    fake.profile.mockClear()
    const frozen = f.candidate.freezeCandidate()
    await Promise.resolve()
    expect(fake.profile).not.toHaveBeenCalled()
    resolve()
    expect(await frozen).toHaveProperty('candidateDigest')
    expect(fake.profile).toHaveBeenCalledWith(f.profile)
    expect(fake.profile.mock.invocationCallOrder[0]).toBeLessThan(fake.bind.mock.invocationCallOrder[0])
  })
  it('refuses profile drift at sealing without binding candidate evidence or permitting a second freeze', async () => {
    const f = await fixture()
    await f.complete()
    await f.cleanup()
    fake.profile.mockImplementationOnce(() => {
      throw new Error('frozen profile drift')
    })
    await expect(f.candidate.freezeCandidate()).rejects.toThrow('frozen profile drift')
    expect(fake.bind).not.toHaveBeenCalled()
    await expect(f.candidate.freezeCandidate()).rejects.toThrow(/UNKNOWN/)
  })
  it('fully revalidates at accepted-review enrollment and refuses drift before proof enrollment', async () => {
    const f = await fixture()
    await f.complete()
    await f.cleanup()
    const body = await f.candidate.freezeCandidate()
    fake.profile.mockClear()
    fake.profile.mockImplementationOnce(() => {
      throw new Error('review profile drift')
    })
    expect(() => f.candidate.acceptTaskReview(f.review(body))).toThrow('review profile drift')
    expect(fake.profile).toHaveBeenCalledWith(f.profile)
    expect(() => f.candidate.acceptTaskReview(f.review(body))).toThrow(/UNKNOWN/)
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
  it('refuses profile drift before acquiring an original reconciliation hold', async () => {
    const f = await fixture()
    await f.complete()
    await f.cleanup()
    const body = await f.candidate.freezeCandidate()
    const enrollment = f.candidate.acceptTaskReview(f.review(body))
    const receipt = validateProviderReconciliationEvidence(
      enrollment.senderExcluded,
      enrollment.physicalEvidence,
      enrollment.context,
    )
    const request = {
      observationKey: 'drift-before-custody',
      requestHash: providerReconciliationRequestHash(receipt.identity.intentId, 'drift-before-custody', receipt),
    }
    fake.profile.mockClear()
    fake.profile.mockImplementationOnce(() => {
      throw new Error('custody profile drift')
    })
    expect(() =>
      acquireOriginalNativeOutcomeCustody(
        enrollment.context.source!,
        enrollment.physicalEvidence,
        enrollment.senderExcluded,
        {} as import('@prisma/client').PrismaClient,
        receipt,
        request,
      ),
    ).toThrow('custody profile drift')
    expect(fake.profile).toHaveBeenCalledWith(f.profile)
    expect(fake.hold).not.toHaveBeenCalled()
  })
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
    fake.profile.mockClear()
    const custody = acquireOriginalNativeOutcomeCustody(
      enrollment.context.source!,
      enrollment.physicalEvidence,
      enrollment.senderExcluded,
      client,
      receipt,
      { observationKey: key, requestHash: hash },
    )
    expect(fake.profile).toHaveBeenCalledWith(f.profile)
    fake.profile.mockClear()
    // Canonical transaction callbacks validate the original in-memory custody, never recapture source files.
    custody.verifyLocked(custody.state, [])
    validateProviderReconciliationEvidence(enrollment.senderExcluded, enrollment.physicalEvidence, enrollment.context)
    expect(fake.profile).not.toHaveBeenCalled()
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
      ).toThrow()
    expect(f.raw.snapshot().status).toBe('fenced')
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
  it('refuses out-of-window account metadata and never serializes payload or thrown error properties', async () => {
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
    expect(d.rows()).toEqual([['PASSIVE_OUTCOME_ACCOUNT_UPDATED', 'REFUSED', 'SOURCE_NOTIFICATION_REFUSED']])
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

describe('original thread-start deprecation warning', () => {
  it('accepts the exact known warning once for the original thread before a consuming turn', async () => {
    const d = passiveDiagnostics(),
      f = await fixture({ diagnostics: d.diagnostics })
    const params = { threadId: f.threadId, message: nativeStartupWarning }
    await f.ready(() => expect(() => f.observer().notification('warning', params)).not.toThrow())
    expect(() => f.observer().notification('warning', params)).toThrow(/unreconciled UNKNOWN/)
    expect(d.rows()).toEqual([['PASSIVE_OUTCOME_OTHER', 'REFUSED', 'WARNING_THREAD_DEPRECATION_DUPLICATE']])
  })
  it.each(['foreign thread', 'missing thread', 'foreign text', 'extra field', 'late warning'])(
    'refuses %s without retaining warning contents',
    async variant => {
      const d = passiveDiagnostics(),
        f = await fixture({ diagnostics: d.diagnostics })
      if (variant === 'late warning') await f.complete()
      else await f.ready()
      const params: Record<string, unknown> = { threadId: f.threadId, message: nativeStartupWarning }
      if (variant === 'foreign thread') params.threadId = randomUUID()
      if (variant === 'missing thread') delete params.threadId
      if (variant === 'foreign text') params.message = 'unexpected private warning content'
      if (variant === 'extra field') params.privateData = 'unexpected private warning content'
      expect(() => f.observer().notification('warning', params)).toThrow(/unreconciled UNKNOWN/)
      expect(JSON.stringify(d.rows())).not.toContain('unexpected private warning content')
      if (variant === 'late warning')
        expect(d.rows()).toEqual([['PASSIVE_OUTCOME_OTHER', 'REFUSED', 'WARNING_THREAD_DEPRECATION_OUT_OF_WINDOW']])
    },
  )
  it.each([
    ['Falling back from WebSockets to HTTPS transport. ', 'WARNING_TRANSPORT_FALLBACK'],
    ['Model metadata for `gpt-5.5` not found. Defaulting to fallback metadata; ', 'WARNING_MODEL_METADATA_FALLBACK'],
    ['Code Mode is unavailable because ', 'WARNING_CODE_MODE_UNAVAILABLE'],
    ['Code Mode is enabled in configuration, but model ', 'WARNING_CODE_MODE_UNSUPPORTED'],
    [
      'Agent message-board initialization failed; its tools are unavailable for this runtime.',
      'WARNING_THREAD_BOARD_INITIALIZATION',
    ],
    [
      'Failed to save the conversation transcript; Codex will continue retrying. Error: ',
      'WARNING_TRANSCRIPT_SAVE_FAILED',
    ],
    ['unrecognized content ', 'WARNING_OTHER'],
  ])('refuses a post-turn warning as %s without retaining content', async (prefix, reason) => {
    const d = passiveDiagnostics(),
      f = await fixture({ diagnostics: d.diagnostics })
    await f.complete()
    expect(() =>
      f.observer().notification('warning', { threadId: f.threadId, message: prefix + 'private warning detail' }),
    ).toThrow(/unreconciled UNKNOWN/)
    expect(d.rows()).toEqual([['PASSIVE_OUTCOME_OTHER', 'REFUSED', reason]])
  })
})

describe('native thread UUID versions remain separate from review nonces', () => {
  const nativeV7 = '019a8b91-41d3-7abc-8def-0123456789ab'
  const foreignV7 = '019a8b91-41d3-7abc-8def-0123456789ac'
  const nativeV4 = '00000000-0000-4000-8000-000000000001'
  it.each([nativeV4, nativeV7, '019A8B91-41D3-7ABC-BDEF-0123456789AB'])(
    'accepts correlated native thread reply and notification %s',
    async threadId => {
      const f = await fixture({ threadId, threadNotificationId: threadId, nonce: nativeV4 })
      await f.complete()
      await f.cleanup()
      expect(await f.candidate.freezeCandidate()).toHaveProperty('candidateDigest')
    },
  )
  it('refuses a distinct well-formed foreign v7 notification after the original v7 reply', async () => {
    const f = await fixture({ threadId: nativeV7 })
    await f.ready()
    expect(() =>
      f.observer().notification('thread/started', { thread: { id: foreignV7, ephemeral: true, turns: [] } }),
    ).toThrow()
    expect(f.raw.snapshot().status).toBe('fenced')
  })
  it('refuses a distinct well-formed v7 reply after the original v7 notification', async () => {
    const f = await fixture({ threadId: nativeV7, threadNotificationId: foreignV7 })
    await expect(f.ready()).rejects.toThrow()
    expect(f.raw.snapshot()).toMatchObject({ status: 'fenced', issuedRequests: 3 })
  })
  const malformed = [
    '019a8b91-41d3-6abc-8def-0123456789ab',
    '019a8b91-41d3-8abc-8def-0123456789ab',
    '019a8b91-41d3-7abc-7def-0123456789ab',
    '019a8b91-41d3-7abc-cdef-0123456789ab',
    '019a8b91-41d3-7abc-8def-0123456789ag',
    '019a8b9141d37abc8def0123456789ab',
    '019a8b91-41d3-7abc-8def-0123456789ab ',
    '019a8b91-41d3-7abc-8def-0123456789a',
  ]
  it.each(malformed)('refuses invalid native thread reply %s', async threadId => {
    const f = await fixture({ threadId })
    await expect(f.ready()).rejects.toThrow()
    expect(f.raw.snapshot()).toMatchObject({ status: 'fenced', issuedRequests: 3 })
  })
  it.each(malformed)('refuses invalid native thread notification %s', async threadNotificationId => {
    const f = await fixture({ threadId: nativeV7, threadNotificationId })
    await expect(f.ready()).rejects.toThrow()
    expect(f.raw.snapshot().status).toBe('fenced')
  })
  it('keeps review nonces v4-only even when native thread IDs are valid v7', async () => {
    await expect(fixture({ threadId: nativeV7, nonce: nativeV7 })).rejects.toThrow(/UNKNOWN/)
    expect(fake.claim).not.toHaveBeenCalled()
    expect(fake.initialize).not.toHaveBeenCalled()
  })
})

describe('loss-only passive drain keeps outcome authority permanently excluded', () => {
  it.each([false, true])(
    'continues strict semantic capture after expected ACK rejection, passive fault=%s',
    async actualPassiveFault => {
      const f = await fixture({ loss: true })
      await f.ready()
      consumeProviderSendPermit(f.permit)
      f.observer().beforeRequest('turn/start', { threadId: f.threadId, ...f.envelope })
      const operation = f.raw.request('turn/start', { threadId: f.threadId, ...f.envelope })
      f.observer().operation(operation, 'turn/start')
      fake.loss.mockReturnValue({ proof: { VALIDATED: true, WITHHELD: true, PAUSE_COMMITTED: false, UNPROVEN: false } })
      f.raw.fence('reply_withheld')
      await expect(operation).rejects.toThrow()
      await Promise.resolve()
      await Promise.resolve()
      if (actualPassiveFault) f.observer().fault()
      const notification = () =>
        f.observer().notification('turn/started', { threadId: f.threadId, turn: { id: f.turnId } })
      if (actualPassiveFault) expect(notification).toThrow()
      else {
        expect(notification).not.toThrow()
        expect(() =>
          f.observer().notification('thread/status/changed', {
            threadId: f.threadId,
            status: { type: 'active', activeFlags: ['nonempty'] },
          }),
        ).toThrow()
        expect(() =>
          f.observer().notification('remoteControl/status/changed', { status: 'disabled', environmentId: null }),
        ).toThrow()
      }
      await expect(f.candidate.freezeCandidate()).rejects.toThrow(/UNKNOWN/)
      expect(f.raw.snapshot()).toMatchObject({ status: 'fenced', issuedRequests: 5 })
    },
  )
})
