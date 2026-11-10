import { createHash } from 'node:crypto'

import { canonicalContractJson } from '@/lib/catalog-contracts'
import { parseQualityJourneyRequirement } from './requirement-values'

export {
  parseQualityJourneyRequirement,
  qualityJourneyRequirementSchema,
  qualityJourneyRequirementVersion,
  type QualityJourneyRequirementV1,
  type QualityJourneyRequirement,
} from './requirement-values'

/** Hash the parsed, canonical requirement so object key and collection order
 * cannot change an otherwise identical immutable intake revision. */
export function hashQualityJourneyRequirement(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(canonicalContractJson(parseQualityJourneyRequirement(value)))
    .digest('hex')}`
}
