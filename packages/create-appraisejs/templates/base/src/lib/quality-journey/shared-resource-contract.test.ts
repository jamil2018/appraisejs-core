import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  canonicalSharedResourceJson,
  nextSharedResourceEpoch,
  sharedClaimId,
  sharedClaimProtects,
  sharedClaimSetDigest,
  sharedResourceBounds,
  sharedSourceDigest,
  sharedUseId,
} from './shared-resource-contract'

describe('shared resource provenance contract', () => {
  it('binds the exact existing prefixed source hash inside the typed wrapper', () => {
    const input = { sourceKind: 'RESOURCE_RESOLUTION' as const, sourceOwnerId: 'revision-new',
      sourceHash: `sha256:${'a'.repeat(64)}` }
    const expected = createHash('sha256').update('M06_SHARED_SOURCE_V1\n').update(
      `{"sourceHash":"${input.sourceHash}","sourceKind":"RESOURCE_RESOLUTION","sourceOwnerId":"revision-new"}`,
    ).digest('hex')
    expect(sharedSourceDigest(input)).toBe(expected)
    expect(sharedSourceDigest({ ...input, sourceHash: 'a'.repeat(64) })).not.toBe(expected)
    expect(sharedSourceDigest({ ...input, sourceOwnerId: 'revision-other' })).not.toBe(expected)
  })

  it('distinguishes owners and source revisions while sorting exact complete claim sets', () => {
    const use = { journeyId: 'journey-new', targetProjectId: 'project-new',
      sourceKind: 'ENSURE' as const, sourceOwnerId: 'receipt-new', sourceDigest: 'b'.repeat(64) }
    const useId = sharedUseId(use)
    expect(sharedUseId({ ...use, journeyId: 'journey-other' })).not.toBe(useId)
    expect(sharedUseId({ ...use, sourceDigest: 'c'.repeat(64) })).not.toBe(useId)
    const claims = ['locator-new', 'locator-other'].map(resourceId => ({
      claimId: sharedClaimId(useId, 'LOCATOR', resourceId), kind: 'LOCATOR' as const,
      resourceId, dependencyDigest: 'd'.repeat(64),
    }))
    expect(sharedClaimSetDigest(claims)).toBe(sharedClaimSetDigest([...claims].reverse()))
    expect(sharedClaimSetDigest(claims.slice(0, 1))).not.toBe(sharedClaimSetDigest(claims))
    expect(() => sharedClaimSetDigest([claims[0], claims[0]])).toThrow('CLAIM_SET')
    expect(() => sharedClaimSetDigest([])).toThrow('CLAIM_COUNT')
  })

  it('protects partial release and inconsistent states conservatively', () => {
    for (const [claim, use] of [['ACTIVE', 'ACTIVE'], ['RELEASED', 'ACTIVE'],
      ['ACTIVE', 'RELEASED'], ['RELEASED', 'PREPARING'], ['BROKEN', 'RELEASED']]) {
      expect(sharedClaimProtects(claim, use)).toBe(true)
    }
    expect(sharedClaimProtects('RELEASED', 'RELEASED')).toBe(false)
  })

  it('rejects exhausted epochs and bounded or ambiguous descriptor encodings', () => {
    expect(nextSharedResourceEpoch(sharedResourceBounds.epoch - 1)).toBe(sharedResourceBounds.epoch)
    for (const value of [-1, 1.5, Number.NaN, sharedResourceBounds.epoch])
      expect(() => nextSharedResourceEpoch(value)).toThrow('EPOCH_EXHAUSTED')
    expect(() => canonicalSharedResourceJson({ x: undefined })).toThrow('DESCRIPTOR_VALUE')
    expect(() => canonicalSharedResourceJson({ x: new Date(0) })).toThrow('DESCRIPTOR_VALUE')
    expect(() => canonicalSharedResourceJson({ x: '\ud800' })).toThrow('DESCRIPTOR_STRING')
    expect(() => canonicalSharedResourceJson({ x: 'x'.repeat(sharedResourceBounds.bytes) }))
      .toThrow('DESCRIPTOR_BYTES')
    const accessor = Object.defineProperty({}, 'x', { enumerable: true, get: () => { throw new Error('invoked') } })
    expect(() => canonicalSharedResourceJson(accessor)).toThrow('DESCRIPTOR_ACCESSOR')
  })
})
