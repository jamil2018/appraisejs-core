import { canonicalContractJson } from '@/lib/catalog-contracts'
import { nativeQualificationDigest } from './native-qualification-contract'
import { canonicalOutcomeJson, outcomeDigest } from './outcome-source-contract'
import { describe, expect, it } from 'vitest'
import {
  assertNativeOutcomeSourceFacts,
  assertNativeStartupEvidenceFacts,
  nativeStartupEvidenceRequirements,
  assertNativeOutcomeDossierFacts,
  nativeOutcomeSourceIdentity,
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
  it('requires the 59 retained plus seven startup and one thread-ID requirements and refuses the removed board location', () => {
    expect(observations()).toHaveLength(67)
    const facts = observations()
    facts.find(item => item.path === 'codex-rs/agent-message-board-host/src/lib.rs')!.path =
      'codex-rs/core/src/agent_message_board.rs'
    expect(() => assertNativeOutcomeSourceFacts(facts)).toThrow()
  })
  it('refuses missing, extra and duplicate source observations', () => {
    const facts = observations()
    expect(() => assertNativeOutcomeSourceFacts(facts.slice(1))).toThrow()
    expect(() => assertNativeOutcomeSourceFacts([...facts, facts[0]])).toThrow()
    expect(() => assertNativeOutcomeSourceFacts([facts[0], ...facts.slice(0, -1)])).toThrow()
  })
})

// Metadata fixtures are deliberately non-issuing. Guarded capture computes these facts from bytes;
// no fixture can supply the private captured plan or create an opaque profile.
function dossierFacts() {
  const identity = nativeOutcomeSourceIdentity
  const files = observations().map((file, index) => ({
    ...file,
    gitBlob: index.toString(16).padStart(40, '0'),
    bytes: index + 1,
  }))
  return {
    installedSha256: identity.installedSha256 as string,
    treeSha256: identity.treeSha256 as string,
    staticBindingSha256: identity.staticBindingSha256 as string,
    files,
    tree: {
      sha: identity.sourceCommit as string,
      truncated: false,
      tree: files.map(file => ({ path: file.path, sha: file.gitBlob, size: file.bytes, type: 'blob', mode: '100644' })),
    },
    binding: {
      version: 'M13_CURRENT_NATIVE_INDEPENDENT_STATIC_BINDING_REVIEW_V1',
      decision: 'ACCEPT_NARROW_STATIC_PROGRAM_BODY_BINDING_ONLY',
      judgment: 'accepted',
      binding: { installedSha256: identity.installedSha256 as string, releaseCommit: identity.sourceCommit as string },
      source: {
        treeManifestSha256: identity.treeSha256 as string,
        treeManifestReportedSha: identity.sourceCommit as string,
        treeManifestTruncated: false,
        reconstructedRootTreeSha: identity.sourceGitTree as string,
        commitMetadataTreeSha: identity.sourceGitTree as string,
        commitMetadataTreeAssociationMatchesReconstructedRoot: true,
      },
    },
    receipt: {
      version: 'M13_CURRENT_NATIVE_SOURCE_BLOB_VERIFICATION_V1',
      ...(Object.fromEntries(Object.entries(identity)) as Record<keyof typeof identity, string>),
      files: files.map(file => ({ ...file, sourceOrigin: 'portable non-issuing metadata fixture' })),
    },
  }
}
describe('current source dossier metadata without an opaque issuer', () => {
  it('accepts the exact consistent tuple and cannot issue a live profile', () => {
    expect(() => assertNativeOutcomeDossierFacts(dossierFacts())).not.toThrow()
    expect(() => inspectNativeOutcomeProfile(dossierFacts() as never)).toThrow()
  })
  it.each(Object.keys(nativeOutcomeSourceRequirements))('refuses a missing required pin: %s', selected => {
    const facts = dossierFacts()
    facts.files = facts.files.filter(file => file.path !== selected)
    expect(() => assertNativeOutcomeDossierFacts(facts)).toThrow()
  })
  it.each(['installedSha256', 'treeSha256', 'staticBindingSha256'] as const)('refuses changed %s', key => {
    const facts = dossierFacts()
    facts[key] = '0'.repeat(64)
    expect(() => assertNativeOutcomeDossierFacts(facts)).toThrow()
  })
  it.each(Object.keys(nativeOutcomeSourceIdentity) as Array<keyof typeof nativeOutcomeSourceIdentity>)(
    'refuses the wrong receipt %s',
    key => {
      const facts = dossierFacts()
      facts.receipt[key] = '0'.repeat(facts.receipt[key].length)
      expect(() => assertNativeOutcomeDossierFacts(facts)).toThrow()
    },
  )
  it.each(['missing', 'extra', 'duplicate', 'digest', 'blob', 'size', 'origin', 'old-version'] as const)(
    'refuses %s receipt evidence',
    mode => {
      const facts = dossierFacts()
      const files = facts.receipt.files
      if (mode === 'missing') files.shift()
      if (mode === 'extra') files.push({ ...files[0], path: 'extra.rs' })
      if (mode === 'duplicate') files[1] = { ...files[0] }
      if (mode === 'digest') files[0].sha256 = '0'.repeat(64)
      if (mode === 'blob') files[0].gitBlob = 'f'.repeat(40)
      if (mode === 'size') files[0].bytes++
      if (mode === 'origin') files[0].sourceOrigin = ''
      if (mode === 'old-version') facts.receipt.version = 'OLD_FETCH_RECEIPT'
      expect(() => assertNativeOutcomeDossierFacts(facts)).toThrow()
    },
  )
  const treeMutations: Record<string, (facts: ReturnType<typeof dossierFacts>) => unknown> = {
    missing: facts => facts.tree.tree.shift(),
    duplicate: facts => facts.tree.tree.push({ ...facts.tree.tree[0] }),
    truncated: facts => (facts.tree.truncated = true),
    commit: facts => (facts.tree.sha = 'f'.repeat(40)),
    blob: facts => (facts.tree.tree[0].sha = 'f'.repeat(40)),
    size: facts => facts.tree.tree[0].size++,
    symlink: facts => (facts.tree.tree[0].mode = '120000'),
    type: facts => (facts.tree.tree[0].type = 'tree'),
    path: facts => facts.tree.tree.push({ ...facts.tree.tree[0], path: '../escape' }),
  }
  it.each(Object.entries(treeMutations))('refuses %s tree evidence', (_mode, mutate) => {
    const facts = dossierFacts()
    mutate(facts)
    expect(() => assertNativeOutcomeDossierFacts(facts)).toThrow()
  })
  const bindingMutations: Record<string, (facts: ReturnType<typeof dossierFacts>) => unknown> = {
    decision: facts => (facts.binding.decision = 'REVISE'),
    version: facts => (facts.binding.version = 'OLD_STATIC_BINDING'),
    judgment: facts => (facts.binding.judgment = 'rejected'),
    installed: facts => (facts.binding.binding.installedSha256 = '0'.repeat(64)),
    commit: facts => (facts.binding.binding.releaseCommit = '0'.repeat(40)),
    'tree-digest': facts => (facts.binding.source.treeManifestSha256 = '0'.repeat(64)),
    'tree-commit': facts => (facts.binding.source.treeManifestReportedSha = '0'.repeat(40)),
    'root-tree': facts => (facts.binding.source.reconstructedRootTreeSha = '0'.repeat(40)),
    'metadata-tree': facts => (facts.binding.source.commitMetadataTreeSha = '0'.repeat(40)),
    truncated: facts => (facts.binding.source.treeManifestTruncated = true),
    association: facts => (facts.binding.source.commitMetadataTreeAssociationMatchesReconstructedRoot = false),
  }
  it.each(Object.entries(bindingMutations))('refuses wrong static binding %s', (_mode, mutate) => {
    const facts = dossierFacts()
    mutate(facts)
    expect(() => assertNativeOutcomeDossierFacts(facts)).toThrow()
  })
  it('refuses historical native/source tuples and oversized source observations', () => {
    const facts = dossierFacts()
    facts.installedSha256 = '7cb8700a47be3c81bb3c5efbf2d2adc716ce3db4806e9dc992f2925f78b2b194'
    expect(() => assertNativeOutcomeDossierFacts(facts)).toThrow()
    const oldSource = dossierFacts()
    oldSource.tree.sha = 'd2c035639366e0bf2c316aa2065c24aabc12bcdc'
    expect(() => assertNativeOutcomeDossierFacts(oldSource)).toThrow()
    const oversized = dossierFacts()
    oversized.files[0].bytes = 1024 * 1024 + 1
    expect(() => assertNativeOutcomeDossierFacts(oversized)).toThrow()
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

describe('accepted actual D3 evidence binding is non-issuing', () => {
  const facts = (): Array<{ path: string; sha256: string }> =>
    Object.entries(nativeStartupEvidenceRequirements).map(([path, sha256]) => ({ path, sha256 }))
  it('accepts exactly four actual receipt pins without issuing a profile', () => {
    expect(() => assertNativeStartupEvidenceFacts(facts())).not.toThrow()
    expect(() => inspectNativeOutcomeProfile({} as never)).toThrow()
    expect(() => assertNativeStartupEvidenceFacts(facts().slice(1))).toThrow()
    expect(() => assertNativeStartupEvidenceFacts([...facts(), facts()[0]])).toThrow()
    expect(() => assertNativeStartupEvidenceFacts([facts()[0], ...facts().slice(0, -1)])).toThrow()
  })
  it.each(Object.keys(nativeStartupEvidenceRequirements))('refuses actual evidence drift: %s', path => {
    const changed = facts()
    changed.find(row => row.path === path)!.sha256 = '0'.repeat(64)
    expect(() => assertNativeStartupEvidenceFacts(changed)).toThrow()
  })
})
