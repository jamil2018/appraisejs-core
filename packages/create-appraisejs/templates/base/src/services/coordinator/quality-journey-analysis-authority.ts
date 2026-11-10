import type { QualityJourneyWorkAttempt, QualityJourneyWorkItem, QualityJourneyWorkAuthorization } from '@prisma/client'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import type { selectAnalysisFollowupIssuance } from './quality-journey-analysis-followup'
import { ServiceError } from '@/services/shared/errors'

type Issued = ReturnType<typeof selectAnalysisFollowupIssuance>
const managedInputConflict = () =>
  new ServiceError('Managed Analysis follow-up canonical input identity is stale or invalid.', 'CONFLICT')
const publicationConflict = () =>
  new ServiceError(
    'Only the current completed Analysis leaf may be published; successor work is pending or the revision is stale.',
    'CONFLICT',
  )

/** Persisted bytes and assignment input identity precede interpretation of role/artifact projections. */
export function assertManagedAnalysisAssignmentEvidence(
  issued: Issued,
  attempt: { assignmentHash: string | null },
  authorization: { authorizationHash: string },
  manifest: Record<string, unknown>,
  authorized: Record<string, unknown>,
) {
  if (
    manifest.inputHash !== issued.inputHash ||
    manifest.stateHash !== issued.inputHash ||
    hashCanonical(manifest) !== attempt.assignmentHash ||
    hashCanonical(authorized) !== authorization.authorizationHash
  )
    throw managedInputConflict()
}
export function assertManagedAnalysisRoleContract(
  issued: Issued,
  item: { roleContractDigest: string },
  authorization: { roleContractDigest: string },
  manifest: Record<string, unknown>,
) {
  if (
    authorization.roleContractDigest !== issued.descriptor.roleContractDigest ||
    item.roleContractDigest !== issued.descriptor.roleContractDigest ||
    (manifest.roleDefinition as { digest?: string } | undefined)?.digest !== issued.descriptor.roleContractDigest
  )
    throw managedInputConflict()
}
export function assertManagedAnalysisArtifactBindings(
  issued: Issued,
  item: { inputArtifactRefsJson: string },
  manifest: Record<string, unknown>,
  authorized: Record<string, unknown>,
) {
  if (
    canonicalContractJson(manifest.inputArtifacts) !== canonicalContractJson(issued.inputArtifacts) ||
    canonicalContractJson(authorized.inputArtifacts) !== canonicalContractJson(issued.inputArtifacts) ||
    canonicalContractJson(JSON.parse(item.inputArtifactRefsJson)) !== canonicalContractJson(issued.inputArtifacts) ||
    canonicalContractJson(manifest.advisoryInputRefs ?? []) !==
      canonicalContractJson(issued.descriptor.advisoryInputRefs) ||
    canonicalContractJson(authorized.advisoryInputRefs ?? []) !==
      canonicalContractJson(issued.descriptor.advisoryInputRefs)
  )
    throw managedInputConflict()
}
export function assertManagedAnalysisCurrentInputs(
  snapshot: { ready: boolean; inputHash: string; causeHash: string } | null,
  issued: Issued,
  item: { inputHash: string },
) {
  if (
    !snapshot?.ready ||
    snapshot.inputHash !== issued.inputHash ||
    snapshot.causeHash !== issued.causeHash ||
    item.inputHash !== issued.inputHash
  )
    throw managedInputConflict()
}
export function assertManagedAnalysisSuccessorInputs(
  predecessorId: string | undefined,
  requirementId: string,
  journey: { unresolvedQuestionIdsJson: string; blockerIdsJson: string },
  issued: Issued,
) {
  if (
    predecessorId !== issued.descriptor.predecessor.revisionId ||
    requirementId !== issued.descriptor.requirement.revisionId ||
    JSON.parse(journey.unresolvedQuestionIdsJson).length ||
    JSON.parse(journey.blockerIdsJson).length
  )
    throw managedInputConflict()
}
export function assertExternalAnalysisGeneration(
  attemptId: string,
  external: { assignmentId: string; assignmentGeneration: number },
  attempt: { id: string; assignmentId: string | null; assignmentGeneration: number },
) {
  if (
    attempt.id !== attemptId ||
    attempt.assignmentId !== external.assignmentId ||
    attempt.assignmentGeneration !== external.assignmentGeneration
  )
    throw new ServiceError('External Analysis submission generation is stale.', 'CONFLICT')
}
export function assertPublishableAnalysisLeaf(
  activeCycleId: string,
  revision: { id: string; cycleId: string },
  leaves: { id: string }[],
) {
  if (leaves.length !== 1 || leaves[0]!.id !== revision.id || revision.cycleId !== activeCycleId)
    throw publicationConflict()
}
type PublicationWork = Pick<
  QualityJourneyWorkItem,
  'id' | 'cycleId' | 'role' | 'status' | 'inputHash' | 'currentAttempt'
>
export function assertPublishableAnalysisWork(
  activeCycleId: string,
  revision: { inputHash: string },
  work: PublicationWork | null,
): asserts work is PublicationWork {
  if (
    !work ||
    work.cycleId !== activeCycleId ||
    work.role !== 'REQUIREMENT_ANALYZER' ||
    work.status !== 'COMPLETED' ||
    work.inputHash !== revision.inputHash
  )
    throw publicationConflict()
}
export function assertPublishableAnalysisAttempt(
  work: PublicationWork,
  submittedAttempt: Pick<QualityJourneyWorkAttempt, 'status' | 'workItemId' | 'attempt'> | null,
) {
  if (
    submittedAttempt?.status !== 'COMPLETED' ||
    submittedAttempt.workItemId !== work.id ||
    submittedAttempt.attempt !== work.currentAttempt
  )
    throw publicationConflict()
}

/** The current authorization must still bind the admitted external principal. */
export function assertCurrentExternalAnalysisAuthorization(
  authorization: Pick<
    QualityJourneyWorkAuthorization,
    | 'id'
    | 'revokedAt'
    | 'cancelledAt'
    | 'externalAdmissionProtocol'
    | 'externalPrincipalId'
    | 'externalPrincipalAssurance'
  > | null,
  currentAuthorization: { id: string } | null,
  principal: { principalId: string; assurance: string },
  admissionProtocol: string,
) {
  if (
    !authorization ||
    authorization.revokedAt ||
    authorization.cancelledAt ||
    authorization.externalAdmissionProtocol !== admissionProtocol ||
    authorization.externalPrincipalId !== principal.principalId ||
    authorization.externalPrincipalAssurance !== principal.assurance ||
    currentAuthorization?.id !== authorization.id
  )
    throw new ServiceError('External Analysis submission authority is not current.', 'UNAUTHORIZED')
}
