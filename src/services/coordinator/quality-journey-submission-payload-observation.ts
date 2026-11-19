import { AsyncLocalStorage } from 'node:async_hooks'
import { canonicalContractJson } from '@/lib/catalog-contracts'

type SubmissionPayloadIdentity = Readonly<{
  journeyId: string
  targetProjectId: string
  workItemId: string
  attemptId: string
  assignmentId: string
  assignmentGeneration: number
  leaseId: string
  role: string
  principal: Readonly<{ principalId: string; assurance: string }>
  operation: string
  idempotencyKey: string
  coordinatorSessionId?: string
  coordinatorGeneration?: number
  coordinatorPrincipalId?: string
}>
type PayloadObservation = { identity: string; hash: string | null; poisoned: boolean }
const observations = new AsyncLocalStorage<PayloadObservation>()
const payloadDigest = /^sha256:[a-f0-9]{64}$/

/** Copy only scope identifiers. Never retain input payload, credentials or caller objects. */
function exactIdentity(input: SubmissionPayloadIdentity): string {
  return canonicalContractJson({
    journeyId: input.journeyId,
    targetProjectId: input.targetProjectId,
    workItemId: input.workItemId,
    attemptId: input.attemptId,
    assignmentId: input.assignmentId,
    assignmentGeneration: input.assignmentGeneration,
    leaseId: input.leaseId,
    role: input.role,
    principalId: input.principal.principalId,
    principalAssurance: input.principal.assurance,
    operation: input.operation,
    idempotencyKey: input.idempotencyKey,
    coordinatorSessionId: input.coordinatorSessionId ?? null,
    coordinatorGeneration: input.coordinatorGeneration ?? null,
    coordinatorPrincipalId: input.coordinatorPrincipalId ?? null,
  })
}

/** Internal observation scope around one original canonical thunk, never around producer/package code. */
export function createSubmissionPayloadCapture(expected: SubmissionPayloadIdentity) {
  const cell: PayloadObservation = { identity: exactIdentity(expected), hash: null, poisoned: false }
  return Object.freeze({
    run<T>(originalCanonicalThunk: () => Promise<T>): Promise<T> {
      return observations.run(cell, originalCanonicalThunk)
    },
    payloadHash(): string | null {
      return cell.poisoned ? null : cell.hash
    },
  })
}

/** Observation only: cannot call observers, change canonical errors or establish a commit. */
export function recordSubmissionPayloadIdentity(actual: SubmissionPayloadIdentity, hash: string): void {
  const cell = observations.getStore()
  if (!cell || cell.poisoned) return
  try {
    if (exactIdentity(actual) !== cell.identity) return
    if (!payloadDigest.test(hash) || (cell.hash !== null && cell.hash !== hash)) {
      cell.poisoned = true
      return
    }
    cell.hash = hash
  } catch {
    // Observation uncertainty must never alter the canonical transaction.
    cell.poisoned = true
  }
}
