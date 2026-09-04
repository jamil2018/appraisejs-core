import { describe, expect, it } from 'vitest'
import {
  hashResourceResolutionBundle,
  hashTargetObservationBundle,
  resourceResolutionBundleSchema,
  targetObservationBundleSchema,
} from './index'

const digest = (character: string) => `sha256:${character.repeat(64)}`

function provenance() {
  return {
    schemaVersion: 'appraise.quality-journey/v1' as const,
    journeyId: 'journey-1',
    targetProjectId: 'target-1',
    cycleId: 'cycle-1',
    analysisRevision: {
      artifactId: 'analysis-charter-1',
      revisionId: 'analysis-revision-1',
      contentHash: digest('c'),
    },
    analysisApproval: { artifactId: 'analysis-approval-1', contentHash: digest('d') },
    workItemId: 'work-item-1',
    attemptId: 'attempt-1',
    authorizationId: 'authorization-1',
    inputHash: digest('a'),
    assignmentScopeHash: digest('b'),
    approvedRequirementSetHash: digest('2'),
    inputArtifacts: [
      {
        kind: 'ANALYSIS_CHARTER_REVISION' as const,
        artifactId: 'analysis-charter-1',
        revisionId: 'analysis-revision-1',
        contentHash: digest('c'),
      },
      {
        kind: 'JOURNEY_APPROVAL' as const,
        artifactId: 'analysis-approval-1',
        contentHash: digest('d'),
      },
    ],
    evidenceReceipts: [
      { artifactId: 'evidence-bundle-1', contentHash: digest('e') },
      { artifactId: 'evidence-bundle-2', contentHash: digest('f') },
    ],
  }
}

function observationBundle() {
  return {
    ...provenance(),
    bundleId: 'observation-bundle-1',
    observedAt: '2026-09-03T10:00:00.000Z',
    targetSnapshot: {
      snapshotId: 'target-snapshot-1',
      capturedAt: '2026-09-03T09:59:00.000Z',
      contentHash: digest('1'),
    },
    observations: [
      {
        observationId: 'observation-1',
        snapshotId: 'target-snapshot-1',
        routeId: 'checkout',
        environmentId: 'staging',
        fact: 'The checkout form exposes an email input with a visible label.',
        evidenceReceiptIds: ['evidence-bundle-1'],
        confidence: 'HIGH' as const,
        confidenceRationale: 'The label is visible in the captured target snapshot.',
        stability: 'CONDITIONAL' as const,
        stabilityRationale: 'The form changes when a shopper is signed in.',
        revalidationPolicy: { triggers: ['environment.change', 'target.release'], maxAgeSeconds: 86_400 },
      },
    ],
  }
}

function resourceEntry(
  resourceId: string,
  requirementId = 'REQ-CHECKOUT-1',
  rank = 1,
  reasonCode = 'COMPATIBLE',
  resourceKind: 'OPERATION' | 'MODULE' = 'OPERATION',
) {
  return {
    resourceId,
    resourceKind,
    requirementId,
    rank,
    reasonCode,
    explanation: 'The operation has the required browser capability.',
    evidenceReceiptIds: ['evidence-bundle-1'],
  }
}

function resourceBundle() {
  return {
    ...provenance(),
    bundleId: 'resource-bundle-1',
    resolvedAt: '2026-09-03T10:01:00.000Z',
    destinationModuleId: 'module-1',
    approvedRequirementIds: ['REQ-CHECKOUT-1', 'REQ-CHECKOUT-2'],
    reusable: [
      resourceEntry('module-1', 'REQ-CHECKOUT-1', 1, 'COMPATIBLE', 'MODULE'),
      resourceEntry('operation-1', 'REQ-CHECKOUT-1', 2),
    ],
    incompatible: [resourceEntry('operation-2', 'REQ-CHECKOUT-2', 1, 'INCOMPATIBLE')],
    stale: [resourceEntry('operation-3', 'REQ-CHECKOUT-1', 3, 'STALE')],
    crossTarget: [
      {
        ...resourceEntry('operation-4', 'REQ-CHECKOUT-1', 4, 'CROSS_TARGET'),
        sourceTargetProjectId: 'target-previous',
      },
    ],
    missing: [
      {
        requirementId: 'REQ-CHECKOUT-1',
        capabilityId: 'capability-tax-id',
        reasonCode: 'NOT_FOUND',
        explanation: 'No current catalog resource collects a tax identifier.',
        evidenceReceiptIds: ['evidence-bundle-2'],
      },
    ],
  }
}

describe('Quality Journey discovery contracts', () => {
  it('accepts provenance-bound Scout observations and hashes deterministically', () => {
    const parsed = targetObservationBundleSchema.parse(observationBundle())
    expect(parsed.targetSnapshot.snapshotId).toBe('target-snapshot-1')
    expect(hashTargetObservationBundle(parsed)).toBe(hashTargetObservationBundle(observationBundle()))
  })

  it('rejects malformed Scout provenance and incomplete observation evidence or judgments', () => {
    expect(() => targetObservationBundleSchema.parse({ ...observationBundle(), inputArtifacts: [] })).toThrow()
    expect(() => targetObservationBundleSchema.parse({ ...observationBundle(), authorizationId: 'bad id' })).toThrow()
    expect(() =>
      targetObservationBundleSchema.parse({
        ...observationBundle(),
        analysisRevision: { ...provenance().analysisRevision, contentHash: digest('9') },
      }),
    ).toThrow()
    expect(() =>
      targetObservationBundleSchema.parse({
        ...observationBundle(),
        inputArtifacts: [
          provenance().inputArtifacts[0],
          {
            kind: 'ANALYSIS_CHARTER_REVISION',
            artifactId: 'analysis-charter-2',
            revisionId: 'analysis-revision-2',
            contentHash: digest('8'),
          },
          provenance().inputArtifacts[1],
        ],
      }),
    ).toThrow()
    expect(() =>
      targetObservationBundleSchema.parse({
        ...observationBundle(),
        inputArtifacts: [
          provenance().inputArtifacts[0],
          provenance().inputArtifacts[1],
          { kind: 'JOURNEY_APPROVAL', artifactId: 'analysis-approval-2', contentHash: digest('8') },
        ],
      }),
    ).toThrow()
    expect(() =>
      targetObservationBundleSchema.parse({
        ...observationBundle(),
        inputArtifacts: [
          ...provenance().inputArtifacts,
          { ...provenance().inputArtifacts[0], contentHash: digest('9') },
        ],
      }),
    ).toThrow()
    expect(() =>
      targetObservationBundleSchema.parse({ ...observationBundle(), inputArtifacts: [provenance().inputArtifacts[0]] }),
    ).toThrow()
    expect(() =>
      targetObservationBundleSchema.parse({
        ...observationBundle(),
        analysisApproval: { ...provenance().analysisApproval, contentHash: digest('9') },
      }),
    ).toThrow()
    expect(() =>
      targetObservationBundleSchema.parse({
        ...observationBundle(),
        inputArtifacts: [
          provenance().inputArtifacts[0],
          { ...provenance().inputArtifacts[1], revisionId: 'spurious-approval-revision' },
        ],
      }),
    ).toThrow()
    expect(() =>
      targetObservationBundleSchema.parse({
        ...observationBundle(),
        observations: [{ ...observationBundle().observations[0], evidenceReceiptIds: [] }],
      }),
    ).toThrow()
    for (const field of ['confidence', 'stability', 'revalidationPolicy'] as const) {
      const observation = { ...observationBundle().observations[0] }
      delete observation[field]
      expect(() =>
        targetObservationBundleSchema.parse({ ...observationBundle(), observations: [observation] }),
      ).toThrow()
    }
  })

  it('rejects incomplete observation identity, snapshot mismatch, duplicate fields, and unknown fields', () => {
    const observation = observationBundle().observations[0]
    const withoutEnvironment: Record<string, unknown> = { ...observation }
    delete withoutEnvironment.environmentId
    expect(() =>
      targetObservationBundleSchema.parse({ ...observationBundle(), observations: [withoutEnvironment] }),
    ).toThrow()
    expect(() =>
      targetObservationBundleSchema.parse({
        ...observationBundle(),
        observations: [{ ...observation, snapshotId: 'other-snapshot' }],
      }),
    ).toThrow()
    expect(() =>
      targetObservationBundleSchema.parse({ ...observationBundle(), observations: [observation, { ...observation }] }),
    ).toThrow()
    expect(() =>
      targetObservationBundleSchema.parse({
        ...observationBundle(),
        observations: [{ ...observation, evidenceReceiptIds: ['evidence-bundle-1', 'evidence-bundle-1'] }],
      }),
    ).toThrow()
    expect(() =>
      targetObservationBundleSchema.parse({
        ...observationBundle(),
        observations: [{ ...observation, revalidationPolicy: { triggers: ['target.release', 'target.release'] } }],
      }),
    ).toThrow()
    expect(() => targetObservationBundleSchema.parse({ ...observationBundle(), unexpected: true })).toThrow()
  })

  it('accepts complete Resource Explorer classifications and hashes deterministically', () => {
    const parsed = resourceResolutionBundleSchema.parse(resourceBundle())
    expect(parsed.crossTarget[0].sourceTargetProjectId).toBe('target-previous')
    expect(hashResourceResolutionBundle(parsed)).toBe(hashResourceResolutionBundle(resourceBundle()))
  })

  it('rejects non-canonical set-like arrays so permutations cannot create a second hash identity', () => {
    expect(() =>
      targetObservationBundleSchema.parse({
        ...observationBundle(),
        evidenceReceipts: [...provenance().evidenceReceipts].reverse(),
      }),
    ).toThrow()
    expect(() =>
      targetObservationBundleSchema.parse({
        ...observationBundle(),
        inputArtifacts: [...provenance().inputArtifacts].reverse(),
      }),
    ).toThrow()
    expect(() =>
      targetObservationBundleSchema.parse({
        ...observationBundle(),
        observations: [
          {
            ...observationBundle().observations[0],
            evidenceReceiptIds: ['evidence-bundle-2', 'evidence-bundle-1'],
            revalidationPolicy: { triggers: ['target.release', 'environment.change'] },
          },
        ],
      }),
    ).toThrow()
    const permutedRequirements = { ...resourceBundle(), approvedRequirementIds: ['REQ-CHECKOUT-2', 'REQ-CHECKOUT-1'] }
    expect(() => resourceResolutionBundleSchema.parse(permutedRequirements)).toThrow()
    expect(() => hashResourceResolutionBundle(permutedRequirements)).toThrow()
  })

  it('rejects non-viable classification coverage and rank gaps or duplicates', () => {
    const withoutRequirementSetHash: Record<string, unknown> = { ...resourceBundle() }
    delete withoutRequirementSetHash.approvedRequirementSetHash
    expect(() => resourceResolutionBundleSchema.parse(withoutRequirementSetHash)).toThrow()
    expect(() =>
      resourceResolutionBundleSchema.parse({
        ...resourceBundle(),
        reusable: [],
        incompatible: [],
        stale: [],
        crossTarget: [],
        missing: [],
      }),
    ).toThrow()
    expect(() =>
      resourceResolutionBundleSchema.parse({
        ...resourceBundle(),
        reusable: [resourceEntry('operation-1', 'REQ-CHECKOUT-1', 2)],
      }),
    ).toThrow()
    expect(() =>
      resourceResolutionBundleSchema.parse({
        ...resourceBundle(),
        reusable: [resourceEntry('operation-1'), resourceEntry('operation-2', 'REQ-CHECKOUT-1', 1)],
      }),
    ).toThrow()
    expect(() =>
      resourceResolutionBundleSchema.parse({
        ...resourceBundle(),
        incompatible: [resourceEntry('operation-5', 'REQ-CHECKOUT-1', 2, 'INCOMPATIBLE')],
      }),
    ).toThrow()
    expect(() =>
      resourceResolutionBundleSchema.parse({
        ...resourceBundle(),
        approvedRequirementIds: ['REQ-CHECKOUT-1', 'REQ-CHECKOUT-2', 'REQ-UNCOVERED'],
      }),
    ).toThrow()
    expect(() =>
      resourceResolutionBundleSchema.parse({
        ...resourceBundle(),
        reusable: [resourceEntry('operation-1', 'REQ-UNDECLARED')],
      }),
    ).toThrow()
  })

  it('rejects same-requirement identity collisions but permits a resource for distinct requirements', () => {
    expect(() =>
      resourceResolutionBundleSchema.parse({
        ...resourceBundle(),
        incompatible: [resourceEntry('operation-1', 'REQ-CHECKOUT-1', 4, 'INCOMPATIBLE')],
      }),
    ).toThrow()
    expect(() =>
      resourceResolutionBundleSchema.parse({
        ...resourceBundle(),
        incompatible: [resourceEntry('operation-1', 'REQ-CHECKOUT-2', 1, 'INCOMPATIBLE')],
      }),
    ).not.toThrow()
    expect(() =>
      resourceResolutionBundleSchema.parse({
        ...resourceBundle(),
        missing: [resourceBundle().missing[0], { ...resourceBundle().missing[0] }],
      }),
    ).toThrow()
    expect(() =>
      resourceResolutionBundleSchema.parse({
        ...resourceBundle(),
        missing: [{ ...resourceBundle().missing[0], resourceId: 'fabricated-resource-1' }],
      }),
    ).toThrow()
  })

  it('rejects malformed Resource Explorer evidence, cross-target provenance, and unknown fields', () => {
    expect(() => resourceResolutionBundleSchema.parse({ ...resourceBundle(), evidenceReceipts: [] })).toThrow()
    expect(() =>
      resourceResolutionBundleSchema.parse({
        ...resourceBundle(),
        crossTarget: [
          { ...resourceEntry('operation-4', 'REQ-CHECKOUT-1', 3, 'CROSS_TARGET'), sourceTargetProjectId: 'target-1' },
        ],
      }),
    ).toThrow()
    expect(() =>
      resourceResolutionBundleSchema.parse({
        ...resourceBundle(),
        reusable: [{ ...resourceEntry('operation-1'), unexpected: true }],
      }),
    ).toThrow()
    expect(() =>
      resourceResolutionBundleSchema.parse({
        ...resourceBundle(),
        reusable: [{ ...resourceEntry('operation-1'), reasonCode: 'STALE' }],
      }),
    ).toThrow()
    expect(() =>
      resourceResolutionBundleSchema.parse({
        ...resourceBundle(),
        approvedRequirementIds: ['REQ-CHECKOUT-1', 'REQ-CHECKOUT-2', 'REQ-CHECKOUT-3'],
        reusable: [
          resourceEntry('operation-1'),
          resourceEntry('operation-6', 'REQ-CHECKOUT-3', 2),
          resourceEntry('operation-5', 'REQ-CHECKOUT-3', 1),
        ],
      }),
    ).toThrow()
  })
})
