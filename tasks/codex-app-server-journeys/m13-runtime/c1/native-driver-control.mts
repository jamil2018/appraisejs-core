import path from 'node:path'
import { z } from 'zod'
import { canonicalContractJson } from '../../../../src/lib/catalog-contracts'
import { nativeQualificationDigest } from '../../../../src/lib/quality-journey/codex-app-server/native-qualification-contract'
import {
  assertNativePublicInput,
  verifyNativeCredential,
  readNativePublicBytes,
  type NativeCredentialDescriptor,
} from '../../../../src/lib/quality-journey/codex-app-server/native-credential-topology'

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const reviewSchema = z
  .object({
    version: z.literal('M13_NATIVE_DRIVER_CONTROL_V1'),
    decision: z.literal('ACCEPT'),
    kind: z.enum([
      'CASE_PACKET',
      'ANONYMOUS_TARGET',
      'B3_ACCEPTANCE',
      'DISCOVERY_BROWSER',
      'NEXT_ROLE',
      'EXECUTION',
      'TRIAGE',
      'REPORT_REVIEW_CLOSURE',
    ]),
    subjectDigest: digest,
    reviewerId: z.string().min(1).max(200),
    actualReviewReceiptDigest: digest,
  })
  .strict()
export type NativeDriverControl = Readonly<{ decisionPath: string; decisionDigest: string; actualReviewPath: string }>
export function driverDigest(value: unknown) {
  return nativeQualificationDigest(canonicalContractJson(value))
}
export function readNativeDriverControl(
  control: NativeDriverControl,
  kind: z.infer<typeof reviewSchema>['kind'],
  subjectDigest: string,
  source: NativeCredentialDescriptor,
) {
  try {
    verifyNativeCredential(source)
    if (!path.isAbsolute(control.decisionPath) || !path.isAbsolute(control.actualReviewPath)) throw new Error()
    for (const file of [control.decisionPath, control.actualReviewPath]) {
      assertNativePublicInput(file, source)
    }
    const bytes = readNativePublicBytes(control.decisionPath, source, 1_048_576)
    if (nativeQualificationDigest(bytes) !== control.decisionDigest) throw new Error()
    const decision = reviewSchema.parse(JSON.parse(bytes.toString('utf8')))
    if (decision.kind !== kind || decision.subjectDigest !== subjectDigest) throw new Error()
    if (
      nativeQualificationDigest(readNativePublicBytes(control.actualReviewPath, source, 1_048_576)) !==
      decision.actualReviewReceiptDigest
    )
      throw new Error()
    return Object.freeze({ decisionDigest: control.decisionDigest, reviewerId: decision.reviewerId, subjectDigest })
  } catch {
    throw new Error('Exact independent native-driver control refused')
  }
}
export type OriginalNativeDriverTask = Readonly<{
  start(): Promise<unknown>
  snapshot(): Readonly<{
    state: string
    originalStartState: string
    turnStartEntered?: boolean
    turnId?: string
    completed?: boolean
    mcp?: Readonly<{
      fenced?: boolean
      lossReply?: Readonly<{
        requested: boolean
        closed: boolean
        bytesBefore: number
        bytesAfter: number | null
        zeroByteDelta: boolean
      }> | null
    }>
  }>
  readAcceptedManagedDelivery(call: {
    toolName: string
    arguments: Record<string, unknown>
  }): Promise<Readonly<{ result: unknown; receipt: { accepted: boolean }; argumentsDigest: string }> | null>
  freezeCandidate(): Promise<Readonly<Record<string, unknown>>>
  acceptIndependentReview(decisionPath: string, decisionDigest: string, actualReviewPath: string): unknown
  reconcile(observationKey: string): Promise<unknown>
  cancel(): Promise<unknown>
}>
const originalStoppedCleanup = z
  .object({
    state: z.literal('stopped'),
    cleanup: z
      .object({
        status: z.literal('stopped'),
        groupExitObserved: z.literal(true),
        privateRootRemoved: z.literal(true),
        privateRootRetained: z.literal(false),
      })
      .passthrough(),
  })
  .passthrough()
type Phase = 'PREPARED' | 'STARTING' | 'RUNNING' | 'CANDIDATE' | 'REVIEWED' | 'RECONCILED' | 'UNKNOWN'

/** One original case only. The actual driver supplies the concrete C1 task; tests may supply inert task objects. */
export function createOriginalNativeCaseControl(options: {
  provenance: 'ORIGINAL_C1_TASK' | 'OFFLINE_SYNTHETIC'
  subjectDigest: string
  leaseExpiresAt: number
  minimumLeaseMs?: number
  source: NativeCredentialDescriptor
  toolName: string
  arguments: Record<string, unknown>
  createOriginalTask(approvalDigest: string): Promise<OriginalNativeDriverTask>
  verifyReconciled(result: unknown): Promise<void>
  disposeOriginalSource(): Promise<void>
}) {
  const captured = Object.freeze({
    ...options,
    minimumLeaseMs: options.minimumLeaseMs ?? 0,
    arguments: structuredClone(options.arguments),
    source: structuredClone(options.source),
  })
  if (!Number.isSafeInteger(captured.minimumLeaseMs) || captured.minimumLeaseMs < 0)
    throw new Error('Exact minimum remaining lease bound required')
  if (captured.provenance === 'ORIGINAL_C1_TASK' && captured.minimumLeaseMs === 0)
    throw new Error('Original native case requires a positive frozen lease bound')
  const sufficientLease = () => {
    const remaining = captured.leaseExpiresAt - Date.now()
    return remaining > 0 && remaining >= captured.minimumLeaseMs
  }
  let phase: Phase = 'PREPARED',
    task: OriginalNativeDriverTask | undefined
  let originalStart: Promise<unknown> | undefined, candidate: Readonly<Record<string, unknown>> | undefined
  let accepted: Awaited<ReturnType<OriginalNativeDriverTask['readAcceptedManagedDelivery']>> | undefined
  let freezeEntered = false
  let sourceDisposalEntered = false,
    sourceDisposalSettled = false
  let reviewEntered = false,
    reconcileEntered = false
  let cancellation: Promise<unknown> | undefined
  let cancellationResult: unknown
  let cancellationState: 'NOT_ENTERED' | 'PENDING' | 'FULFILLED' | 'REJECTED' = 'NOT_ENTERED'
  function cancelOriginalTask() {
    if (task && !cancellation) {
      const originalTask = task
      cancellationState = 'PENDING'
      cancellation = (async () => {
        try {
          cancellationResult = await originalTask.cancel()
          cancellationState = 'FULFILLED'
          return cancellationResult
        } catch (error) {
          cancellationState = 'REJECTED'
          throw error
        }
      })()
    }
    return cancellation
  }
  function fail(): never {
    phase = 'UNKNOWN'
    throw new Error('Original native-driver case remains UNKNOWN')
  }
  function assertPhase(expected: Phase) {
    if (phase !== expected) fail()
  }
  function assertOriginalAcceptance(
    value: Awaited<ReturnType<OriginalNativeDriverTask['readAcceptedManagedDelivery']>>,
  ): asserts value is NonNullable<typeof value> {
    if (
      !value?.receipt.accepted ||
      value.argumentsDigest !== driverDigest({ toolName: captured.toolName, arguments: captured.arguments })
    )
      fail()
  }
  return Object.freeze({
    startVerifiedCase(control: NativeDriverControl) {
      if (originalStart) return originalStart
      if (phase !== 'PREPARED') throw new Error('Original prepared native case required')
      phase = 'STARTING'
      originalStart = (async () => {
        try {
          const approval = readNativeDriverControl(control, 'CASE_PACKET', captured.subjectDigest, captured.source)
          if (!sufficientLease()) fail()
          task = await captured.createOriginalTask(approval.decisionDigest)
          if (phase !== 'STARTING' || !sufficientLease()) {
            await cancelOriginalTask()
            return fail()
          }
          await task.start()
          assertPhase('STARTING')
          phase = 'RUNNING'
          return Object.freeze({
            phase,
            provenance: captured.provenance,
            runtimeQualified: false as const,
            physicalQualified: false as const,
          })
        } catch {
          return fail()
        }
      })()
      return originalStart
    },
    async freezeCandidate() {
      if (!task || phase !== 'RUNNING' || candidate || freezeEntered)
        throw new Error('One original completed native case required')
      freezeEntered = true
      try {
        const snapshot = task.snapshot()
        if (snapshot.state !== 'stopped' || snapshot.originalStartState !== 'FULFILLED')
          throw new Error('Original native completion pending')
        const originalAccepted = await task.readAcceptedManagedDelivery({
          toolName: captured.toolName,
          arguments: captured.arguments,
        })
        assertPhase('RUNNING')
        assertOriginalAcceptance(originalAccepted)
        const originalCandidate = await task.freezeCandidate()
        assertPhase('RUNNING')
        accepted = originalAccepted
        candidate = originalCandidate
        phase = 'CANDIDATE'
        return structuredClone(candidate)
      } catch {
        return fail()
      }
    },
    acceptIndependentReview(control: NativeDriverControl) {
      if (!task || phase !== 'CANDIDATE' || reviewEntered)
        throw new Error('One original independent candidate review required')
      reviewEntered = true
      try {
        task.acceptIndependentReview(control.decisionPath, control.decisionDigest, control.actualReviewPath)
        assertPhase('CANDIDATE')
        phase = 'REVIEWED'
        return Object.freeze({
          phase,
          provenance: captured.provenance,
          runtimeQualified: false as const,
          physicalQualified: false as const,
        })
      } catch {
        return fail()
      }
    },
    async reconcile(observationKey: string) {
      if (!task || phase !== 'REVIEWED' || reconcileEntered)
        throw new Error('One original reviewed reconciliation required')
      reconcileEntered = true
      try {
        const result = await task.reconcile(observationKey)
        assertPhase('REVIEWED')
        await captured.verifyReconciled(result)
        assertPhase('REVIEWED')
        sourceDisposalEntered = true
        await captured.disposeOriginalSource()
        sourceDisposalSettled = true
        assertPhase('REVIEWED')
        phase = 'RECONCILED'
        return Object.freeze({
          phase,
          sourceDisposed: true as const,
          provenance: captured.provenance,
          physicalQualified: false as const,
          runtimeQualified: false as const,
        })
      } catch {
        return fail()
      }
    },
    acceptedForLineage() {
      if (phase !== 'RECONCILED' || !accepted) throw new Error('Reconciled original canonical acceptance required')
      return structuredClone(accepted)
    },
    snapshot: () =>
      Object.freeze({
        phase,
        provenance: captured.provenance,
        physicalQualified: false as const,
        nativeState: task?.snapshot().state ?? null,
        nativeStartState: task?.snapshot().originalStartState ?? null,
        actualAcknowledgementObserved:
          task?.snapshot().originalStartState === 'FULFILLED' &&
          task?.snapshot().turnStartEntered === true &&
          typeof task?.snapshot().turnId === 'string',
        originalTurnActive: task?.snapshot().state === 'active' && task?.snapshot().completed === false,
        nativeCompletionObserved: task?.snapshot().completed === true,
        nativeReplyLoss: task?.snapshot().mcp?.lossReply ?? null,
        originalStartEntered: !!originalStart,
        originalCancellationState: cancellationState,
        originalCleanupProven: originalStoppedCleanup.safeParse(cancellationResult).success,
        candidateDigest: candidate ? driverDigest(candidate) : null,
        sourceDisposed: sourceDisposalSettled,
        sourceDisposalEntered,
        runtimeQualified: false as const,
      }),
    async cancelAndRetain() {
      if (phase === 'RECONCILED') return Object.freeze({ phase, retained: true as const, originalCleanupProven: false })
      phase = 'UNKNOWN'
      if (task && !sourceDisposalEntered) await cancelOriginalTask()
      return Object.freeze({
        phase,
        retained: true as const,
        originalCleanupProven: originalStoppedCleanup.safeParse(cancellationResult).success,
      })
    },
  })
}
