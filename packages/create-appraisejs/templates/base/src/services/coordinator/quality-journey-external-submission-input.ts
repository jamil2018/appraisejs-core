import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import type { CoordinatorSessionCredentials } from './quality-journey-coordinator-session'
import type { ExternalAnalyzerProjectPrincipal, ExternalQualityJourneyAcceptanceInput } from './quality-journey-service'

/** Versioned external assignment fields replace the canonical owner token. */
export const externalQualityJourneyAssignmentFields = {
  assignmentId: z.string().min(1).max(200),
  assignmentGeneration: z.number().int().positive(),
  assignmentSecret: z.string().min(32).max(2_000),
  idempotencyKey: z.string().min(1).max(200),
}

type ExternalSubmissionEnvelope = {
  journeyId: string
  targetProjectId: string
  workItemId: string
  attemptId: string
  leaseId: string
  assignmentId: string
  assignmentGeneration: number
  assignmentSecret: string
  idempotencyKey: string
}

/** Pure projection of an already-parsed external envelope. Authentication and
 * current-session checks remain in the acceptance transaction. */
export function projectExternalQualityJourneySubmission<T extends ExternalSubmissionEnvelope>(
  request: T,
  identity: Pick<ExternalQualityJourneyAcceptanceInput, 'role' | 'operation'>,
  principal: ExternalAnalyzerProjectPrincipal,
  coordinatorSession?: CoordinatorSessionCredentials,
) {
  const { assignmentId, assignmentGeneration, assignmentSecret, idempotencyKey, ...canonicalInput } = request
  const internalKey = createHash('sha256')
    .update(
      canonicalContractJson({
        principal: principal.principalId,
        assignmentId,
        attemptId: request.attemptId,
        idempotencyKey,
      }),
    )
    .digest('hex')
  const acceptance: ExternalQualityJourneyAcceptanceInput = {
    ...(typeof coordinatorSession === 'object' ? coordinatorSession : {}),
    role: identity.role,
    operation: identity.operation,
    journeyId: request.journeyId,
    targetProjectId: request.targetProjectId,
    workItemId: request.workItemId,
    attemptId: request.attemptId,
    assignmentId,
    assignmentGeneration,
    leaseId: request.leaseId,
    assignmentSecret,
    principal,
    idempotencyKey,
    payload: { ...request, assignmentSecret: undefined },
  }
  return {
    canonical: { ...canonicalInput, ownerToken: assignmentSecret, idempotencyKey: `external-v1:${internalKey}` },
    acceptance,
  }
}
