import { describe, expect, it } from 'vitest'

import { basicValidationAstSubmission } from '@/test/validation-ast-test-fixtures'
import { buildValidationAstReviewPreview, parseValidationAstReviewPreview } from './review-preview'

describe('Validation AST review preview', () => {
  it('creates a bounded browser projection and parses its durable event payload', () => {
    const preview = buildValidationAstReviewPreview({
      submission: basicValidationAstSubmission(`sha256:${'a'.repeat(64)}`),
      valid: true,
      previewHash: `sha256:${'b'.repeat(64)}`,
      receiptHash: `sha256:${'c'.repeat(64)}`,
      warnings: [{ code: 'semantic-warning', message: 'x'.repeat(500), stepId: 'step-one' }],
      blockers: [],
    })
    expect(preview.warnings[0]!.message).toHaveLength(240)
    expect(preview.scenarios[0]!.steps[0]).toEqual(expect.objectContaining({ actionId: expect.stringMatching(/@1$/) }))
    expect(parseValidationAstReviewPreview(JSON.stringify(preview))).toEqual(preview)
  })
})
