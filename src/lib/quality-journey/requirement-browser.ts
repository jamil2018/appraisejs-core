import { canonicalContractJson } from '@/lib/catalog-contracts/canonical-json'

import { parseQualityJourneyRequirement } from './requirement-values'

/** Use the same parsed canonical UTF-8 bytes as the server requirement hash. */
export async function hashQualityJourneyRequirementForBrowser(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalContractJson(parseQualityJourneyRequirement(value)))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`
}
