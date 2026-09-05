import { ServiceError } from '@/services/shared/errors'

export function assertQualityJourneyMutable(journey: { stage: string; status: string }) {
  if (journey.stage === 'CLOSED' || journey.status === 'CLOSED')
    throw new ServiceError('Closed Quality Journeys are immutable. Start a linked follow-up journey.', 'CONFLICT')
}
