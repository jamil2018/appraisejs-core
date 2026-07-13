import type { ReviewArtifact, ValidationArtifact } from '@/lib/plan-contract'
import { describe, expect, it } from 'vitest'

import { assessValidationReadiness, canModifyDuringValidationPreparation, validationNodeHash } from './approval'
import { classifyFile, computeFileReviewDeltas, hashFileContent, reconcileManifest } from './file-review'

const hash = (value: string) => hashFileContent(value)

describe('validation preparation file review', () => {
  it('applies defaults and rejects ambiguous repository overrides', () => {
    expect(classifyFile('src/cart/cart.test.ts').classification).toBe('test_only')
    expect(classifyFile('playwright.config.ts').classification).toBe('test_infrastructure')
    expect(classifyFile('prisma/schema.prisma').classification).toBe('requires_review')
    expect(classifyFile('src/cart/cart.ts').classification).toBe('production')
    expect(() =>
      classifyFile('src/cart/cart.ts', [
        { pattern: 'src/**', classification: 'production' },
        { pattern: '**/*.ts', classification: 'requires_review' },
      ]),
    ).toThrow(/Ambiguous file classification/)
  })

  it('excludes pre-existing dirty content unless validation preparation changes it again', () => {
    const unchangedDirty = computeFileReviewDeltas({
      baseline: { 'src/dirty.ts': 'base' },
      preparationStart: { 'src/dirty.ts': 'user change' },
      current: { 'src/dirty.ts': 'user change', 'src/new.test.ts': 'test' },
      manifestPaths: ['src/new.test.ts'],
    })
    expect(unchangedDirty.map(file => file.path)).toEqual(['src/new.test.ts'])

    const changedAgain = computeFileReviewDeltas({
      baseline: { 'src/dirty.ts': 'base' },
      preparationStart: { 'src/dirty.ts': 'user change' },
      current: { 'src/dirty.ts': 'agent change' },
      manifestPaths: ['src/dirty.ts'],
    })
    expect(changedAgain[0]).toMatchObject({
      path: 'src/dirty.ts',
      beforeHash: hash('user change'),
      contentHash: hash('agent change'),
    })
  })

  it('detects undeclared and missing manifest entries', () => {
    const deltas = computeFileReviewDeltas({
      baseline: {},
      current: { 'src/product.ts': 'code' },
      manifestPaths: [],
    })
    expect(reconcileManifest(deltas, ['missing.test.ts'])).toEqual({
      undeclared: ['src/product.ts'],
      missing: ['missing.test.ts'],
    })
  })
})

describe('validation review approval', () => {
  const appraiseArtifacts = {
    modules: [{ id: 'checkout-module', name: 'Checkout' }],
    testSuites: [
      {
        id: 'checkout-suite',
        name: 'Checkout suite',
        moduleId: 'checkout-module',
        testCaseIds: ['case-one'],
      },
    ],
    testCases: [
      {
        id: 'case-one',
        title: 'Checkout review',
        description: 'AppraiseJS-authored checkout review validation.',
        steps: [
          {
            id: 'review-step',
            order: 0,
            label: 'Review checkout',
            gherkinStep: 'Given I review checkout',
            parameters: [],
          },
        ],
      },
    ],
    locatorGroups: [],
    locators: [],
  }
  const validation: ValidationArtifact = {
    version: '1',
    planId: 'checkout',
    revision: 1,
    baseRevision: { gitCommit: null, snapshotHash: hash('snapshot'), reducedAssurance: true },
    classificationOverrides: [],
    validations: [
      {
        id: 'required-check',
        taskIds: ['task-one'],
        required: true,
        testCaseIds: ['case-one'],
        appraiseArtifacts,
        gherkinPaths: ['automation/features/case-one.feature'],
        stepPaths: ['automation/steps/actions/case-one.step.ts'],
        executable: { path: 'automation/features/case-one.feature' },
        astProvenance: {
          schemaVersion: '2',
          astHash: hash('ast'),
          executionAuthority: 'runtime_capsule',
          publishOperationId: 'publish-required-check',
          receiptHash: hash('receipt'),
          runtimeInputHash: hash('runtime'),
        },
        matrix: [{ browser: 'chromium', environment: 'local' }],
        expectedFailures: [],
      },
    ],
    approvals: [],
    validationDecisions: [],
    files: [
      {
        path: 'src/product.ts',
        classification: 'production',
        rationale: 'Product code',
        status: 'modified',
        beforeHash: hash('old'),
        contentHash: hash('new'),
        patch: 'diff',
        declared: true,
      },
    ],
    manifestPaths: ['src/product.ts'],
    baselineAttempts: [],
    baselineAcknowledgements: [],
    baselineDecision: 'pending',
  }
  const review: ReviewArtifact = {
    version: '1',
    planId: 'checkout',
    threads: [],
    planApprovals: [],
    fileApprovals: [],
  }

  it('blocks progression until required validations and production files are approved', () => {
    expect(assessValidationReadiness(validation, review).blockers).toHaveLength(2)
    expect(canModifyDuringValidationPreparation('src/product.ts', 'production', hash('new'), review)).toBe(false)
  })

  it('blocks validation approval when the manifest has no matching file evidence', () => {
    const mismatched = { ...validation, files: [], manifestPaths: ['src/product.ts'] }

    expect(assessValidationReadiness(mismatched, review)).toMatchObject({
      ready: false,
      blockers: expect.arrayContaining(['Manifest path has no changed-file evidence: src/product.ts']),
    })
  })

  it('accepts current approvals and invalidates a validation decision after generated content changes', () => {
    const current = validation.validations[0]
    const approvedValidation = {
      ...validation,
      validationDecisions: [
        {
          validationId: current.id,
          decision: 'approved' as const,
          contentHash: validationNodeHash(current),
          decidedBy: 'user',
          decidedAt: '2026-06-10T00:00:00Z',
        },
      ],
    }
    const approvedReview = {
      ...review,
      fileApprovals: [
        { path: 'src/product.ts', contentHash: hash('new'), approvedBy: 'user', approvedAt: '2026-06-10T00:00:00Z' },
      ],
    }
    expect(assessValidationReadiness(approvedValidation, approvedReview)).toEqual({ ready: true, blockers: [] })
    const changed = {
      ...approvedValidation,
      validations: [{ ...current, stepPaths: ['automation/steps/actions/changed.step.ts'] }],
    }
    expect(assessValidationReadiness(changed, approvedReview).ready).toBe(false)
  })

  it('invalidates file approval after content changes', () => {
    const approvedReview = {
      ...review,
      fileApprovals: [
        { path: 'src/product.ts', contentHash: hash('new'), approvedBy: 'user', approvedAt: '2026-06-10T00:00:00Z' },
      ],
    }
    expect(canModifyDuringValidationPreparation('src/product.ts', 'production', hash('new'), approvedReview)).toBe(true)
    expect(canModifyDuringValidationPreparation('src/product.ts', 'production', hash('changed'), approvedReview)).toBe(
      false,
    )
  })
})
