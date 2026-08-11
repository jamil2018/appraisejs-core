import { createHash } from 'node:crypto'

import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { validationArtifactSchema } from '@/lib/quality-design/validation-artifact-contract'
import { hashCanonical } from '@/lib/quality-design/state'
import { validateValidationAstRuntimeInput } from '@/lib/quality-design/validation-runtime-input-contract'
import { ServiceError } from '@/services/shared/errors'

type PublicationInput = {
  targetProjectId: string
  targetFingerprint: string
  qualityPlanRevisionId: string
  validationVersionId: string
  idempotencyKey: string
  expectedRevisionHash: string
  validationHash: string
  validationContent: string
  reviewContent: string
  astId: string
  astHash: string
  contextHash: string
  previewHash: string
  receiptHash: string
  projection: unknown
  validationProjection: unknown
  runtimeInput: unknown
  extensionReviews: Array<{
    extensionId: string
    version: string
    sourceHash: string
    compiledHash: string
    artifactHash: string
    artifactJson: string
  }>
}

const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const publicationId = (receiptHash: string) => `astpub_${receiptHash.slice('sha256:'.length)}`

/**
 * Seal the existing reviewed Validation AST runtime envelope under Quality
 * identities. This preserves the command-receipt/materializer contract while
 * without retaining the removed development-planning ownership chain.
 */
export async function publishQualityValidationRuntime(input: PublicationInput, client: PrismaClient = prisma) {
  const validation = validationArtifactSchema.parse(
    input.validationProjection,
  ) as import('@/lib/quality-design/validation-artifact-contract').ValidationArtifact
  const node = validation.validations.find(item => item.id === input.astId)
  if (!node)
    throw new ServiceError(
      'Quality runtime publication AST id is not present in its validation projection.',
      'VALIDATION',
    )
  const projectionJson = canonicalContractJson(input.projection)
  const validationProjectionJson = canonicalContractJson(validation)
  const runtimeInputJson = canonicalContractJson(input.runtimeInput)
  const runtimeInputHash = digest(input.runtimeInput)
  const reviewHash = digest(input.reviewContent)
  const projectionHash = digest(input.projection)
  const id = publicationId(input.receiptHash)
  const operationHash = hashCanonical({
    id,
    targetProjectId: input.targetProjectId,
    targetFingerprint: input.targetFingerprint,
    qualityPlanRevisionId: input.qualityPlanRevisionId,
    validationVersionId: input.validationVersionId,
    idempotencyKey: input.idempotencyKey,
    expectedRevisionHash: input.expectedRevisionHash,
    validationHash: input.validationHash,
    validationContent: input.validationContent,
    reviewHash,
    reviewContent: input.reviewContent,
    astId: input.astId,
    astHash: input.astHash,
    contextHash: input.contextHash,
    previewHash: input.previewHash,
    receiptHash: input.receiptHash,
    projectionHash,
    projectionJson,
    validationProjectionJson,
    runtimeInputHash,
    runtimeInputJson,
    extensionReviewHashes: input.extensionReviews.map(review => review.artifactHash).sort(),
  })
  validateValidationAstRuntimeInput({
    operation: {
      id,
      targetProjectId: input.targetProjectId,
      targetFingerprint: input.targetFingerprint,
      astId: input.astId,
      astHash: input.astHash,
      contextHash: input.contextHash,
      previewHash: input.previewHash,
      receiptHash: input.receiptHash,
      runtimeInputHash,
      runtimeInputJson,
    },
    projectionJson,
    extensionReviews: input.extensionReviews,
  })
  return client.$transaction(async tx => {
    const existing = await tx.qualityValidationPublication.findUnique({
      where: { validationVersionId: input.validationVersionId },
    })
    if (existing) {
      if (existing.operationHash !== operationHash)
        throw new ServiceError(
          'Quality validation version already has different immutable runtime publication.',
          'CONFLICT',
        )
      return existing
    }
    const created = await tx.qualityValidationPublication.create({
      data: {
        id,
        targetProjectId: input.targetProjectId,
        targetFingerprint: input.targetFingerprint,
        qualityPlanRevisionId: input.qualityPlanRevisionId,
        validationVersionId: input.validationVersionId,
        idempotencyKey: input.idempotencyKey,
        operationHash,
        expectedRevisionHash: input.expectedRevisionHash,
        validationHash: input.validationHash,
        validationContent: input.validationContent,
        reviewHash,
        reviewContent: input.reviewContent,
        astId: input.astId,
        astHash: input.astHash,
        contextHash: input.contextHash,
        previewHash: input.previewHash,
        receiptHash: input.receiptHash,
        projectionHash,
        projectionJson,
        validationProjectionJson,
        runtimeInputHash,
        runtimeInputJson,
        extensionReviews: { create: input.extensionReviews },
      },
    })
    return created
  })
}
