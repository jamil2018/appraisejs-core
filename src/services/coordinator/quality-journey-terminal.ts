import { ServiceError } from '@/services/shared/errors'

export function assertQualityJourneyMutable(journey: { stage: string; status: string }) {
  assertQualityJourneyRecoverable(journey)
  if (journey.status === 'PAUSED')
    throw new ServiceError('Quality Journey is paused. Reconcile owned work before resuming.', 'CONFLICT')
}

/** Cancellation and evidence reconciliation remain admitted while operational work is paused. */
export function assertQualityJourneyRecoverable(journey: { stage: string; status: string }) {
  if (journey.stage === 'CLOSED' || journey.status === 'CLOSED')
    throw new ServiceError('Closed Quality Journeys are immutable. Start a linked follow-up journey.', 'CONFLICT')
}
