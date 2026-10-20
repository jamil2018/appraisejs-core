/**
 * Conservative, value-discarding profile of the pinned 318-file schema inventory's
 * v2/AccountRateLimitsUpdatedNotification.json (SHA-256
 * 37326ef0364007be0c8f92bf5cd228941b513f87266edd566d694409b5aa5b8b).
 *
 * This is only a pure params predicate. The protocol owner must separately bind
 * the idless method, active owned turn, notification envelope and telemetry quota.
 * A true result grants no authentication, provider readiness, eligibility or spend
 * conclusion. No account value is returned, logged, hashed or retained.
 */

const MAX_STRING_BYTES = 256
const MAX_SERIALIZED_BYTES = 16 * 1024
const INT32_MIN = -(2 ** 31)
const INT32_MAX = 2 ** 31 - 1

const PLAN_TYPES = new Set([
  'free',
  'go',
  'plus',
  'pro',
  'prolite',
  'promax',
  'team',
  'self_serve_business_prolite',
  'self_serve_business_usage_based',
  'business',
  'ent26',
  'enterprise_cbp_automation',
  'enterprise_cbp_usage_based',
  'enterprise',
  'edu',
  'edu_plus',
  'edu_pro',
  'unknown',
])
const REACHED_TYPES = new Set([
  'rate_limit_reached',
  'workspace_owner_credits_depleted',
  'workspace_member_credits_depleted',
  'workspace_owner_usage_limit_reached',
  'workspace_member_usage_limit_reached',
])

const shortString = value => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= MAX_STRING_BYTES
const nullable = (value, check) => value === null || check(value)
const safeInt = value => Number.isSafeInteger(value) && Number.isFinite(value)
const int32 = value => safeInt(value) && value >= INT32_MIN && value <= INT32_MAX

// JSON.parse yields ordinary data objects. Reject exotic prototypes, symbols,
// accessors, non-enumerable keys and unknown keys before serializing for quota.
const fields = (value, allowed, required = []) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  const keys = Reflect.ownKeys(value)
  if (keys.length > allowed.length || required.some(key => !Object.hasOwn(value, key))) return false
  const descriptors = Object.getOwnPropertyDescriptors(value)
  return keys.every(
    key =>
      typeof key === 'string' &&
      allowed.includes(key) &&
      descriptors[key].enumerable === true &&
      Object.hasOwn(descriptors[key], 'value'),
  )
}

const credits = value =>
  fields(value, ['balance', 'hasCredits', 'unlimited'], ['hasCredits', 'unlimited']) &&
  typeof value.hasCredits === 'boolean' &&
  typeof value.unlimited === 'boolean' &&
  (!Object.hasOwn(value, 'balance') || nullable(value.balance, shortString))

const window = value =>
  fields(value, ['resetsAt', 'usedPercent', 'windowDurationMins'], ['usedPercent']) &&
  int32(value.usedPercent) &&
  (!Object.hasOwn(value, 'resetsAt') || nullable(value.resetsAt, safeInt)) &&
  (!Object.hasOwn(value, 'windowDurationMins') || nullable(value.windowDurationMins, safeInt))

const spendControl = value =>
  fields(value, ['limit', 'remainingPercent', 'resetsAt', 'used'], ['limit', 'remainingPercent', 'resetsAt', 'used']) &&
  shortString(value.limit) &&
  int32(value.remainingPercent) &&
  safeInt(value.resetsAt) &&
  shortString(value.used)

const RATE_FIELDS = [
  'credits',
  'individualLimit',
  'limitId',
  'limitName',
  'normalModelSlug',
  'planType',
  'primary',
  'rateLimitReachedType',
  'secondary',
  'spendControlReached',
]

const rateLimits = value =>
  fields(value, RATE_FIELDS) &&
  (!Object.hasOwn(value, 'credits') || nullable(value.credits, credits)) &&
  (!Object.hasOwn(value, 'individualLimit') || nullable(value.individualLimit, spendControl)) &&
  (!Object.hasOwn(value, 'limitId') || nullable(value.limitId, shortString)) &&
  (!Object.hasOwn(value, 'limitName') || nullable(value.limitName, shortString)) &&
  (!Object.hasOwn(value, 'normalModelSlug') || nullable(value.normalModelSlug, shortString)) &&
  (!Object.hasOwn(value, 'planType') || nullable(value.planType, item => PLAN_TYPES.has(item))) &&
  (!Object.hasOwn(value, 'primary') || nullable(value.primary, window)) &&
  (!Object.hasOwn(value, 'rateLimitReachedType') ||
    nullable(value.rateLimitReachedType, item => REACHED_TYPES.has(item))) &&
  (!Object.hasOwn(value, 'secondary') || nullable(value.secondary, window)) &&
  (!Object.hasOwn(value, 'spendControlReached') ||
    nullable(value.spendControlReached, item => typeof item === 'boolean'))

export function isPassiveRateLimitsParams(params) {
  try {
    if (!fields(params, ['rateLimits'], ['rateLimits']) || !rateLimits(params.rateLimits)) return false
    const serialized = JSON.stringify(params)
    return typeof serialized === 'string' && Buffer.byteLength(serialized, 'utf8') <= MAX_SERIALIZED_BYTES
  } catch {
    return false
  }
}
