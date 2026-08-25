import { beforeEach, describe, expect, it, vi } from 'vitest'

const { database, scopeGuard, transaction } = vi.hoisted(() => {
  const transaction = {
    qualityPlanRevision: { findUnique: vi.fn() },
    validationVersion: { findUnique: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    qualityValidationGeneration: { findUnique: vi.fn(), create: vi.fn() },
    qualityValidationPublicationCommandReceipt: { findUnique: vi.fn(), create: vi.fn() },
    qualityValidationPublication: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn() },
    module: { upsert: vi.fn() },
    locatorGroup: { upsert: vi.fn() },
    locator: { upsert: vi.fn() },
    testCase: { upsert: vi.fn() },
    testCaseStep: { upsert: vi.fn() },
    testSuite: { upsert: vi.fn() },
  }
  return {
    transaction,
    database: { $transaction: vi.fn(async callback => callback(transaction)) },
    scopeGuard: vi.fn(),
  }
})

vi.mock('@/config/db-config', () => ({ default: database }))
vi.mock('@/lib/quality-design/validation-realization', () => ({
  canonicalizeAndValidateQualityRealization: vi.fn(() => ({
    envelope: { idempotencyKey: 'publication-key', projection: {}, validationProjection: {}, extensionReviews: [] },
    validation: {
      validations: [
        {
          id: 'validation-1',
          astProvenance: { publishOperationId: 'astpub_receipt' },
          appraiseArtifacts: { modules: [], locatorGroups: [], locators: [], testCases: [], testSuites: [] },
        },
      ],
    },
    runtimeInput: {
      astId: 'validation-1',
      astHash: 'sha256:ast',
      contextHash: 'sha256:context',
      previewHash: 'sha256:preview',
      receiptHash: 'sha256:receipt',
    },
  })),
}))
vi.mock('./remote-evaluation-scope-service', () => ({
  assertRemoteEvaluationScopeCurrent: scopeGuard,
}))

import { publishQualityValidationRuntime } from './quality-validation-publication-service'

const scope = {
  subjectRevisionId: 'subject-1',
  targetProjectId: 'target-1',
  qualityPlanId: 'plan-1',
  qualityPlanRevisionId: 'revision-1',
  environmentId: 'environment-1',
  scopeHash: 'sha256:scope',
  environmentSnapshotHash: 'sha256:environment',
  environmentSnapshotJson: '{}',
  environmentScopeVersion: 1,
  environmentUpdatedAt: new Date('2026-08-22T00:00:00.000Z'),
}

const input = {
  targetProjectId: 'target-1',
  targetFingerprint: 'sha256:target',
  qualityPlanRevisionId: 'revision-1',
  validationVersionId: 'validation-1',
  idempotencyKey: 'publication-key',
  expectedRevisionHash: 'sha256:revision',
  validationHash: 'sha256:validation',
  validationContent: '{}',
  expectedRealizationHash: 'sha256:realization',
  reviewContent: '{}',
  astId: 'validation-1',
  astHash: 'sha256:ast',
  contextHash: 'sha256:context',
  previewHash: 'sha256:preview',
  receiptHash: 'sha256:receipt',
  projection: {},
  validationProjection: {},
  runtimeInput: {
    astId: 'validation-1',
    astHash: 'sha256:ast',
    contextHash: 'sha256:context',
    previewHash: 'sha256:preview',
    receiptHash: 'sha256:receipt',
  },
  extensionReviews: [],
  remoteScopeBinding: scope,
}

describe('remote publication transaction guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    transaction.qualityPlanRevision.findUnique.mockResolvedValue({ contentHash: 'sha256:revision' })
    transaction.validationVersion.findUnique.mockResolvedValue({
      canonicalHash: 'sha256:validation',
      canonicalAstJson: '{}',
      realizationHash: 'sha256:realization',
    })
    transaction.validationVersion.updateMany.mockResolvedValue({ count: 1 })
    transaction.validationVersion.findUniqueOrThrow.mockResolvedValue({ activeGenerationId: 'qvg_active' })
    transaction.qualityValidationGeneration.findUnique.mockResolvedValue(null)
    transaction.qualityValidationGeneration.create.mockResolvedValue({
      id: 'qvg_active',
      generationKey: 'sha256:generation',
    })
    transaction.qualityValidationPublication.findUnique.mockResolvedValue(null)
    transaction.qualityValidationPublication.create.mockResolvedValue({ id: 'qvp_publication' })
    transaction.qualityValidationPublicationCommandReceipt.findUnique.mockResolvedValue(null)
  })

  it('rejects realization drift at the projection transaction before every projection/publication write', async () => {
    transaction.validationVersion.findUnique.mockResolvedValue({
      canonicalHash: 'sha256:validation',
      canonicalAstJson: '{}',
      realizationHash: 'sha256:changed-realization',
    })

    await expect(publishQualityValidationRuntime(input as never)).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { code: 'remote_evaluation_scope_stale' },
    })
    expect(scopeGuard).toHaveBeenCalledWith(scope, transaction)
    expect(transaction.qualityValidationPublication.findUnique).not.toHaveBeenCalled()
    expect(transaction.qualityValidationPublication.create).not.toHaveBeenCalled()
    expect(transaction.module.upsert).not.toHaveBeenCalled()
    expect(transaction.locatorGroup.upsert).not.toHaveBeenCalled()
    expect(transaction.locator.upsert).not.toHaveBeenCalled()
    expect(transaction.testCase.upsert).not.toHaveBeenCalled()
    expect(transaction.testSuite.upsert).not.toHaveBeenCalled()
  })

  it('rejects a different generation when the version active selector is already set', async () => {
    transaction.validationVersion.updateMany.mockResolvedValue({ count: 0 })
    transaction.validationVersion.findUniqueOrThrow.mockResolvedValue({ activeGenerationId: 'qvg_foreign' })

    await expect(publishQualityValidationRuntime(input as never)).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { code: 'active_generation_conflict' },
    })
    expect(transaction.qualityValidationPublicationCommandReceipt.create).not.toHaveBeenCalled()
  })

  it('rejects same caller key when its sealed generation/publication request differs', async () => {
    transaction.qualityValidationPublicationCommandReceipt.findUnique.mockResolvedValue({
      requestHash: 'sha256:another-request',
      publicationId: 'qvp_old',
    })

    await expect(publishQualityValidationRuntime(input as never)).rejects.toMatchObject({
      code: 'CONFLICT',
      details: { code: 'publication_command_conflict' },
    })
    expect(transaction.qualityValidationGeneration.create).not.toHaveBeenCalled()
    expect(transaction.qualityValidationPublication.create).not.toHaveBeenCalled()
  })

  it('converges a publication unique race to the exact committed artifact', async () => {
    transaction.qualityValidationGeneration.findUnique.mockResolvedValue({
      id: 'qvg_active',
      generationKey: 'sha256:generation',
    })
    const raced = { id: 'qvp_raced', operationHash: '' }
    transaction.qualityValidationPublication.findUnique.mockImplementation(async () => {
      if (!transaction.qualityValidationPublication.create.mock.calls.length) return null
      raced.operationHash = (
        transaction.qualityValidationPublication.create.mock.calls[0]?.[0] as { data: { operationHash: string } }
      ).data.operationHash
      return raced
    })
    transaction.qualityValidationPublication.create.mockRejectedValueOnce({ code: 'P2002' })

    await expect(publishQualityValidationRuntime(input as never)).resolves.toMatchObject({ id: raced.id })
    expect(transaction.qualityValidationPublication.create).toHaveBeenCalledTimes(1)
    expect(transaction.qualityValidationPublicationCommandReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ publicationId: raced.id }) }),
    )
  })
})
