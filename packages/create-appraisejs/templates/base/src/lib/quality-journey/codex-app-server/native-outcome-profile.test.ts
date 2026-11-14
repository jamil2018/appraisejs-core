import { describe, expect, it } from 'vitest'
import {
  assertNativeOutcomeSourceFacts,
  nativeOutcomeSourceRequirements,
  captureNativeOutcomeProfile,
  inspectNativeOutcomeProfile,
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
