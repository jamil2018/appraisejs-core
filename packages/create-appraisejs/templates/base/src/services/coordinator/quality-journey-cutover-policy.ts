import { ServiceError } from '@/services/shared/errors'

/** Retired compatibility shortcuts cannot manufacture review authority. The
 * exact-revision Quality OS domain APIs remain available to managed consumers. */
export function assertQualityJourneyCutoverRoute(operation: string[]) {
  if (operation.length !== 5 || operation[0] !== 'quality' || operation[1] !== 'plans') return
  const action = operation.slice(3).join('/')
  if (!['requirements/approve', 'validation-design/approve', 'validation-design/proposals'].includes(action)) return
  throw new ServiceError(
    'This compatibility control is read-only. Start a Quality Journey or use the exact-revision Quality OS review contract; historical approvals are not Journey approvals.',
    'CONFLICT',
    410,
    { reasonCode: 'QUALITY_JOURNEY_LEGACY_CONTROL_RETIRED', replacement: 'quality_journey_create' },
  )
}
