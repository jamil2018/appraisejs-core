import { createHash } from 'node:crypto'

import type { PickedLocatorPayload } from '@/types/locator-picker'

const LOCATOR_OBSERVATION_MAX_AGE_MS = 5 * 60 * 1000
const LOCATOR_OBSERVATION_MAX_FUTURE_SKEW_MS = 30 * 1000

function selectorFingerprint(selector: string) {
  return `sha256:${createHash('sha256').update(selector).digest('hex')}`
}

export function validatePickedLocatorObservation(
  pickedLocator: PickedLocatorPayload,
  selector: string,
  now = Date.now(),
): string | null {
  if (pickedLocator.matchCount !== 1) {
    return 'The picker selector was not verified as exactly one live match. Pick again or enter a manual selector.'
  }
  if (pickedLocator.selector !== selector || pickedLocator.selectorFingerprint !== selectorFingerprint(selector)) {
    return 'The picker verification does not match this selector. Pick the element again.'
  }

  const checkedAt = Date.parse(pickedLocator.checkedAt ?? '')
  if (!Number.isFinite(checkedAt)) return 'The picker verification time is invalid. Pick the element again.'
  if (checkedAt > now + LOCATOR_OBSERVATION_MAX_FUTURE_SKEW_MS) {
    return 'The picker verification time is in the future. Pick the element again.'
  }
  if (now - checkedAt > LOCATOR_OBSERVATION_MAX_AGE_MS) {
    return 'The picker verification is stale. Pick the element again before saving.'
  }
  if (!pickedLocator.checkedUrl) return 'The picker verification URL is missing. Pick the element again.'
  return null
}
