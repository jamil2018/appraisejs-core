import { describe, expect, it } from 'vitest'

import { serializeYamlArtifact, type ReviewArtifact, type ValidationArtifact } from '@/lib/plan-contract'

import {
  immutableReviewContent,
  managedReviewStateHash,
  managedValidationProjectionState,
  managedValidationStateHash,
  validationReviewStateReceipt,
} from './managed-validation-review-state'

const validation = {
  version: '1',
  planId: 'plan-one',
  revision: 1,
  baseRevision: { gitCommit: null, snapshotHash: `sha256:${'a'.repeat(64)}`, reducedAssurance: false },
  classificationOverrides: [],
  validations: [],
  approvals: [],
  validationDecisions: [],
  files: [],
  manifestPaths: [],
  baselineAttempts: [],
  baselineAcknowledgements: [],
  baselineDecision: 'pending',
} satisfies ValidationArtifact

const review = {
  version: '1',
  planId: 'plan-one',
  threads: [],
  planApprovals: [],
  fileApprovals: [],
} satisfies ReviewArtifact

function receipt(validationContent: string, reviewContent: string, projection: string) {
  return validationReviewStateReceipt({
    validationHash: managedValidationStateHash(validationContent),
    reviewHash: managedReviewStateHash(reviewContent),
    validationProjectionJson: managedValidationProjectionState(projection),
  }).hash
}

describe('managed validation review state', () => {
  it('ignores representation-only YAML and JSON formatting changes', () => {
    const validationYaml = serializeYamlArtifact('validation', validation)
    const reviewYaml = serializeYamlArtifact('review', review)
    const compactProjection = JSON.stringify(validation)

    expect(receipt(`\n${validationYaml}`, `${reviewYaml}\n`, JSON.stringify(validation, null, 2))).toBe(
      receipt(validationYaml, reviewYaml, compactProjection),
    )
  })

  it('changes when review decisions change', () => {
    const validationYaml = serializeYamlArtifact('validation', validation)
    const reviewYaml = serializeYamlArtifact('review', review)
    const decided = {
      ...validation,
      validationDecisions: [
        {
          validationId: 'validation-one',
          decision: 'approved' as const,
          contentHash: `sha256:${'b'.repeat(64)}`,
          decidedBy: 'reviewer',
          decidedAt: '2026-07-19T12:00:00.000Z',
        },
      ],
    }

    expect(receipt(serializeYamlArtifact('validation', decided), reviewYaml, JSON.stringify(decided))).not.toBe(
      receipt(validationYaml, reviewYaml, JSON.stringify(validation)),
    )
  })

  it('keeps validation publication identity stable when remark status changes', () => {
    const created = {
      ...review,
      threads: [
        {
          id: 'remark-one',
          target: { type: 'plan' as const },
          blocking: true,
          events: [
            {
              id: 'remark-event-one',
              action: 'created' as const,
              actor: 'reviewer',
              createdAt: '2026-08-05T12:00:00.000Z',
              body: 'Add exact coverage.',
            },
          ],
        },
      ],
    }
    const resolved = structuredClone(created)
    resolved.threads[0]!.events.push({
      id: 'remark-event-two',
      action: 'resolved',
      actor: 'reviewer',
      createdAt: '2026-08-05T12:05:00.000Z',
    })

    const createdYaml = serializeYamlArtifact('review', created)
    const resolvedYaml = serializeYamlArtifact('review', resolved)
    expect(immutableReviewContent(resolvedYaml)).toBe(immutableReviewContent(createdYaml))
    expect(managedReviewStateHash(resolvedYaml)).toBe(managedReviewStateHash(createdYaml))
  })
})
