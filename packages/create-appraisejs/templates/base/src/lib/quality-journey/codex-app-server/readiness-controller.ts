import {
  captureOfflineReadiness,
  validateOfflineInitialization,
  validateOfflineRequiredMcp,
  type OfflineCleanupFacts,
  type OfflineReadinessPort,
  type OfflineReadinessReason,
  type OfflineReadinessReceipt,
  type OfflineReadinessSnapshot,
  type OfflineReadinessState,
  type ReadinessOptions,
} from './readiness-contract'

type Observation = { kind: 'VALUE'; value: unknown } | { kind: 'REJECTED' | 'TIMEOUT' | 'ABORTED' }

/** Observes one original operation without giving late settlement any state-changing callback. */
function observe(operation: () => Promise<unknown>, timeoutMs: number, signal?: AbortSignal): Promise<Observation> {
  return new Promise(resolve => {
    let settled = false
    const finish = (observation: Observation) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      resolve(observation)
    }
    const abort = () => finish({ kind: 'ABORTED' })
    const timer = setTimeout(() => finish({ kind: 'TIMEOUT' }), timeoutMs)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) return abort()
    try {
      Promise.resolve(operation()).then(
        value => finish({ kind: 'VALUE', value }),
        () => finish({ kind: 'REJECTED' }),
      )
    } catch {
      finish({ kind: 'REJECTED' })
    }
  })
}

const unobservedCleanup = (): OfflineCleanupFacts =>
  Object.freeze({ status: null, groupExitObserved: null, privateRootRemoved: null, privateRootRetained: null })

function ownCleanupValues(value: unknown): unknown[] | null {
  if (!value || typeof value !== 'object') return null
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const keys = ['status', 'groupExitObserved', 'privateRootRemoved', 'privateRootRetained']
    if (keys.some(key => !descriptors[key] || !('value' in descriptors[key]))) return null
    return keys.map(key => descriptors[key].value)
  } catch {
    return null
  }
}

function booleanCleanupFact(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function sanitizedCleanupFacts(value: unknown): OfflineCleanupFacts {
  const values = ownCleanupValues(value)
  if (!values) return unobservedCleanup()
  const [status, groupExitObserved, privateRootRemoved, privateRootRetained] = values
  return Object.freeze({
    status: status === 'stopped' || status === 'uncertain' ? status : null,
    groupExitObserved: booleanCleanupFact(groupExitObserved),
    privateRootRemoved: booleanCleanupFact(privateRootRemoved),
    privateRootRetained: booleanCleanupFact(privateRootRetained),
  })
}

function contradictoryCleanup(facts: OfflineCleanupFacts): boolean {
  if (facts.privateRootRemoved === true && facts.privateRootRetained === true) return true
  if (facts.status !== 'stopped') return false
  return facts.groupExitObserved === false || facts.privateRootRemoved === false || facts.privateRootRetained === true
}

function cleanupObservation(value: unknown): { facts: OfflineCleanupFacts; reason: OfflineReadinessReason } {
  const facts = sanitizedCleanupFacts(value)
  if (contradictoryCleanup(facts)) return { facts, reason: 'CLEANUP_CONTRADICTORY' }
  const complete =
    facts.status === 'stopped' &&
    facts.groupExitObserved === true &&
    facts.privateRootRemoved === true &&
    facts.privateRootRetained === false
  return { facts, reason: complete ? 'NONE' : 'CLEANUP_UNCERTAIN' }
}

/** Offline orchestration only: receives an already-owned fake port and acquires no resource. */
export function createOfflineReadinessController(options: ReadinessOptions, port: OfflineReadinessPort) {
  const captured = captureOfflineReadiness(options, port)
  const abortController = new AbortController()
  let state: OfflineReadinessState = 'IDLE'
  let closed = false
  let started = false
  let finalizing = false
  let reason: OfflineReadinessReason = 'NONE'
  let initializationComplete = false
  let requiredMcpComplete = false
  let fenceOutcome: OfflineReadinessReceipt['fenceOutcome'] = 'NOT_ATTEMPTED'
  let flight: Promise<OfflineReadinessReceipt> | undefined
  let resolveFlight: (receipt: OfflineReadinessReceipt) => void

  function sharedFlight() {
    flight ??= new Promise<OfflineReadinessReceipt>(resolve => {
      resolveFlight = resolve
    })
    return flight
  }

  function finalize() {
    if (finalizing) return
    finalizing = true
    closed = true
    abortController.abort()
    state = 'FENCING'
    try {
      captured.fence()
      fenceOutcome = 'SUCCEEDED'
    } catch {
      fenceOutcome = 'UNKNOWN'
      reason = 'FENCE_FAILED'
    }
    state = 'STOPPING'
    void observe(captured.stop, captured.options.cleanupTimeoutMs).then(observation => {
      let cleanup = unobservedCleanup()
      if (observation.kind === 'VALUE') {
        const result = cleanupObservation(observation.value)
        cleanup = result.facts
        if (result.reason !== 'NONE') reason = result.reason
      } else reason = observation.kind === 'TIMEOUT' ? 'CLEANUP_TIMEOUT' : 'CLEANUP_REJECTED'
      const uncertain = reason.startsWith('CLEANUP_') || fenceOutcome !== 'SUCCEEDED'
      state = 'FINALIZED'
      resolveFlight(
        Object.freeze({
          provenance: 'OFFLINE_FAKE_PORT',
          runtimeQualified: false,
          observedNativeTuple: null,
          binding: captured.options.binding,
          requiredMcpIds: captured.options.requiredMcpIds,
          outcome: uncertain ? 'UNKNOWN' : reason === 'NONE' ? 'OFFLINE_CONTRACT_SATISFIED' : 'REFUSED',
          reason,
          initializationComplete,
          requiredMcpComplete,
          fenceOutcome,
          cleanup,
        }),
      )
    })
  }

  async function probe(
    operation: (signal: AbortSignal) => Promise<unknown>,
    timeoutMs: number,
    phase: 'INITIALIZATION' | 'MCP',
  ): Promise<Observation> {
    const observation = await observe(() => operation(abortController.signal), timeoutMs, abortController.signal)
    if (closed) return { kind: 'ABORTED' }
    if (observation.kind === 'REJECTED')
      reason = phase === 'INITIALIZATION' ? 'INITIALIZATION_REJECTED' : 'MCP_REJECTED'
    if (observation.kind === 'TIMEOUT') reason = phase === 'INITIALIZATION' ? 'INITIALIZATION_TIMEOUT' : 'MCP_TIMEOUT'
    return observation
  }

  async function execute() {
    state = 'INITIALIZING'
    const initialized = await probe(captured.initialize, captured.options.initializationTimeoutMs, 'INITIALIZATION')
    if (closed) return
    if (initialized.kind === 'VALUE') {
      const validation = validateOfflineInitialization(initialized.value, captured.options.binding)
      if (closed) return
      reason = validation
    }
    if (reason !== 'NONE') return finalize()
    initializationComplete = true
    state = 'CHECKING_MCP'
    const required = await probe(captured.inspectRequiredMcp, captured.options.requiredMcpTimeoutMs, 'MCP')
    if (closed) return
    if (required.kind === 'VALUE') {
      const validation = validateOfflineRequiredMcp(required.value, captured.options.requiredMcpIds)
      if (closed) return
      reason = validation
    }
    requiredMcpComplete = reason === 'NONE'
    finalize()
  }

  return Object.freeze({
    run(): Promise<OfflineReadinessReceipt> {
      const result = sharedFlight()
      if (!started && !closed) {
        started = true
        void execute()
      }
      return result
    },
    cancel(): Promise<OfflineReadinessReceipt> {
      const result = sharedFlight()
      if (state !== 'FINALIZED') {
        closed = true
        if (reason === 'NONE') reason = 'CANCELLED'
        abortController.abort()
        finalize()
      }
      return result
    },
    snapshot(): OfflineReadinessSnapshot {
      return Object.freeze({ state, admissionClosed: closed, reason, initializationComplete, requiredMcpComplete })
    },
  })
}
