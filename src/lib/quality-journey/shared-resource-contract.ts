import { createHash } from 'node:crypto'

export const sharedResourceKinds = ['MODULE', 'LOCATOR_GROUP', 'LOCATOR', 'TEST_SUITE', 'TEST_CASE'] as const
export type SharedResourceKind = (typeof sharedResourceKinds)[number]
export const sharedResourceSourceKinds = [
  'ENSURE', 'RESOURCE_RESOLUTION', 'AUTOMATION_MATERIALIZATION', 'EXECUTION_CYCLE',
] as const
export type SharedResourceSourceKind = (typeof sharedResourceSourceKinds)[number]
export const sharedResourceBounds = Object.freeze({ keys: 4096, bytes: 1_048_576, epoch: 2_147_483_646 })

export class SharedResourceContractError extends Error {
  constructor(readonly reason: string) {
    super(`Shared resource contract refused: ${reason}`)
    this.name = 'SharedResourceContractError'
  }
}

const refuse = (reason: string): never => { throw new SharedResourceContractError(reason) }
export const isSharedResourceId = (value: unknown): value is string =>
  typeof value === 'string' && /^[\x20-\x7e]{1,128}$/.test(value)
export const isSharedResourceDigest = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)

/** Versioned canonical metadata encoding. Dates must already have been projected to UTC strings. */
export function canonicalSharedResourceJson(value: unknown): string {
  let nodes = 0
  let bytes = 0
  const charge = (text: string): string => {
    bytes += Buffer.byteLength(text, 'utf8')
    if (bytes > sharedResourceBounds.bytes) return refuse('DESCRIPTOR_BYTES')
    return text
  }
  const visit = (item: unknown, depth: number): string => {
    if (++nodes > 65_536 || depth > 32) return refuse('DESCRIPTOR_SHAPE')
    if (item === null || typeof item === 'boolean') return charge(JSON.stringify(item))
    if (typeof item === 'number') {
      if (!Number.isFinite(item) || Object.is(item, -0)) return refuse('DESCRIPTOR_NUMBER')
      return charge(JSON.stringify(item))
    }
    if (typeof item === 'string') {
      if (item.length > sharedResourceBounds.bytes ||
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(item))
        return refuse('DESCRIPTOR_STRING')
      return charge(JSON.stringify(item))
    }
    if (Array.isArray(item)) {
      if (item.length > 65_536) return refuse('DESCRIPTOR_ARRAY')
      charge('[]' + ','.repeat(Math.max(0, item.length - 1)))
      return `[${Array.from(item, entry => visit(entry, depth + 1)).join(',')}]`
    }
    if (!item || typeof item !== 'object' || Object.getPrototypeOf(item) !== Object.prototype)
      return refuse('DESCRIPTOR_VALUE')
    const keys = Object.keys(item).sort()
    if (keys.length > 4096) return refuse('DESCRIPTOR_KEYS')
    charge('{}' + ','.repeat(Math.max(0, keys.length - 1)))
    return `{${keys.map(key => {
      if (!/^[\x20-\x7e]{1,128}$/.test(key)) return refuse('DESCRIPTOR_KEY')
      const descriptor = Object.getOwnPropertyDescriptor(item, key)
      if (!descriptor || !('value' in descriptor)) return refuse('DESCRIPTOR_ACCESSOR')
      return `${charge(JSON.stringify(key) + ':')}${visit(descriptor.value, depth + 1)}`
    }).join(',')}}`
  }
  return visit(value, 0)
}

export function sharedResourceDigest(domain: string, value: unknown): string {
  if (!/^M06_[A-Z0-9_]+_V1$/.test(domain)) return refuse('DIGEST_DOMAIN')
  return createHash('sha256').update(`${domain}\n`).update(canonicalSharedResourceJson(value)).digest('hex')
}

export function sharedSourceDigest(input: Readonly<{
  sourceKind: SharedResourceSourceKind; sourceOwnerId: string; sourceHash: string
}>): string {
  if (!sharedResourceSourceKinds.includes(input.sourceKind) || !isSharedResourceId(input.sourceOwnerId) ||
    typeof input.sourceHash !== 'string' || !input.sourceHash.length || input.sourceHash.length > 4096)
    return refuse('SOURCE_IDENTITY')
  // Existing sourceHash representations, including sha256: prefixes, remain exact wrapper inputs.
  return sharedResourceDigest('M06_SHARED_SOURCE_V1', input)
}

export function sharedUseId(input: Readonly<{
  journeyId: string; targetProjectId: string; sourceKind: SharedResourceSourceKind;
  sourceOwnerId: string; sourceDigest: string
}>): string {
  if (![input.journeyId, input.targetProjectId, input.sourceOwnerId].every(isSharedResourceId) ||
    !sharedResourceSourceKinds.includes(input.sourceKind) || !isSharedResourceDigest(input.sourceDigest))
    return refuse('USE_IDENTITY')
  return sharedResourceDigest('M06_SHARED_USE_V1', input)
}

export function sharedClaimId(useId: string, kind: SharedResourceKind, resourceId: string): string {
  if (!isSharedResourceDigest(useId) || !sharedResourceKinds.includes(kind) || !isSharedResourceId(resourceId))
    return refuse('CLAIM_IDENTITY')
  return sharedResourceDigest('M06_SHARED_CLAIM_V1', { useId, kind, resourceId })
}

export type SharedClaimTuple = Readonly<{
  claimId: string; kind: SharedResourceKind; resourceId: string; dependencyDigest: string
}>

export function sharedClaimSetDigest(claims: readonly SharedClaimTuple[]): string {
  if (claims.length < 1 || claims.length > sharedResourceBounds.keys) return refuse('CLAIM_COUNT')
  const ordered = [...claims].sort((a, b) => a.kind < b.kind ? -1 : a.kind > b.kind ? 1 :
    a.resourceId < b.resourceId ? -1 : a.resourceId > b.resourceId ? 1 : 0)
  let previous: SharedClaimTuple | undefined
  const ids = new Set<string>()
  const tuples = ordered.map(claim => {
    if (!sharedResourceKinds.includes(claim.kind) || !isSharedResourceId(claim.resourceId) ||
      !isSharedResourceDigest(claim.claimId) || !isSharedResourceDigest(claim.dependencyDigest) ||
      ids.has(claim.claimId) || (previous?.kind === claim.kind && previous.resourceId === claim.resourceId))
      return refuse('CLAIM_SET')
    ids.add(claim.claimId)
    previous = claim
    return [claim.claimId, claim.kind, claim.resourceId, claim.dependencyDigest]
  })
  return sharedResourceDigest('M06_SHARED_CLAIM_SET_V1', tuples)
}

/** Neither a partial Claim release nor an inconsistent parent Use opens generic mutation. */
export function sharedClaimProtects(claimState: string, useState: string): boolean {
  return claimState !== 'RELEASED' || useState !== 'RELEASED'
}

export function nextSharedResourceEpoch(epoch: number): number {
  if (!Number.isSafeInteger(epoch) || epoch < 0 || epoch >= sharedResourceBounds.epoch)
    return refuse('EPOCH_EXHAUSTED')
  return epoch + 1
}
