import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { PrismaClient } from '@prisma/client'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { launchOwnedFixtureChild } from '@/lib/quality-journey/codex-app-server/owned-child'
import { providerIntentPolicy, trustedProviderObservation } from '@/lib/quality-journey/provider-intent-contract'
import { ServiceError } from '@/services/shared/errors'
import {
  prepareQualityJourneyProviderRun,
  claimQualityJourneyProviderIntent,
  armQualityJourneyProviderIntent,
  writeQualityJourneyProviderTransport,
  recordQualityJourneyProviderAcknowledgement,
  type PrepareQualityJourneyProviderRunInput,
} from './quality-journey-provider-run-service'

type OriginalStartState = 'NOT_CALLED' | 'PENDING' | 'FULFILLED' | 'REJECTED'
type SupervisionState = 'startup' | 'readiness' | 'active' | 'draining' | 'stopped' | 'uncertain'
type Child = Awaited<ReturnType<typeof launchOwnedFixtureChild>>
type Armed = Awaited<ReturnType<typeof armQualityJourneyProviderIntent>>
type FixtureOptions = {
  fixturePath: string
  fixtureArgs?: string[]
  requestTimeoutMs?: number
  turnAcknowledgementTimeoutMs?: number
}
const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
function handle(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.:/-]{1,200}$/.test(value))
    throw new ServiceError('Malformed provider handle.', 'CONFLICT')
  return value
}
function nativeHandle(value: unknown, key: 'thread' | 'turn') {
  if (!record(value) || !record(value[key])) throw new ServiceError('Malformed provider reply.', 'CONFLICT')
  return handle(value[key].id)
}

/** A server-owned adapter is code, never a model-supplied configuration or authority grant. */
export const trustedJourneyProcessAdapter: unique symbol = Symbol('trusted Journey owned process adapter')
export type JourneyOwnedProcessAdapter = {
  capability: typeof trustedJourneyProcessAdapter
  configurationDigest: string
  input: readonly Record<string, unknown>[]
  requestTimeoutMs?: number
  turnAcknowledgementTimeoutMs?: number
  launch: (callbacks: {
    transportId: string
    onNotification: (method: string, params: Record<string, unknown>) => void
    onFault: (reason: string) => void
  }) => Promise<Child>
  validateReadiness: (result: unknown) => boolean
}

/** Internal supervision core; no CLI, route, MCP or scheduler registers this sender. */
export function createQualityJourneyProcessSupervisor(
  input: PrepareQualityJourneyProviderRunInput,
  adapter: JourneyOwnedProcessAdapter,
  client: PrismaClient,
) {
  if (adapter.capability !== trustedJourneyProcessAdapter)
    throw new ServiceError('Trusted owned process adapter is required.', 'UNAUTHORIZED')
  // Capture trusted bindings/functions; callers cannot mutate a delayed sender's identity.
  const binding = structuredClone(input)
  const launch = adapter.launch
  const validateReadiness = adapter.validateReadiness
  const turnAcknowledgementTimeoutMs = adapter.turnAcknowledgementTimeoutMs
  const envelope = {
    input: structuredClone(adapter.input),
    model: providerIntentPolicy.model,
    effort: providerIntentPolicy.reasoning,
  }
  binding.configurationDigest = adapter.configurationDigest
  binding.envelopeDigest = digest(envelope)
  const transportId = randomUUID()
  let state: SupervisionState = 'startup'
  let originalStartState: OriginalStartState = 'NOT_CALLED'
  let childLaunchEntered = false
  let fenced = false
  let reason: string | null = null
  let child: Child | undefined
  let launchFlight: Promise<Child> | undefined
  let armed: Armed | undefined
  let threadId: string | undefined
  let turnId: string | undefined
  let startFlight: Promise<ReturnType<typeof snapshot>> | undefined
  let stopFlight: Promise<ReturnType<typeof snapshot>> | undefined
  let poll: ReturnType<typeof setInterval> | undefined
  let turnTimer: ReturnType<typeof setTimeout> | undefined
  let heartbeatFlight: Promise<void> | undefined
  let completed = false
  let threadStartEntered = false
  let turnStartEntered = false
  const events = new Map<string, string>()
  let observationSequence = 0
  let cleanup: Awaited<ReturnType<Child['stop']>> | undefined

  function snapshot() {
    return Object.freeze({
      state,
      originalStartState,
      childLaunchEntered,
      fenced,
      reason,
      transportId,
      journeyId: binding.journeyId,
      targetProjectId: binding.targetProjectId,
      sessionId: binding.coordinatorSessionId,
      coordinatorGeneration: binding.coordinatorGeneration,
      attemptId: binding.attemptId,
      assignmentId: binding.assignmentId,
      assignmentGeneration: binding.assignmentGeneration,
      providerRunId: armed?.run.id,
      intentId: armed?.intent.id,
      sendBoundaryId: armed?.intent.sendBoundaryId,
      claimEpoch: armed?.intent.claimEpoch,
      providerNamespace: binding.providerNamespace,
      threadId,
      turnId,
      completed,
      requestSequence: child?.transport.snapshot().issuedRequests,
      cleanup,
      transport: child?.transport.snapshot(),
      providerTerminationProven: false as const,
      slotReleased: false as const,
    })
  }

  async function observe(kind: string) {
    if (!armed?.intent.sendBoundaryId) return
    const observationKey = `transport:${transportId}:${++observationSequence}:${kind}`
    // Local launch/start diagnostics do not change the durable observation contract.
    const { childLaunchEntered: _childLaunchEntered, originalStartState: _originalStartState, ...observed } = snapshot()
    const identity = { ...observed, cleanup: undefined, transport: undefined }
    await client.qualityJourneyProviderObservation.create({
      data: {
        id: `qjpo_${randomUUID()}`,
        intentId: armed.intent.id,
        observationKey,
        kind: `TRANSPORT_${kind}`,
        sendBoundaryId: armed.intent.sendBoundaryId,
        providerNamespace: binding.providerNamespace,
        requestHash: digest({ observationKey, identity }),
        evidenceDigest: digest(identity),
        threadId,
        turnId,
      },
    })
  }

  // This gate closes before awaiting any persistence or owned drain operation.
  function fence(code: string) {
    if (!fenced) {
      fenced = true
      reason = code
      child?.transport.fence(code)
    }
    if (poll) clearInterval(poll)
    if (turnTimer) clearTimeout(turnTimer)
  }

  async function joinOriginalLaunch(originalLaunch: Promise<Child>) {
    try {
      child = await originalLaunch
    } catch {
      /* launch failure remains uncertain */
    }
  }

  async function stop(code = 'CANCELLED') {
    fence(code)
    stopFlight ??= (async () => {
      state = 'draining'
      // A concurrent launch may still be completing. start checks the closed gate
      // before any writes and joins this same owned cleanup path below.
      if (launchFlight && !child) {
        await joinOriginalLaunch(launchFlight)
      }
      // Join the original complete heartbeat chain after fencing admission.
      // Its rejection handler calls fault without awaiting this stop flight.
      const originalHeartbeat = heartbeatFlight
      if (originalHeartbeat) await originalHeartbeat
      if (child) cleanup = await child.stop()
      state = child && cleanup?.status === 'stopped' ? 'stopped' : 'uncertain'
      await observe(state === 'stopped' ? 'DRAINED_UNCERTAIN' : 'FENCED')
      return snapshot()
    })()
    return stopFlight
  }

  function fault(code: string) {
    fence(code)
    void stop(code).catch(() => {
      state = 'uncertain'
    })
  }

  function threadEvent(params: Record<string, unknown>) {
    if (!threadStartEntered) throw new Error('premature thread event')
    const seen = nativeHandle(params, 'thread')
    if (threadId && threadId !== seen) throw new Error('correlation')
    const previous = events.get('thread')
    if (previous && previous !== seen) throw new Error('correlation')
    events.set('thread', seen)
  }

  function turnEvent(params: Record<string, unknown>) {
    if (!turnStartEntered) throw new Error('premature turn event')
    const seenThread = handle(params.threadId)
    const seenTurn = nativeHandle(params, 'turn')
    if (!threadId || seenThread !== threadId) throw new Error('correlation')
    if (turnId && turnId !== seenTurn) throw new Error('correlation')
    const previous = events.get('turn')
    if (previous && previous !== seenTurn) throw new Error('correlation')
    events.set('turn', seenTurn)
  }

  function completionEvent(params: Record<string, unknown>) {
    turnEvent(params)
    if (!record(params.turn) || !['completed', 'failed', 'interrupted'].includes(String(params.turn.status)))
      throw new Error('malformed completion')
    completed = true
    // Persist response correlation before processing early completion.
    if (state === 'active')
      void stop('LOGICAL_COMPLETION').catch(() => {
        state = 'uncertain'
      })
  }

  const notificationHandlers: Record<string, (params: Record<string, unknown>) => void> = {
    'thread/started': threadEvent,
    'turn/started': turnEvent,
    'turn/completed': completionEvent,
  }
  function notification(method: string, params: unknown) {
    if (fenced || !Object.hasOwn(notificationHandlers, method)) return
    try {
      if (!record(params)) throw new Error('malformed')
      notificationHandlers[method](params)
    } catch {
      fault('MALFORMED_EVENT')
    }
  }

  async function write<T>(consume: boolean, send: () => Promise<T>) {
    if (fenced || !armed?.permit) throw new ServiceError('Owned sender is fenced.', 'CONFLICT')
    const box = await writeQualityJourneyProviderTransport(
      { ...binding, permit: armed.permit, consume },
      () => {
        if (fenced) return Promise.reject(new ServiceError('Owned sender is fenced.', 'CONFLICT'))
        return send()
      },
      client,
    )
    return box.reply
  }

  async function armInitialIntent() {
    if (fenced) throw new Error('fenced before preparation')
    const prepared = await prepareQualityJourneyProviderRun(binding, client)
    if (fenced) throw new Error('fenced before claim')
    const request = { ...binding, intentId: prepared.intent.id, claimOwner: `m05:${transportId}` }
    const claim = await claimQualityJourneyProviderIntent(request, client)
    if (fenced) throw new Error('fenced before arm')
    armed = await armQualityJourneyProviderIntent({ ...request, claimEpoch: claim.intent.claimEpoch }, client)
    if (!armed.permit || armed.replayed) throw new ServiceError('Ambiguous start cannot be replayed.', 'CONFLICT')
    if (fenced) throw new Error('fenced')
    await observe('STARTUP')
    if (fenced) throw new Error('fenced before launch')
  }

  async function readyOwnedChild() {
    if (fenced) throw new Error('fenced before child launch')
    if (!armed) throw new Error('missing owned intent')
    childLaunchEntered = true
    launchFlight = launch({ transportId, onNotification: notification, onFault: fault })
    child = await launchFlight
    if (fenced) {
      cleanup = await child.stop()
      state = cleanup.status === 'stopped' ? 'stopped' : 'uncertain'
      throw new Error('fenced during launch')
    }
    state = 'readiness'
    const initialized = await write(false, () =>
      child!.transport.request('initialize', {
        clientInfo: { name: 'appraise-journey-supervisor', version: '1' },
        capabilities: { experimentalApi: true },
      }),
    )
    if (!validateReadiness(initialized)) throw new Error('owned process readiness failed')
    await write(false, () => child!.transport.notifyInitialized())
  }

  async function readyNativeThread() {
    if (!armed) throw new Error('missing owned intent')
    // Initial intent only. M04 never manufactures a resume handle after a crash.
    const method = armed.run.threadId ? 'thread/resume' : 'thread/start'
    const thread = await write(false, () => {
      threadStartEntered = true
      return child!.transport.request(method, {
        ...(armed!.run.threadId ? { threadId: armed!.run.threadId } : {}),
        model: providerIntentPolicy.model,
        approvalPolicy: 'never',
        sandbox: 'read-only',
      })
    })
    threadId = nativeHandle(thread, 'thread')
    if (
      (armed.run.threadId && threadId !== armed.run.threadId) ||
      (events.has('thread') && events.get('thread') !== threadId)
    )
      throw new Error('thread mismatch')
    await observe('READY')
  }

  async function startOwnedTurn() {
    if (!armed || !threadId) throw new Error('missing owned thread')
    const remaining = armed.intent.turnDueAt!.getTime() - Date.now()
    if (remaining <= 0) throw new Error('expired')
    turnTimer = setTimeout(() => fault('TURN_DEADLINE'), remaining)
    const turn = await write(true, () => {
      turnStartEntered = true
      return child!.transport.request(
        'turn/start',
        {
          threadId,
          ...envelope,
        },
        Math.max(
          1,
          Math.min(
            providerIntentPolicy.acknowledgementSeconds * 1000,
            turnAcknowledgementTimeoutMs ?? providerIntentPolicy.acknowledgementSeconds * 1000,
            armed!.intent.acknowledgementDueAt!.getTime() - Date.now(),
          ),
        ),
      )
    })
    turnId = nativeHandle(turn, 'turn')
    if (events.has('turn') && events.get('turn') !== turnId) throw new Error('turn mismatch')
    // Operational evidence can be retained after a late fence; it cannot restore authority.
    await recordQualityJourneyProviderAcknowledgement(
      {
        intentId: armed.intent.id,
        sendBoundaryId: armed.intent.sendBoundaryId!,
        providerNamespace: binding.providerNamespace,
        threadId,
        turnId,
        observationKey: `transport:${transportId}:ack`,
        evidenceDigest: digest({ transportId, threadId, turnId }),
      },
      trustedProviderObservation,
      client,
    )
    if (fenced) throw new Error('fenced after reply')
  }

  async function activateAndMonitor() {
    if (fenced) return stop(reason ?? 'FENCED')
    state = 'active'
    await observe('ACTIVE')
    if (fenced) return snapshot()
    poll = setInterval(() => {
      if (heartbeatFlight || fenced) return
      const flight = write(false, () => Promise.resolve())
        .catch(() => {
          fault('AUTHORITY_REVOKED')
        })
        .finally(() => {
          if (heartbeatFlight === flight) heartbeatFlight = undefined
        })
      heartbeatFlight = flight
    }, providerIntentPolicy.heartbeatSeconds * 1000)
    if (completed) await stop('LOGICAL_COMPLETION')
    return snapshot()
  }

  async function run() {
    try {
      await armInitialIntent()
      await readyOwnedChild()
      await readyNativeThread()
      await startOwnedTurn()
      return await activateAndMonitor()
    } catch (error) {
      await stop(reason ?? 'START_FAILED')
      throw error
    }
  }

  return Object.freeze({
    start() {
      if (!startFlight) {
        originalStartState = 'PENDING'
        startFlight = run()
        // Observe the original native Promise without replacing it or its fulfillment value.
        void startFlight.then(
          () => {
            originalStartState = 'FULFILLED'
            return undefined
          },
          () => {
            originalStartState = 'REJECTED'
            return undefined
          },
        )
      }
      return startFlight
    },
    cancel() {
      return stop('CANCELLED')
    },
    snapshot,
  })
}

/** Explicit local fixture adapter. Its success supplies no production qualification. */
export function createQualityJourneyFixtureSupervisor(
  input: PrepareQualityJourneyProviderRunInput,
  options: FixtureOptions,
  client: PrismaClient,
) {
  const launchOptions = structuredClone(options)
  return createQualityJourneyProcessSupervisor(
    input,
    {
      capability: trustedJourneyProcessAdapter,
      configurationDigest: digest({
        kind: 'OWNED_FIXTURE_V1',
        scriptDigest: digest(readFileSync(launchOptions.fixturePath).toString('utf8')),
        args: launchOptions.fixtureArgs ?? [],
        requestTimeoutMs: launchOptions.requestTimeoutMs ?? 5_000,
        turnAcknowledgementTimeoutMs: launchOptions.turnAcknowledgementTimeoutMs ?? 60_000,
        environmentPolicy: 'EMPTY_PRIVATE_HOME_V1',
        policy: providerIntentPolicy,
      }),
      input: [{ type: 'text', text: 'Owned M05 fixture. No provider or lifecycle authority.' }],
      requestTimeoutMs: launchOptions.requestTimeoutMs,
      turnAcknowledgementTimeoutMs: launchOptions.turnAcknowledgementTimeoutMs,
      launch: callbacks => launchOwnedFixtureChild({ ...launchOptions, ...callbacks }),
      validateReadiness: value =>
        record(value) && value.isolationChecked === true && typeof value.userAgent === 'string',
    },
    client,
  )
}

/** Future qualified production wiring must be separately authorized and implemented. */
export function startQualityJourneyProductionProvider(): never {
  throw new ServiceError('Production app-server dispatch remains blocked.', 'CONFLICT')
}
