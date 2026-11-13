import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import {
  captureOfflineProviderBinding,
  captureOfflineProviderJson,
  captureOfflineProviderTimeouts,
  offlineCompositionDigest,
  parseOfflineProviderCompletion,
  type OfflineCompositionReason,
  type OfflineOwnedProviderPort,
  type OfflineProviderBinding,
  type OfflineProviderCompositionReceipt,
  type OfflineProviderTimeouts,
  type OfflineRoleDelivery,
  type OfflineProviderCall,
} from '@/lib/quality-journey/codex-app-server/provider-composition-contract'
import { validateOfflineRequiredMcp } from '@/lib/quality-journey/codex-app-server/readiness-contract'
import { providerIntentPolicy, trustedProviderObservation } from '@/lib/quality-journey/provider-intent-contract'
import { assertProviderReplacementSafe } from './quality-journey-provider-recovery'
import { readInternalWorkerAuthority } from './quality-journey-internal-worker-authority'
import {
  prepareQualityJourneyProviderRun,
  claimQualityJourneyProviderIntent,
  armQualityJourneyProviderIntent,
  writeQualityJourneyProviderTransport,
  recordQualityJourneyProviderAcknowledgement,
  type PrepareQualityJourneyProviderRunInput,
} from './quality-journey-provider-run-service'

class OfflineCompositionFault extends Error {
  constructor(readonly code: OfflineCompositionReason) {
    super(code)
  }
}
const nullCleanup = () =>
  Object.freeze({ status: null, groupExitObserved: null, privateRootRemoved: null, privateRootRetained: null })
function cleanupFacts(value: unknown): OfflineProviderCompositionReceipt['cleanup'] {
  const parsed = z
    .object({
      status: z.enum(['stopped', 'uncertain']),
      groupExitObserved: z.boolean(),
      privateRootRemoved: z.boolean(),
      privateRootRetained: z.boolean(),
    })
    .safeParse(value)
  return parsed.success ? Object.freeze(parsed.data) : nullCleanup()
}
function knownCleanup(facts: OfflineProviderCompositionReceipt['cleanup']) {
  return (
    facts.status === 'stopped' &&
    facts.groupExitObserved === true &&
    facts.privateRootRemoved === true &&
    facts.privateRootRetained === false
  )
}
function nativeId(value: unknown, key: 'thread' | 'turn') {
  return z.object({ [key]: z.object({ id: z.string().regex(/^[A-Za-z0-9._:-]{1,200}$/) }) }).parse(value)[key]
    .id as string
}
function capturePort(port: OfflineOwnedProviderPort): OfflineOwnedProviderPort {
  const keys = [
    'initialize',
    'inspectRequiredMcp',
    'startThread',
    'startTurn',
    'completeTurn',
    'fence',
    'stop',
  ] as const
  const properties = Object.getOwnPropertyDescriptors(port)
  if (
    Reflect.ownKeys(properties).length !== keys.length + 1 ||
    properties.provenance?.value !== 'OFFLINE_FAKE_PORT' ||
    keys.some(key => typeof properties[key]?.value !== 'function')
  )
    throw new OfflineCompositionFault('ACQUISITION_FAILED')
  return Object.freeze(
    Object.fromEntries(['provenance', ...keys].map(key => [key, properties[key].value])),
  ) as OfflineOwnedProviderPort
}

/** Complete synthetic ownership/authority pipeline. Neither production guard registers this sender. */
export function createOfflineQualityJourneyProviderComposition(
  options: {
    binding: OfflineProviderBinding
    input: PrepareQualityJourneyProviderRunInput
    envelope: readonly Record<string, unknown>[]
    delivery: OfflineRoleDelivery
    acquire(
      callbacks: Readonly<{ binding: OfflineProviderBinding; onFault: () => void }>,
    ): Promise<OfflineOwnedProviderPort>
    timeouts?: OfflineProviderTimeouts
  },
  client: PrismaClient,
) {
  const binding = captureOfflineProviderBinding(options.binding)
  const input = structuredClone(options.input)
  const envelope = captureOfflineProviderJson(options.envelope)
  const delivery = Object.freeze({
    profileDigest: options.delivery.profileDigest,
    invoke: options.delivery.invoke,
    readCommitted: options.delivery.readCommitted,
  })
  const acquire = options.acquire
  const timeouts = captureOfflineProviderTimeouts(options.timeouts)
  if (
    input.configurationDigest !== binding.configurationDigest ||
    delivery.profileDigest !== binding.roleProfileDigest ||
    typeof acquire !== 'function' ||
    typeof delivery.invoke !== 'function'
  )
    throw new OfflineCompositionFault('BINDING_MISMATCH')
  if (JSON.stringify(envelope).includes(input.assignmentSecret)) throw new OfflineCompositionFault('BINDING_MISMATCH')
  input.envelopeDigest = offlineCompositionDigest({
    input: envelope,
    model: providerIntentPolicy.model,
    effort: providerIntentPolicy.reasoning,
  })
  const abort = new AbortController()
  let closed = false,
    started = false,
    acquisitionEntered = false,
    fenceFailed = false
  let reason: OfflineCompositionReason = 'NONE'
  let port: OfflineOwnedProviderPort | undefined
  let armed: Awaited<ReturnType<typeof armQualityJourneyProviderIntent>> | undefined
  let armEntered = false
  let preparedIntentId: string | null = null
  let threadId: string | null = null,
    turnId: string | null = null
  let authorityIdentity: string | undefined
  let fenceAttempted = false
  let stopFlight: Promise<OfflineProviderCompositionReceipt['cleanup']> | undefined
  let flight: Promise<OfflineProviderCompositionReceipt> | undefined
  let resolveFlight: (value: OfflineProviderCompositionReceipt) => void
  const accepted = new Set<string>()
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let expiryTimer: ReturnType<typeof setTimeout> | undefined
  let heartbeatFlight: Promise<void> | undefined
  let authorityExpiresAt: number | undefined
  const phases: {
    queue: number | null
    humanWait: number | null
    readiness: number | null
    dispatch: number | null
    acceptance: number | null
    cleanup: number | null
  } = { queue: null, humanWait: null, readiness: null, dispatch: null, acceptance: null, cleanup: null }

  function shared() {
    flight ??= new Promise(resolve => {
      resolveFlight = resolve
    })
    return flight
  }
  function assertOpen() {
    if (closed) throw new OfflineCompositionFault(reason === 'NONE' ? 'CANCELLED' : reason)
  }
  function close(code: OfflineCompositionReason) {
    if (!closed) {
      closed = true
      reason = code
      abort.abort()
    }
    fenceOriginal()
    if (port) void originalStop()
  }
  async function bounded<T>(operation: () => Promise<T>, milliseconds: number, allowClosed = false): Promise<T> {
    if (!allowClosed) assertOpen()
    return new Promise<T>((resolve, reject) => {
      let settled = false
      const finish = (value: T | undefined, error?: OfflineCompositionFault) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        abort.signal.removeEventListener('abort', cancelled)
        if (error) reject(error)
        else resolve(value as T)
      }
      const cancelled = () => finish(undefined, new OfflineCompositionFault(reason === 'NONE' ? 'CANCELLED' : reason))
      const timer = setTimeout(() => finish(undefined, new OfflineCompositionFault('TIMEOUT')), milliseconds)
      if (!allowClosed) abort.signal.addEventListener('abort', cancelled, { once: true })
      try {
        Promise.resolve(operation()).then(
          value => finish(value),
          () => finish(undefined, new OfflineCompositionFault('SEND_FAILED')),
        )
      } catch {
        finish(undefined, new OfflineCompositionFault('SEND_FAILED'))
      }
    })
  }
  function fenceOriginal() {
    if (!port || fenceAttempted) return
    fenceAttempted = true
    try {
      port.fence()
    } catch {
      fenceFailed = true
    }
  }
  function originalStop() {
    if (!port) return Promise.resolve(nullCleanup())
    if (!stopFlight) {
      let resolveCleanup!: (facts: OfflineProviderCompositionReceipt['cleanup']) => void
      stopFlight = new Promise(resolve => {
        resolveCleanup = resolve
      })
      fenceOriginal()
      const original = port.stop
      void bounded(original, timeouts.cleanupMs, true).then(
        value => {
          try {
            resolveCleanup(cleanupFacts(value))
          } catch {
            resolveCleanup(nullCleanup())
          }
        },
        () => resolveCleanup(nullCleanup()),
      )
    }
    return stopFlight
  }
  async function authority() {
    assertOpen()
    const current = await client.$transaction(async tx => {
      const current = await readInternalWorkerAuthority(input, tx)
      if (!armEntered) await assertProviderReplacementSafe(input, tx)
      return current
    })
    assertOpen()
    const identity = offlineCompositionDigest({
      inputHash: current.item.inputHash,
      scope: current.item.authorizationScopeJson,
      authorizationId: current.authorizationId,
      roleContractDigest: current.roleContractDigest,
      cycleId: current.journey.activeCycleId,
    })
    if (authorityIdentity && authorityIdentity !== identity) throw new OfflineCompositionFault('BINDING_MISMATCH')
    authorityIdentity = identity
    authorityExpiresAt = Date.parse(current.expiresAt)
    if (
      JSON.parse(current.journey.unresolvedQuestionIdsJson).length ||
      JSON.parse(current.journey.blockerIdsJson).length
    )
      throw new OfflineCompositionFault('HUMAN_WAIT')
    return current
  }
  async function write<T>(consume: boolean, callback: () => Promise<T>): Promise<T> {
    assertOpen()
    if (!armed?.permit) throw new OfflineCompositionFault('AMBIGUOUS_ARM')
    const box = await writeQualityJourneyProviderTransport(
      { ...input, permit: armed.permit, consume },
      () => {
        assertOpen()
        return callback()
      },
      client,
    )
    const result = await bounded(() => box.reply, timeouts.acknowledgementMs)
    assertOpen()
    return result
  }
  async function readiness() {
    await authority()
    const start = performance.now()
    acquisitionEntered = true
    const original = Promise.resolve(acquire(Object.freeze({ binding, onFault: () => close('SEND_FAILED') }))).then(
      value => {
        port = capturePort(value)
        if (closed) void originalStop()
        return port
      },
    )
    await bounded(() => original, timeouts.acquisitionMs)
    await authority()
    const initialized = await bounded(() => port!.initialize(abort.signal), timeouts.initializationMs)
    assertOpen()
    const parsed = z
      .object({ status: z.literal('INITIALIZED'), binding: z.unknown() })
      .strict()
      .parse(initialized)
    if (offlineCompositionDigest(parsed.binding) !== offlineCompositionDigest(binding))
      throw new OfflineCompositionFault('BINDING_MISMATCH')
    await authority()
    const mcp = await bounded(() => port!.inspectRequiredMcp(abort.signal), timeouts.requiredMcpMs)
    assertOpen()
    if (validateOfflineRequiredMcp(mcp, binding.requiredMcpIds) !== 'NONE')
      throw new OfflineCompositionFault('READINESS_REFUSED')
    await authority()
    phases.readiness = performance.now() - start
  }
  async function arm() {
    const prepared = await prepareQualityJourneyProviderRun(input, client)
    preparedIntentId = prepared.intent.id
    assertOpen()
    const request = { ...input, intentId: prepared.intent.id, claimOwner: `offline:${randomUUID()}` }
    const claimed = await claimQualityJourneyProviderIntent(request, client)
    assertOpen()
    armEntered = true
    armed = await armQualityJourneyProviderIntent({ ...request, claimEpoch: claimed.intent.claimEpoch }, client)
    if (armed.replayed || !armed.permit) throw new OfflineCompositionFault('AMBIGUOUS_ARM')
    assertOpen()
  }
  async function dispatch() {
    const start = performance.now()
    threadId = nativeId(
      await write(false, () =>
        port!.startThread(
          Object.freeze({
            model: providerIntentPolicy.model,
            effort: providerIntentPolicy.reasoning,
            approvalPolicy: 'never',
            sandbox: 'read-only',
          }),
          abort.signal,
        ),
      ),
      'thread',
    )
    turnId = nativeId(
      await write(true, () =>
        port!.startTurn(
          Object.freeze({
            threadId: threadId!,
            input: envelope,
            model: providerIntentPolicy.model,
            effort: providerIntentPolicy.reasoning,
          }),
          abort.signal,
        ),
      ),
      'turn',
    )
    await recordQualityJourneyProviderAcknowledgement(
      {
        intentId: armed!.intent.id,
        sendBoundaryId: armed!.intent.sendBoundaryId!,
        providerNamespace: input.providerNamespace,
        threadId,
        turnId,
        observationKey: `offline:${armed!.intent.id}:ack`,
        evidenceDigest: offlineCompositionDigest({ threadId, turnId, binding }),
      },
      trustedProviderObservation,
      client,
    )
    assertOpen()
    phases.dispatch = performance.now() - start
  }
  function monitorAuthority() {
    if (authorityExpiresAt !== undefined)
      expiryTimer = setTimeout(() => close('AUTHORITY_REFUSED'), Math.max(1, authorityExpiresAt - Date.now()))
    heartbeat = setInterval(() => {
      if (closed || heartbeatFlight) return
      heartbeatFlight = authority()
        .then(
          () => undefined,
          () => close('AUTHORITY_REFUSED'),
        )
        .finally(() => {
          heartbeatFlight = undefined
        })
    }, providerIntentPolicy.heartbeatSeconds * 1000)
  }
  async function deliverCall(call: OfflineProviderCall) {
    assertOpen()
    let receipt
    try {
      receipt = await bounded(
        () => delivery.invoke(call),
        Math.min(timeouts.completionMs, Math.max(1, armed!.intent.turnDueAt!.getTime() - Date.now())),
      )
    } catch {
      receipt = delivery.readCommitted
        ? await bounded(() => delivery.readCommitted!(call), timeouts.acknowledgementMs)
        : null
      if (!receipt) throw new OfflineCompositionFault('DELIVERY_REFUSED')
    }
    assertOpen()
    if (receipt.accepted && receipt.acceptanceDigest) accepted.add(receipt.acceptanceDigest)
  }
  async function deliver() {
    const result = parseOfflineProviderCompletion(
      await bounded(
        () => port!.completeTurn(Object.freeze({ threadId: threadId!, turnId: turnId! }), abort.signal),
        Math.min(timeouts.completionMs, Math.max(1, armed!.intent.turnDueAt!.getTime() - Date.now())),
      ),
    )
    assertOpen()
    if (result.threadId !== threadId || result.turnId !== turnId)
      throw new OfflineCompositionFault('CORRELATION_MISMATCH')
    const start = performance.now()
    for (const call of result.calls) await deliverCall(call)
    if (!accepted.size) throw new OfflineCompositionFault('DELIVERY_REFUSED')
    phases.acceptance = performance.now() - start
  }
  function acceptedWithCleanup(cleanup: OfflineProviderCompositionReceipt['cleanup']) {
    return accepted.size > 0 && reason === 'NONE' && knownCleanup(cleanup) && !fenceFailed
  }
  function classifyOutcome(
    cleanup: OfflineProviderCompositionReceipt['cleanup'],
  ): OfflineProviderCompositionReceipt['outcome'] {
    if (acceptedWithCleanup(cleanup)) return 'ACCEPTED_OFFLINE'
    if (reason === 'HUMAN_WAIT' && !armed) return 'PARKED_HUMAN_WAIT'
    if (armEntered || fenceFailed) return 'UNKNOWN'
    if (acquisitionEntered && !knownCleanup(cleanup)) return 'UNKNOWN'
    return 'REFUSED'
  }
  async function finish() {
    closed = true
    abort.abort()
    clearInterval(heartbeat)
    clearTimeout(expiryTimer)
    const start = performance.now()
    const cleanup = await originalStop()
    phases.cleanup = port ? performance.now() - start : null
    const outcome = classifyOutcome(cleanup)
    resolveFlight(
      Object.freeze({
        provenance: 'OFFLINE_FAKE_PORT',
        runtimeQualified: false,
        observedNativeTuple: null,
        outcome,
        reason: knownCleanup(cleanup) || !acquisitionEntered ? reason : 'CLEANUP_UNCERTAIN',
        attemptId: input.attemptId,
        intentId: armed?.intent.id ?? preparedIntentId,
        threadId,
        turnId,
        acceptedArtifactDigests: Object.freeze([...accepted]),
        cleanup,
        phasesMs: Object.freeze({ ...phases }),
        modelTokens: null,
        cost: null,
        usageStatus: 'UNQUALIFIED',
      }),
    )
  }
  async function execute() {
    try {
      await readiness()
      await arm()
      await dispatch()
      monitorAuthority()
      await deliver()
    } catch (error) {
      close(error instanceof OfflineCompositionFault ? error.code : armEntered ? 'AMBIGUOUS_ARM' : 'AUTHORITY_REFUSED')
    }
    await finish()
  }
  return Object.freeze({
    start() {
      const result = shared()
      if (!started && !closed) {
        started = true
        void execute()
      }
      return result
    },
    cancel() {
      const result = shared()
      close('CANCELLED')
      if (!started) {
        started = true
        void finish()
      }
      return result
    },
    snapshot() {
      return Object.freeze({ closed, reason, acquisitionEntered, armed: Boolean(armed), threadId, turnId })
    },
  })
}
