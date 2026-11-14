import { canonicalContractJson } from '@/lib/catalog-contracts'
import { nativeQualificationDigest } from './native-qualification-contract'
import { canonicalOutcomeJson, outcomeDigest } from './outcome-source-contract'
import { describe, expect, it } from 'vitest'
import {
  assertNativeOutcomeSourceFacts,
  nativeOutcomeSourceRequirements,
  captureNativeOutcomeProfile,
  inspectNativeOutcomeProfile,
  nativeOutcomeReviewControlDigest,
} from './native-outcome-profile'

// Non-issuing source-fact checks remain portable: no ignored dossier, native binary or provider credential is needed.
// Positive opaque profile capture requires the actual task's complete guarded dossier and original frozen plan.
const observations = (): Array<{ path: string; sha256: string }> =>
  Object.entries(nativeOutcomeSourceRequirements).map(([path, sha256]) => ({ path, sha256 }))
describe('fixed native source facts without a qualification issuer', () => {
  it('accepts exactly the required observed public source digests and cannot reconstruct a live profile', () => {
    expect(() => assertNativeOutcomeSourceFacts(observations())).not.toThrow()
    expect(() => inspectNativeOutcomeProfile({} as never)).toThrow()
    expect(() => captureNativeOutcomeProfile({} as never, '/missing-source-dossier', {} as never)).toThrow()
  })
  for (const selected of Object.keys(nativeOutcomeSourceRequirements))
    it(`refuses source-predicate drift: ${selected}`, () => {
      const facts = observations()
      facts.find(item => item.path === selected)!.sha256 = '0'.repeat(64)
      expect(() => assertNativeOutcomeSourceFacts(facts)).toThrow()
    })
  it('refuses missing, extra and duplicate source observations', () => {
    const facts = observations()
    expect(() => assertNativeOutcomeSourceFacts(facts.slice(1))).toThrow()
    expect(() => assertNativeOutcomeSourceFacts([...facts, facts[0]])).toThrow()
    expect(() => assertNativeOutcomeSourceFacts([facts[0], ...facts.slice(0, -1)])).toThrow()
  })
})

describe('original profile review-control digest representation', () => {
  const control = Object.freeze({
    reviewerId: 'reviewer',
    nonce: '00000000-0000-4000-8000-000000000001',
    reviewMs: 300000,
    reconciliationMs: 60000,
  })
  it('retains the issuer golden vector and is independent of insertion order', () => {
    expect(canonicalContractJson(control)).toBe(
      '{"nonce":"00000000-0000-4000-8000-000000000001","reconciliationMs":60000,"reviewerId":"reviewer","reviewMs":300000}',
    )
    expect(nativeOutcomeReviewControlDigest(control)).toBe(
      'sha256:bc80d6c140f637a0e3c021a73b819706f1a11ddfc395bc9d74840a3c141d15a9',
    )
    expect(nativeOutcomeReviewControlDigest(control)).toBe(nativeQualificationDigest(canonicalContractJson(control)))
    expect(
      nativeOutcomeReviewControlDigest({ ...Object.fromEntries(Object.entries(control).reverse()) } as typeof control),
    ).toBe(nativeOutcomeReviewControlDigest(control))
  })
  it('distinguishes the case-sensitive key-order counterexample without changing either canonicalizer', () => {
    expect(outcomeDigest(canonicalOutcomeJson(control))).toBe(
      'sha256:504633eadf9ab528acb2117ebbbd7196eaa67f9a5576e0e25eca41d0bc0edce1',
    )
    expect(nativeOutcomeReviewControlDigest(control)).not.toBe(outcomeDigest(canonicalOutcomeJson(control)))
    expect(nativeOutcomeReviewControlDigest({ ...control, reviewMs: 299999 })).not.toBe(
      nativeOutcomeReviewControlDigest(control),
    )
  })
})
