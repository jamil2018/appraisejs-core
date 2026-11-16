import { z } from 'zod'
import { recoveryCaseSchema, recoveryDigest, type RecoveryCaseKind } from './recovery-read-binding.mts'

export const recoveryPreparationSchema = z.object({ caseKind: recoveryCaseSchema }).strict()
export function requireSupportedRecoveryPreparation(value: unknown) {
  const parsed = recoveryPreparationSchema.parse(value)
  return parsed
}
export const recoveryPauseSchema = z
  .object({
    caseKind: recoveryCaseSchema,
    expectedVersion: z.number().int().nonnegative(),
    expectedStateHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    idempotencyKey: z.string().min(1).max(160),
  })
  .strict()
type Call = { toolName: string; arguments: Record<string, unknown> }
/** R1-only local delivery fence; R2/R3 selection and loss belong to the shared source controller. */
export function createTaskRecoveryDelivery(caseKind: RecoveryCaseKind, exact: Call) {
  if (caseKind !== 'R1_ACKNOWLEDGED_NATIVE_INTERRUPTION')
    throw new Error('Loss cases require the shared original controller')
  let fenced = false,
    accepted = false,
    entered = false
  return Object.freeze({
    async callGateway(call: Call, original: () => Promise<{ result: unknown; receipt: unknown }>) {
      if (fenced || entered || recoveryDigest(call) !== recoveryDigest(exact))
        throw new Error('Recovery delivery admission fenced')
      entered = true
      const result = await original()
      accepted = z
        .object({ accepted: z.literal(true) })
        .passthrough()
        .safeParse(result.receipt).success
      return result
    },
    fence() {
      fenced = true
    },
    snapshot: () => Object.freeze({ accepted, fenced, entered }),
  })
}

/** Original process-local Promise/handles only. No IDs restore admission or cancellation authority. */
export function createOriginalRecoveryCase(options: {
  caseKind: RecoveryCaseKind
  startOriginal(): Promise<unknown>
  observeOriginal(): {
    actualAcknowledgementObserved: boolean
    canonicalAcceptanceObserved: boolean
    originalTurnActive: boolean
    completionObserved: boolean
  }
  fenceAdmission(): void
  readOriginalScope(): Promise<{ version: number; stateHash: string; canonicalAcceptanceObserved?: boolean }>
  pauseOriginal(
    input: z.infer<typeof recoveryPauseSchema>,
  ): Promise<{ operationalStatus: string; version: number; stateHash: string; eventId: string }>
  cancelOriginalAndRetain(): Promise<unknown>
  boundaryMs?: number
  pollLimit?: number
}) {
  if (options.caseKind !== 'R1_ACKNOWLEDGED_NATIVE_INTERRUPTION')
    throw new Error('Loss cases require the shared original controller')
  const boundaryMs = options.boundaryMs ?? 300_000,
    pollLimit = options.pollLimit ?? 1000
  if (
    !Number.isSafeInteger(boundaryMs) ||
    boundaryMs < 1 ||
    boundaryMs > 300_000 ||
    !Number.isSafeInteger(pollLimit) ||
    pollLimit < 1 ||
    pollLimit > 1000
  )
    throw new Error('Closed recovery bounds required')
  let startPromise: Promise<unknown> | undefined,
    startState = 'NOT_ENTERED',
    polls = 0
  let enteredAt = 0,
    pauseEntered = false,
    fenced = false,
    cleanupSettled = false
  let receipt: { operationalStatus: string; version: number; stateHash: string; eventId: string } | undefined
  let interruptionObservation = 'NOT_OBSERVED'
  const fence = () => {
    fenced = true
    options.fenceAdmission()
  }
  function assertPauseCommit(committed: NonNullable<typeof receipt>, expectedVersion: number) {
    if (
      committed.operationalStatus !== 'PAUSED' ||
      committed.version !== expectedVersion + 1 ||
      !/^sha256:[a-f0-9]{64}$/.test(committed.stateHash) ||
      !committed.eventId
    )
      throw new Error('Pause commit unproven')
  }
  function boundary() {
    const state = options.observeOriginal()
    if (state.completionObserved) interruptionObservation = 'UNQUALIFIED_COMPLETED_BEFORE_CANCELLATION'
    return (
      state.actualAcknowledgementObserved &&
      state.originalTurnActive &&
      !state.completionObserved &&
      !state.canonicalAcceptanceObserved
    )
  }
  function assertPollBudget() {
    if (!startPromise || fenced || ++polls > pollLimit || Date.now() - enteredAt > boundaryMs) {
      fence()
      throw new Error('Finite original recovery observation refused')
    }
  }
  function assertPauseBoundary(parsed: z.infer<typeof recoveryPauseSchema>) {
    if (
      !startPromise ||
      fenced ||
      pauseEntered ||
      parsed.caseKind !== options.caseKind ||
      !boundary() ||
      Date.now() - enteredAt > boundaryMs
    )
      throw new Error('Exact original recovery pause boundary required')
  }
  return Object.freeze({
    start() {
      if (startState !== 'NOT_ENTERED' || fenced || pauseEntered)
        throw new Error('Original recovery start already entered or fenced')
      enteredAt = Date.now()
      startState = 'PENDING'
      try {
        startPromise = options.startOriginal()
      } catch {
        startState = 'REJECTED'
        fence()
        throw new Error('Original recovery start failed; no retry admitted')
      }
      void startPromise.then(
        () => {
          startState = 'FULFILLED'
        },
        () => {
          startState = 'REJECTED'
        },
      )
      return Object.freeze({ phase: 'START_ENTERED', acknowledgementObserved: false, runtimeQualified: false })
    },
    async poll() {
      assertPollBudget()
      const observed = options.observeOriginal()
      if (observed.completionObserved || (observed.actualAcknowledgementObserved && !observed.originalTurnActive)) {
        interruptionObservation = observed.completionObserved
          ? 'UNQUALIFIED_COMPLETED_BEFORE_CANCELLATION'
          : 'UNQUALIFIED_ORIGINAL_SUPERVISOR_NOT_ACTIVE'
        fence()
        throw new Error(`R1_${interruptionObservation}`)
      }
      const ready = boundary()
      const scope = ready ? await options.readOriginalScope() : null
      if (scope?.canonicalAcceptanceObserved) {
        fence()
        throw new Error('R1 canonical acceptance already observed; no interruption qualification')
      }
      return Object.freeze({
        phase: ready ? 'BOUNDARY_OBSERVED' : 'WAITING',
        startState,
        acknowledgementObserved: options.observeOriginal().actualAcknowledgementObserved,
        originalTurnActive: observed.originalTurnActive,
        completionObserved: observed.completionObserved,
        scope,
        runtimeQualified: false,
      })
    },
    async pause(input: unknown) {
      const parsed = recoveryPauseSchema.parse(input)
      assertPauseBoundary(parsed)
      pauseEntered = true
      fence()
      try {
        const committed = await options.pauseOriginal(parsed)
        assertPauseCommit(committed, parsed.expectedVersion)
        receipt = {
          operationalStatus: committed.operationalStatus,
          version: committed.version,
          stateHash: committed.stateHash,
          eventId: committed.eventId,
        }
      } catch {
        await options.cancelOriginalAndRetain().catch(() => {})
        throw new Error('PAUSE_COMMIT_UNPROVEN; original fenced and emergency cleanup requested')
      }
      const completedFirst = options.observeOriginal().completionObserved
      interruptionObservation = completedFirst
        ? 'UNQUALIFIED_COMPLETED_BEFORE_CANCELLATION'
        : 'ORIGINAL_OWNED_PROCESS_CANCELLATION'
      await options.cancelOriginalAndRetain()
      cleanupSettled = true
      return Object.freeze({
        phase: completedFirst ? 'R1_UNQUALIFIED_PAUSED_RETAINED_UNKNOWN' : 'PAUSED_RETAINED_UNKNOWN',
        ...receipt,
        interruption: completedFirst
          ? 'UNQUALIFIED_COMPLETED_BEFORE_CANCELLATION'
          : 'ORIGINAL_OWNED_PROCESS_CANCELLATION',
        runtimeQualified: false,
        nextCasePermitted: false,
      })
    },
    snapshot: () =>
      Object.freeze({
        caseKind: options.caseKind,
        startState,
        polls,
        fenced,
        pauseEntered,
        cleanupSettled,
        interruptionObservation,
        pauseReceipt: receipt ? structuredClone(receipt) : null,
        runtimeQualified: false,
      }),
  })
}
