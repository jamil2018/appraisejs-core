import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { advanceValidationAstPublish, prepareValidationAstPublish } from './validation-ast-publish-journal-service'

describe('Validation AST publish journal', () => {
  it('prepares immutable reviews idempotently and advances phases once', async () => {
    const operation = {
      id: 'op',
      planId: 'plan',
      idempotencyKey: 'key',
      phase: 'prepared',
      validationHash: 'vh',
      reviewHash: 'rh',
    }
    const tx = {
      validationAstPublishOperation: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(operation),
      },
      validationExtensionReview: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    }
    const client = {
      $transaction: (fn: (value: unknown) => unknown) => fn(tx),
      validationAstPublishOperation: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ ...operation, phase: 'artifacts_written' }),
      },
    } as never
    const digest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`
    await expect(
      prepareValidationAstPublish(
        {
          planId: 'plan',
          planProjectionId: 'projection',
          targetProjectId: 'target',
          targetFingerprint: digest('target'),
          idempotencyKey: 'key',
          expectedPlanHash: digest('old-plan'),
          expectedPlanArtifactHash: digest('old-plan-file'),
          expectedReviewHash: digest('old-review'),
          planHash: digest('{}'),
          validationHash: digest('{}'),
          reviewHash: digest('{}'),
          planContent: '{}',
          validationContent: '{}',
          reviewContent: '{}',
          astId: 'ast',
          astHash: digest('ast'),
          contextHash: digest('context'),
          previewHash: digest('preview'),
          receiptHash: digest('receipt'),
          projectionHash: digest('{}'),
          projectionJson: '{}',
          validationProjectionJson: '{}',
          extensionReviews: [],
        },
        client,
      ),
    ).resolves.toMatchObject({ id: 'op' })
    expect(tx.validationExtensionReview.createMany).toHaveBeenCalledWith({ data: [] })
    await expect(
      advanceValidationAstPublish({ operationId: 'op', from: 'prepared', to: 'artifacts_written' }, client),
    ).resolves.toMatchObject({ phase: 'artifacts_written' })
  })
})
