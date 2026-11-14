import { z } from 'zod'
import { readNativeDriverControl, type NativeDriverControl, driverDigest } from './native-driver-control.mts'
import { scriptedDisposableHuman } from './native-lineage.mts'
import type { NativeCredentialDescriptor } from '../../../../src/lib/quality-journey/codex-app-server/native-credential-topology'

const executionBudgets = z
  .object({ caseMs: z.number().int().min(1).max(300_000), cleanupMs: z.number().int().min(1).max(300_000) })
  .strict()
export function captureNativeExecutionBudgets(value: unknown) {
  return Object.freeze(executionBudgets.parse(value))
}

export type NativeExecutionObservation = Readonly<{
  executionCycles: number
  testRuns: number
  cycleId: string
  testRunId: string
  runId: string
  cycleStatus: string
  runStatus: string
  result: string
  sealed: boolean
  completeValidEvidence: boolean
  originalCleanup: 'CONFIRMED' | 'PENDING' | 'UNKNOWN'
  originalOperationsSettled: boolean
  receiptId: string | null
  receiptHash: string | null
}>
export function sealedOriginalExecution(value: NativeExecutionObservation) {
  return (
    value.executionCycles === 1 &&
    value.testRuns === 1 &&
    value.cycleStatus === 'COMPLETED' &&
    value.runStatus === 'COMPLETED' &&
    ['PASSED', 'FAILED'].includes(value.result) &&
    value.sealed &&
    value.completeValidEvidence &&
    value.originalCleanup === 'CONFIRMED' &&
    value.originalOperationsSettled &&
    !!value.receiptId &&
    /^sha256:[a-f0-9]{64}$/.test(value.receiptHash ?? '')
  )
}

/** Private task-stage controller. Synthetic ports never enter the concrete driver or issue physical proof. */
export function createOriginalExecutionControl(provided: {
  provenance: 'ORIGINAL_CANONICAL_RUNTIME' | 'OFFLINE_SYNTHETIC'
  source: NativeCredentialDescriptor
  subjectDigest: string
  caseMs: number
  cleanupMs: number
  grantAndStart(): Promise<void>
  observeOriginal(): Promise<NativeExecutionObservation>
  cancelOriginal(): Promise<void>
  hardUnknown(): never
}) {
  const options = Object.freeze({ ...provided, source: structuredClone(provided.source) })
  captureNativeExecutionBudgets({ caseMs: options.caseMs, cleanupMs: options.cleanupMs })
  let phase: 'PREPARED' | 'STARTING' | 'RUNNING' | 'SEALED' | 'UNKNOWN' = 'PREPARED'
  let flight: Promise<unknown> | undefined, cancellation: Promise<void> | undefined, poll: Promise<unknown> | undefined
  let startState: 'NOT_CALLED' | 'PENDING' | 'FULFILLED' | 'REJECTED' = 'NOT_CALLED'
  let originalExecutionEntered = false
  let observed: NativeExecutionObservation | undefined
  let caseTimer: ReturnType<typeof setTimeout> | undefined, hardTimer: ReturnType<typeof setTimeout> | undefined
  const metadata = () =>
    Object.freeze({
      phase,
      provenance: options.provenance,
      originalStartState: startState,
      originalExecutionEntered,
      runtimeQualified: false as const,
      physicalQualified: false as const,
      observation: observed ? structuredClone(observed) : null,
    })
  function unknown(): never {
    phase = 'UNKNOWN'
    throw new Error('Original execution remains UNKNOWN; no Triager admitted')
  }
  function finish() {
    if (caseTimer) clearTimeout(caseTimer)
    if (hardTimer) clearTimeout(hardTimer)
  }
  function cancel() {
    if (phase === 'SEALED') return Promise.resolve()
    phase = 'UNKNOWN'
    cancellation ??= options.cancelOriginal()
    void cancellation.catch(() => {})
    return cancellation
  }
  return Object.freeze({
    startVerified(control: NativeDriverControl, persona: typeof scriptedDisposableHuman) {
      if (flight) return flight
      if (phase !== 'PREPARED' || persona !== scriptedDisposableHuman)
        throw new Error('Exact scripted disposable execution boundary required')
      flight = (async () => {
        try {
          readNativeDriverControl(control, 'EXECUTION', options.subjectDigest, options.source)
          phase = 'STARTING'
          startState = 'PENDING'
          caseTimer = setTimeout(() => {
            void cancel().catch(() => {})
          }, options.caseMs)
          hardTimer = setTimeout(() => {
            phase = 'UNKNOWN'
            options.hardUnknown()
          }, options.caseMs + options.cleanupMs)
          originalExecutionEntered = true
          await options.grantAndStart()
          startState = 'FULFILLED'
          if (phase !== 'STARTING') return unknown()
          phase = 'RUNNING'
          return metadata()
        } catch {
          if (startState === 'PENDING') startState = 'REJECTED'
          return unknown()
        }
      })()
      return flight
    },
    pollOriginal() {
      if (phase === 'SEALED') return Promise.resolve(metadata())
      if (phase !== 'RUNNING' || startState !== 'FULFILLED')
        return Promise.reject(new Error('Original execution is pending or UNKNOWN; no Triager admitted'))
      if (poll) return poll
      poll = (async () => {
        try {
          observed = await options.observeOriginal()
          if (phase !== 'RUNNING') return unknown()
          if (observed.originalCleanup === 'UNKNOWN') return unknown()
          if (sealedOriginalExecution(observed)) {
            phase = 'SEALED'
            finish()
          }
          return metadata()
        } catch {
          return unknown()
        } finally {
          poll = undefined
        }
      })()
      return poll
    },
    requireSealed() {
      if (phase !== 'SEALED' || !observed || !sealedOriginalExecution(observed))
        throw new Error('Sealed original execution and confirmed cleanup required')
      return Object.freeze({
        ...structuredClone(observed),
        observationDigest: driverDigest(observed),
        runtimeQualified: false as const,
        physicalQualified: false as const,
      })
    },
    cancelAndRetain: cancel,
    snapshot: metadata,
  })
}

/** Original references only; this observer grants no signal, launch or physical-outcome authority. */
export function createOriginalExecutionAcquisition(
  expectedNode: string,
  expectedSupervisor: string,
  provenance: 'ORIGINAL_CANONICAL_RUNTIME' | 'OFFLINE_SYNTHETIC',
) {
  const originals: import('../../../../src/lib/process/task-spawner').SpawnedProcess[] = []
  let unknown = false
  return Object.freeze({
    onSpawn(original: import('../../../../src/lib/process/task-spawner').SpawnedProcess) {
      const args = original.process.spawnargs
      if (args.length !== 2 || args[0] !== expectedNode || args[1] !== expectedSupervisor) {
        unknown = true
        return
      }
      originals.push(original)
      if (originals.length !== 1) unknown = true
    },
    requireOriginal(registryOriginal: import('../../../../src/lib/process/task-spawner').SpawnedProcess | undefined) {
      if (registryOriginal && registryOriginal !== originals[0]) unknown = true
      if (unknown || originals.length !== 1) throw new Error('Original runtime supervisor acquisition UNKNOWN')
      return originals[0]
    },
    originals: () => [...originals],
    snapshot: () =>
      Object.freeze({
        unknown,
        observed: originals.length,
        provenance,
        runtimeQualified: false as const,
        physicalQualified: false as const,
      }),
  })
}
