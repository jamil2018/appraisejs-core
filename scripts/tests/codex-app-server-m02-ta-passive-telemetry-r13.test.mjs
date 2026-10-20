import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isPassiveRateLimitsParams } from './fixtures/codex-app-server-m02-ta-passive-telemetry-r13/rate-limit-advisory.mjs'

const schemaPath = new URL(
  '../../.appraisejs/m02-executable-qualification-20261016-01/schemas/v2/AccountRateLimitsUpdatedNotification.json',
  import.meta.url,
)
const schemaSha256 = '37326ef0364007be0c8f92bf5cd228941b513f87266edd566d694409b5aa5b8b'
const keys = value => Object.keys(value).sort()

test('public pinned schema hash, root, refs, properties and enums match the conservative profile', () => {
  const raw = readFileSync(schemaPath)
  assert.equal(createHash('sha256').update(raw).digest('hex'), schemaSha256)
  const schema = JSON.parse(raw)
  assert.deepEqual(keys(schema.properties), ['rateLimits'])
  assert.deepEqual(schema.required, ['rateLimits'])
  assert.deepEqual(keys(schema.definitions.RateLimitSnapshot.properties), [
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
  ])
  assert.deepEqual(schema.definitions.RateLimitSnapshot.required, undefined)
  assert.deepEqual(keys(schema.definitions.CreditsSnapshot.properties), ['balance', 'hasCredits', 'unlimited'])
  assert.deepEqual(schema.definitions.CreditsSnapshot.required, ['hasCredits', 'unlimited'])
  assert.deepEqual(keys(schema.definitions.RateLimitWindow.properties), [
    'resetsAt',
    'usedPercent',
    'windowDurationMins',
  ])
  assert.deepEqual(schema.definitions.RateLimitWindow.required, ['usedPercent'])
  assert.deepEqual(keys(schema.definitions.SpendControlLimitSnapshot.properties), [
    'limit',
    'remainingPercent',
    'resetsAt',
    'used',
  ])
  assert.deepEqual(schema.definitions.SpendControlLimitSnapshot.required, [
    'limit',
    'remainingPercent',
    'resetsAt',
    'used',
  ])
  for (const item of schema.definitions.PlanType.enum)
    assert.equal(isPassiveRateLimitsParams({ rateLimits: { planType: item } }), true)
  for (const item of schema.definitions.RateLimitReachedType.enum)
    assert.equal(isPassiveRateLimitsParams({ rateLimits: { rateLimitReachedType: item } }), true)
})

test('empty and all-nullable sparse snapshots are advisory only', () => {
  assert.equal(isPassiveRateLimitsParams({ rateLimits: {} }), true)
  assert.equal(
    isPassiveRateLimitsParams({
      rateLimits: {
        credits: null,
        individualLimit: null,
        limitId: null,
        limitName: null,
        normalModelSlug: null,
        planType: null,
        primary: null,
        rateLimitReachedType: null,
        secondary: null,
        spendControlReached: null,
      },
    }),
    true,
  )
})

test('complete synthetic nested snapshot returns only a boolean and emits no account values', () => {
  const marker = 'SYNTHETIC_CREDIT_MARKER'
  const lines = []
  const originalLog = console.log
  const originalError = console.error
  console.log = (...values) => lines.push(values.join(' '))
  console.error = (...values) => lines.push(values.join(' '))
  try {
    const params = {
      rateLimits: {
        credits: { balance: marker, hasCredits: true, unlimited: false },
        individualLimit: {
          limit: 'SYNTHETIC_LIMIT',
          remainingPercent: 42,
          resetsAt: 1_700_000_000,
          used: 'SYNTHETIC_USED',
        },
        limitId: 'synthetic-limit-id',
        limitName: 'Synthetic limit',
        normalModelSlug: 'synthetic-model',
        planType: 'plus',
        primary: { resetsAt: null, usedPercent: 25, windowDurationMins: 60 },
        rateLimitReachedType: 'rate_limit_reached',
        secondary: { usedPercent: -1 },
        spendControlReached: false,
      },
    }
    const result = isPassiveRateLimitsParams(params)
    assert.equal(result, true)
    assert.equal(typeof result, 'boolean')
    assert.equal(String(result).includes(marker), false)
    assert.deepEqual(lines, [])
  } finally {
    console.log = originalLog
    console.error = originalError
  }
})

test('required root and nested reference fields reject missing or wrong types', () => {
  const invalid = [
    null,
    undefined,
    {},
    { rateLimits: null },
    { rateLimits: [] },
    { rateLimits: { credits: {} } },
    { rateLimits: { credits: { hasCredits: true } } },
    { rateLimits: { credits: { hasCredits: true, unlimited: 1 } } },
    { rateLimits: { credits: { hasCredits: true, unlimited: false, balance: 1 } } },
    { rateLimits: { primary: {} } },
    { rateLimits: { secondary: { usedPercent: 1.5 } } },
    { rateLimits: { individualLimit: {} } },
    { rateLimits: { individualLimit: { limit: '1', remainingPercent: 1, resetsAt: 2 } } },
    { rateLimits: { spendControlReached: 'false' } },
  ]
  for (const params of invalid) assert.equal(isPassiveRateLimitsParams(params), false)
})

test('unknown keys, auth-shaped fields, exotic objects, accessors and excessive depth reject', () => {
  const accessor = {}
  Object.defineProperty(accessor, 'rateLimits', { enumerable: true, get: () => ({}) })
  const invalid = [
    { rateLimits: {}, accountId: 'synthetic' },
    { rateLimits: {}, authUrl: 'synthetic' },
    { rateLimits: { accountId: 'synthetic' } },
    { rateLimits: { credits: { hasCredits: true, unlimited: false, token: 'synthetic' } } },
    { rateLimits: { primary: { usedPercent: 1, account: {} } } },
    { rateLimits: { primary: { usedPercent: 1, resetsAt: { deep: { extra: true } } } } },
    { rateLimits: {}, [Symbol('foreign')]: true },
    new Date(),
    accessor,
  ]
  for (const params of invalid) assert.equal(isPassiveRateLimitsParams(params), false)
})

test('enums, safe integers, signed int32, finite values and 256-byte strings are bounded', () => {
  const invalid = [
    { rateLimits: { planType: 'admin' } },
    { rateLimits: { rateLimitReachedType: 'auth_required' } },
    { rateLimits: { primary: { usedPercent: 2 ** 31 } } },
    { rateLimits: { primary: { usedPercent: -(2 ** 31) - 1 } } },
    { rateLimits: { primary: { usedPercent: Number.NaN } } },
    { rateLimits: { primary: { usedPercent: Number.POSITIVE_INFINITY } } },
    { rateLimits: { secondary: { usedPercent: 1, resetsAt: Number.MAX_SAFE_INTEGER + 1 } } },
    { rateLimits: { individualLimit: { limit: 'x', remainingPercent: 1, resetsAt: 1.25, used: 'y' } } },
    { rateLimits: { limitId: 'x'.repeat(257) } },
    { rateLimits: { limitName: '€'.repeat(86) } },
    { rateLimits: { limitId: 'x'.repeat(17 * 1024) } },
  ]
  for (const params of invalid) assert.equal(isPassiveRateLimitsParams(params), false)
  assert.equal(isPassiveRateLimitsParams({ rateLimits: { limitId: 'x'.repeat(256) } }), true)
  assert.equal(isPassiveRateLimitsParams({ rateLimits: { primary: { usedPercent: 2 ** 31 - 1 } } }), true)
})

test('runtime module source has no IO, process or protocol effects', () => {
  const source = readFileSync(
    new URL('./fixtures/codex-app-server-m02-ta-passive-telemetry-r13/rate-limit-advisory.mjs', import.meta.url),
    'utf8',
  )
  assert.equal(/\b(?:fetch|process|console|require|import\s+.*from)\b/u.test(source), false)
  assert.equal(source.includes('export function isPassiveRateLimitsParams(params)'), true)
})
