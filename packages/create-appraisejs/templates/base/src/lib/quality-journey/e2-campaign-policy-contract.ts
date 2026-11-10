import { canonicalE2Json, e2Sha256, isE2Digest, isE2Id, isE2Uint } from './provider-grant-contract'

/** R2's one retained, non-bearer campaign allocation for a Journey and target. */
export const E2_CAMPAIGN_POLICY_DOMAIN = 'M06_E2_CAMPAIGN_POLICY_V1' as const

const e2CampaignPolicyImmutableFields = [
  'id', 'allocationDigest', 'journeyId', 'targetProjectId', 'sourceTupleDigest', 'policyVersion',
  'nativeStartWindowMs', 'dnsWindowMs', 'tcpWindowMs', 'tlsWindowMs', 'upgradeWindowMs',
  'providerRequestWindowMs', 'mcpCallWindowMs', 'actorMaxOperations', 'actorMaxBytes',
  'actorMaxFrames', 'actorMaxSetup', 'actorMaxProviderRequests', 'actorMaxMcpCalls',
  'journeyMaxNativeStarts', 'journeyMaxTurnStarts', 'maxNativeStarts',
  'maxProviderRequests', 'maxOperations', 'maxBytes', 'maxFrames', 'maxSetup', 'maxMcpCalls',
] as const
export const e2CampaignPolicyCounterCaps = [
  ['nativeStartsReserved', 'maxNativeStarts', 6],
  ['providerRequestsReserved', 'maxProviderRequests', 5],
  ['operationsReserved', 'maxOperations', 192],
  ['bytesReserved', 'maxBytes', 50_331_648],
  ['framesReserved', 'maxFrames', 3_072],
  ['setupReserved', 'maxSetup', 24],
  ['mcpCallsReserved', 'maxMcpCalls', 96],
] as const

type ImmutableField = (typeof e2CampaignPolicyImmutableFields)[number]
type CounterField = (typeof e2CampaignPolicyCounterCaps)[number][0]
type NumericField = Exclude<ImmutableField,
  'id' | 'allocationDigest' | 'journeyId' | 'targetProjectId' | 'sourceTupleDigest' | 'policyVersion'>

export type E2CampaignPolicyRow = Readonly<
  Record<NumericField | CounterField | 'version', number> &
  Record<'id' | 'allocationDigest' | 'journeyId' | 'targetProjectId' |
    'sourceTupleDigest' | 'policyVersion' | 'policyDigest', string> &
  { createdAt: Date }
>
export type E2CampaignPolicyCharges = Readonly<Record<CounterField, number>>

class E2CampaignPolicyContractError extends Error {
  constructor(readonly reason: string) {
    super(`E2 campaign policy refused: ${reason}`)
    this.name = 'E2CampaignPolicyContractError'
  }
}
const fail: (reason: string) => never = reason => { throw new E2CampaignPolicyContractError(reason) }
const plain = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype

/** Hash only immutable fields, with ASCII key order and the exact R2 domain. */
export function e2CampaignPolicyDigest(policy: E2CampaignPolicyRow): string {
  const immutable = Object.fromEntries(e2CampaignPolicyImmutableFields.map(field => [field, policy[field]]))
  return e2Sha256(canonicalE2Json(immutable), `${E2_CAMPAIGN_POLICY_DOMAIN}\n`)
}

/** Validate an unmodified Prisma row; `requireFresh` applies only to the original INSERT allocation. */
export function validateE2CampaignPolicyRow(input: unknown,
  options: Readonly<{ requireFresh?: boolean }> = {}): E2CampaignPolicyRow {
  if (!plain(input)) fail('row shape')
  const required = [...e2CampaignPolicyImmutableFields,
    ...e2CampaignPolicyCounterCaps.map(([counter]) => counter), 'version', 'policyDigest', 'createdAt']
  const keys = Object.keys(input)
  if (keys.length !== required.length || keys.some(key => !required.includes(key as ImmutableField)))
    fail('row fields')
  for (const field of ['id', 'journeyId', 'targetProjectId'] as const)
    if (!isE2Id(input[field])) fail(`${field} identity`)
  for (const field of ['allocationDigest', 'sourceTupleDigest', 'policyDigest'] as const)
    if (!isE2Digest(input[field])) fail(`${field} digest`)
  if (input.policyVersion !== E2_CAMPAIGN_POLICY_DOMAIN) fail('policy version')
  if (!(input.createdAt instanceof Date) || !Number.isFinite(input.createdAt.getTime()))
    fail('creation time')
  for (const field of ['nativeStartWindowMs', 'dnsWindowMs', 'tcpWindowMs', 'tlsWindowMs',
    'upgradeWindowMs', 'providerRequestWindowMs', 'mcpCallWindowMs'] as const)
    if (!isE2Uint(input[field], 2_147_483_646) || input[field] === 0)
      fail(`${field} window`)
  for (const [field, cap] of [
    ['actorMaxOperations', 32], ['actorMaxBytes', 8_388_608], ['actorMaxFrames', 512],
    ['actorMaxSetup', 4], ['actorMaxProviderRequests', 5], ['actorMaxMcpCalls', 16],
    ['journeyMaxNativeStarts', 6], ['journeyMaxTurnStarts', 5],
  ] as const) if (!isE2Uint(input[field], cap)) fail(`${field} cap`)
  for (const [counter, cap, absolute] of e2CampaignPolicyCounterCaps) {
    if (!isE2Uint(input[cap], absolute) || !isE2Uint(input[counter], absolute) ||
      input[counter] > input[cap]) fail(`${counter} bound`)
    if (options.requireFresh && input[counter] !== 0) fail(`${counter} initial value`)
  }
  if (!isE2Uint(input.version, 2_147_483_646) ||
    (options.requireFresh && input.version !== 0)) fail('version')
  const row = input as E2CampaignPolicyRow
  if (row.policyDigest !== e2CampaignPolicyDigest(row)) fail('immutable digest')
  return row
}

/** Exact one-grant counter transition; a replay or reset cannot become a new allocation. */
export function validateE2CampaignPolicyCounterTransition(beforeInput: unknown,
  afterInput: unknown, charges: E2CampaignPolicyCharges): E2CampaignPolicyRow {
  const before = validateE2CampaignPolicyRow(beforeInput)
  const after = validateE2CampaignPolicyRow(afterInput)
  if (before.version >= 2_147_483_646 || after.version !== before.version + 1 ||
    after.createdAt.getTime() !== before.createdAt.getTime() ||
    e2CampaignPolicyImmutableFields.some(field => after[field] !== before[field]))
    fail('allocation transition identity')
  for (const [counter, , absolute] of e2CampaignPolicyCounterCaps) {
    const charge = charges[counter]
    if (!isE2Uint(charge, absolute) || after[counter] !== before[counter] + charge)
      fail(`${counter} transition`)
  }
  return after
}
