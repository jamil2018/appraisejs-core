import { describe, expect, it } from 'vitest'

import {
  assuranceSatisfies,
  canApproveRequirements,
  hashCanonical,
  hashEvidenceReceipt,
  hashQualityPlanRevision,
} from './state'

describe('quality design state policy', () => {
  it('hashes canonical content independent of object key order', () => {
    expect(hashCanonical({ b: 2, a: { d: 4, c: 3 } })).toBe(hashCanonical({ a: { c: 3, d: 4 }, b: 2 }))
  })

  it('keeps Quality Plan revision hashes tied to requirement and obligation content', () => {
    const base = {
      sourceSpecification: 'Users can export sealed assessment evidence.',
      requirementGraph: { nodes: [{ id: 'r1' }], edges: [] },
      requirements: [{ id: 'r1', text: 'Export evidence' }],
      obligations: [{ id: 'o1', requirementId: 'r1', minimumAssurance: 'STANDARD' }],
    }

    const changed = {
      ...base,
      obligations: [{ id: 'o1', requirementId: 'r1', minimumAssurance: 'HIGH' }],
    }

    expect(hashQualityPlanRevision(base)).not.toBe(hashQualityPlanRevision(changed))
  })

  it('blocks requirement approval while any query is blocking', () => {
    expect(canApproveRequirements([{ status: 'ANSWERED' }, { status: 'BLOCKING' }])).toBe(false)
    expect(canApproveRequirements([{ status: 'DEFERRED' }, { status: 'ACCEPTED_ASSUMPTION' }])).toBe(true)
  })

  it('treats stronger observed assurance as satisfying weaker requirements', () => {
    expect(assuranceSatisfies('HIGH', 'STANDARD')).toBe(true)
    expect(assuranceSatisfies('SMOKE', 'HIGH')).toBe(false)
  })

  it('seals evidence at validation-version and matrix-cell granularity', () => {
    const baseReceipt = {
      validationVersionHash: 'validation-version-hash',
      resultMatrixCell: 'chromium:admin:happy-path',
      subjectDigest: 'artifact-digest',
      runtimeInputHash: 'runtime-input',
      environmentSnapshotHash: 'environment',
      browserSnapshotHash: 'browser',
      dataProvenanceHash: 'data',
      outputHash: 'output',
      outcome: 'passed',
      reportHash: 'report',
      logHash: 'log',
      traceHash: 'trace',
    }

    expect(hashEvidenceReceipt(baseReceipt)).toBe(hashEvidenceReceipt({ ...baseReceipt }))
    expect(hashEvidenceReceipt(baseReceipt)).not.toBe(
      hashEvidenceReceipt({ ...baseReceipt, resultMatrixCell: 'webkit:admin:happy-path' }),
    )
    expect(hashEvidenceReceipt(baseReceipt)).not.toBe(
      hashEvidenceReceipt({ ...baseReceipt, validationVersionHash: 'successor-validation-version-hash' }),
    )
    const managed = {
      ...baseReceipt,
      targetProjectId: 'target-a',
      assessmentId: 'assessment-root',
      assessmentRunId: 'assessment-run-1',
    }
    expect(hashEvidenceReceipt(managed)).toBe(hashEvidenceReceipt({ ...managed }))
    for (const change of [
      { targetProjectId: 'target-b' },
      { assessmentId: 'assessment-successor' },
      { assessmentRunId: 'assessment-run-2' },
    ])
      expect(hashEvidenceReceipt(managed)).not.toBe(hashEvidenceReceipt({ ...managed, ...change }))

    const generationBound = {
      ...managed,
      generationId: 'generation-1',
      publicationId: 'publication-1',
      publicationOperationHash: 'sha256:publication-operation',
    }
    expect(hashEvidenceReceipt(generationBound)).not.toBe(hashEvidenceReceipt(managed))
    expect(hashEvidenceReceipt(generationBound)).not.toBe(
      hashEvidenceReceipt({ ...generationBound, publicationId: 'publication-2' }),
    )
    expect(() => hashEvidenceReceipt({ ...managed, generationId: 'generation-1' })).toThrow(
      /generationId, publicationId, and publicationOperationHash/,
    )
  })
})
