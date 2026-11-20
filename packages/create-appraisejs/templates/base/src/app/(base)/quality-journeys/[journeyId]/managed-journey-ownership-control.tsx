import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireActiveProjectForMutation } from '@/lib/active-project'
import { trustedHumanCoordinatorSession } from '@/services/coordinator/quality-journey-coordinator-session'
import {
  adoptUnownedLegacyQualityJourneyCoordinatorSession,
  readLegacyQualityJourneyMigrationSnapshot,
  transferQualityJourneyCoordinatorSession,
  registerQualityJourneyCoordinatorSession,
} from '@/services/coordinator/quality-journey-session-service'
import { ServiceError } from '@/services/shared/errors'
import { ManagedJourneyAdoptionForm } from './managed-journey-adoption-form'

export async function ManagedJourneyOwnershipControl({
  journeyId,
  projectId,
}: {
  journeyId: string
  projectId: string
}) {
  const scope = { journeyId, targetProjectId: projectId }
  const principalId = `appraise-local:${projectId}`
  const snapshot = await readLegacyQualityJourneyMigrationSnapshot({ ...scope, coordinatorPrincipalId: principalId })
  const receiptId = snapshot.reconciliationReceiptId
  if (snapshot.blocker || !receiptId)
    return <p role="status">{snapshot.blocker ?? 'The current pause cleanup receipt is unavailable.'}</p>

  const requestId = randomUUID()
  const approvedAt = new Date().toISOString()
  const approvalExpiresAt = new Date(Date.parse(approvedAt) + 5 * 60_000).toISOString()

  async function adopt() {
    'use server'
    try {
      const project = await requireActiveProjectForMutation()
      if (project.id !== projectId) return 'Select the original project and reload the Journey.'
      if (Date.now() >= Date.parse(approvalExpiresAt))
        return 'Migration review expired. Reload and review the current Journey.'
      const successor = await registerQualityJourneyCoordinatorSession({
        ...scope,
        hostKind: 'APP_SERVER_LOCAL_V1',
        ownerPrincipalId: principalId,
        idempotencyKey: requestId,
      })
      if (snapshot.mode === 'TRANSFER') {
        if (!snapshot.predecessorSessionId || snapshot.predecessorGeneration === null)
          return 'The reviewed coordinator generation is unavailable. Reload before migration.'
        await transferQualityJourneyCoordinatorSession({
          ...scope,
          authority: trustedHumanCoordinatorSession,
          approvedBy: 'local-ui',
          coordinatorPrincipalId: principalId,
          successorSessionId: successor.session.id,
          requestId,
          expectedOwnershipVersion: snapshot.expectedOwnershipVersion,
          expectedStateHash: snapshot.expectedStateHash,
          predecessorSessionId: snapshot.predecessorSessionId,
          predecessorGeneration: snapshot.predecessorGeneration,
          reconciliationReceiptId: receiptId!,
          targetHostingMode: 'APP_SERVER_LOCAL_V1',
        })
      } else
        await adoptUnownedLegacyQualityJourneyCoordinatorSession({
          ...scope,
          authority: trustedHumanCoordinatorSession,
          approvedBy: 'local-ui',
          coordinatorPrincipalId: principalId,
          successorSessionId: successor.session.id,
          requestId,
          expectedOwnershipVersion: snapshot.expectedOwnershipVersion,
          expectedVersion: snapshot.expectedVersion,
          expectedStateHash: snapshot.expectedStateHash,
          expectedAdoptionSnapshotHash: snapshot.adoptionSnapshotHash,
          approvedAt,
          approvalExpiresAt,
          reconciliationReceiptId: receiptId!,
        })
      revalidatePath('/quality-journeys')
      revalidatePath(`/quality-journeys/${journeyId}`)
      return null
    } catch (error) {
      return error instanceof ServiceError
        ? error.message
        : 'Unable to migrate this Journey. Reload to check its current owner.'
    }
  }

  return <ManagedJourneyAdoptionForm adopt={adopt} previouslyOwned={snapshot.mode === 'TRANSFER'} />
}
