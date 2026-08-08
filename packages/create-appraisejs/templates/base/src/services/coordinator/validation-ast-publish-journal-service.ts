import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { validationNodeHash } from '@/lib/validation-review/approval'
import type { ValidationArtifact } from '@/lib/plan-contract'
import { ServiceError } from '@/services/shared/errors'
import {
  validateValidationAstRuntimeInput,
  validationAstPublishOperationId,
} from './validation-ast-runtime-input-contract'

export {
  validateValidationAstRuntimeInput,
  validationAstPublishOperationId,
  type ValidationAstRuntimeInput,
} from './validation-ast-runtime-input-contract'

const VALIDATION_AST_PUBLISH_PHASES = ['prepared', 'artifacts_written', 'projected', 'review_ready'] as const
type Phase = (typeof VALIDATION_AST_PUBLISH_PHASES)[number]
type PublicationClient = PrismaClient | import('@prisma/client').Prisma.TransactionClient
const MAX_ARTIFACT_BYTES = 1024 * 1024
const MAX_EXTENSIONS = 8
const MAX_EXTENSION_ARTIFACT_BYTES = 256 * 1024
const digest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`
const operationDigest = (value: unknown) =>
  `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const immutableOperationHash = (value: Record<string, unknown>, extensionReviewHashes: string[]) =>
  operationDigest({
    ...(typeof value.runtimeInputHash === 'string' ? { id: value.id } : {}),
    planId: value.planId,
    planProjectionId: value.planProjectionId,
    targetProjectId: value.targetProjectId,
    targetFingerprint: value.targetFingerprint,
    idempotencyKey: value.idempotencyKey,
    expectedPlanHash: value.expectedPlanHash,
    expectedPlanArtifactHash: value.expectedPlanArtifactHash,
    expectedValidationHash: value.expectedValidationHash ?? null,
    expectedReviewHash: value.expectedReviewHash,
    planHash: value.planHash,
    validationHash: value.validationHash,
    reviewHash: value.reviewHash,
    planContent: value.planContent,
    validationContent: value.validationContent,
    reviewContent: value.reviewContent,
    astId: value.astId,
    astHash: value.astHash,
    contextHash: value.contextHash,
    previewHash: value.previewHash,
    receiptHash: value.receiptHash,
    projectionHash: value.projectionHash,
    projectionJson: value.projectionJson,
    validationProjectionJson: value.validationProjectionJson,
    ...(typeof value.runtimeInputHash === 'string' && typeof value.runtimeInputJson === 'string'
      ? { runtimeInputHash: value.runtimeInputHash, runtimeInputJson: value.runtimeInputJson }
      : {}),
    extensionReviewHashes: [...extensionReviewHashes].sort(),
  })

function validationNodePublicationHash(input: {
  planId: string
  targetProjectId: string
  validationId: string
  contentHash: string
  publishOperationId: string
  operationHash: string
  runtimeInputHash: string
  projectionHash: string
}) {
  return operationDigest(input)
}

export async function ensureValidationNodePublications(
  input: { operationId: string; validation: ValidationArtifact },
  client: PublicationClient,
) {
  const operation = await client.validationAstPublishOperation.findUniqueOrThrow({
    where: { id: input.operationId },
    select: {
      id: true,
      planId: true,
      targetProjectId: true,
      operationHash: true,
      runtimeInputHash: true,
      projectionHash: true,
      createdAt: true,
      plan: { select: { targetProjectId: true } },
    },
  })
  const runtimeInputHash = operation.runtimeInputHash
  if (!runtimeInputHash || operation.plan.targetProjectId !== operation.targetProjectId)
    throw new ServiceError('Validation publication ownership or runtime identity is invalid.', 'CONFLICT')
  const publications = await Promise.all(
    input.validation.validations.map(async node => {
      const contentHash = validationNodeHash(node)
      const publicationHash = validationNodePublicationHash({
        planId: operation.planId,
        targetProjectId: operation.targetProjectId,
        validationId: node.id,
        contentHash,
        publishOperationId: operation.id,
        operationHash: operation.operationHash,
        runtimeInputHash,
        projectionHash: operation.projectionHash,
      })
      const publication = await client.validationNodePublication.upsert({
        where: { publishOperationId_validationId: { publishOperationId: operation.id, validationId: node.id } },
        update: {},
        create: {
          planId: operation.planId,
          targetProjectId: operation.targetProjectId,
          validationId: node.id,
          contentHash,
          publishOperationId: operation.id,
          operationHash: operation.operationHash,
          runtimeInputHash,
          projectionHash: operation.projectionHash,
          publicationHash,
          publishedAt: operation.createdAt,
        },
      })
      if (
        publication.planId !== operation.planId ||
        publication.targetProjectId !== operation.targetProjectId ||
        publication.contentHash !== contentHash ||
        publication.operationHash !== operation.operationHash ||
        publication.runtimeInputHash !== runtimeInputHash ||
        publication.projectionHash !== operation.projectionHash ||
        publication.publicationHash !== publicationHash
      )
        throw new ServiceError('Validation publication identity conflicts with immutable history.', 'CONFLICT')
      return publication
    }),
  )
  return publications.sort((left, right) => left.validationId.localeCompare(right.validationId))
}

function validateExtensionReview(review: {
  extensionId: string
  version: string
  sourceHash: string
  compiledHash: string
  artifactHash: string
  artifactJson: string
}) {
  if (Buffer.byteLength(review.artifactJson) > MAX_EXTENSION_ARTIFACT_BYTES)
    throw new ServiceError('Extension review payload exceeds 256 KiB.', 'VALIDATION')
  const artifact = JSON.parse(review.artifactJson) as {
    extension?: { id?: string; version?: string }
    source?: string
    compiledSource?: string
    sourceHash?: string
    compiledHash?: string
  }
  const expected = [
    [operationDigest(artifact), review.artifactHash],
    [artifact.extension?.id, review.extensionId],
    [artifact.extension?.version, review.version],
    [artifact.sourceHash, review.sourceHash],
    [artifact.compiledHash, review.compiledHash],
    [digest(artifact.source ?? ''), review.sourceHash],
    [digest(artifact.compiledSource ?? ''), review.compiledHash],
  ]
  if (expected.some(([actual, wanted]) => actual !== wanted))
    throw new ServiceError(`Extension review hash mismatch for ${review.extensionId}.`, 'VALIDATION')
}

export function validateStoredValidationAstPublish(
  operation: Record<string, unknown> & { extensionReviews: Array<Parameters<typeof validateExtensionReview>[0]> },
) {
  for (const key of [
    'planContent',
    'validationContent',
    'reviewContent',
    'projectionJson',
    'validationProjectionJson',
  ] as const)
    if (typeof operation[key] !== 'string' || Buffer.byteLength(operation[key]) > MAX_ARTIFACT_BYTES)
      throw new ServiceError('Stored publish payload is invalid or oversized.', 'CONFLICT')
  const hasRuntimeInput = operation.runtimeInputJson != null || operation.runtimeInputHash != null
  if (
    hasRuntimeInput &&
    (typeof operation.runtimeInputJson !== 'string' ||
      Buffer.byteLength(operation.runtimeInputJson) > MAX_ARTIFACT_BYTES ||
      typeof operation.runtimeInputHash !== 'string')
  )
    throw new ServiceError('Stored runtime input payload is invalid or oversized.', 'CONFLICT')
  if (
    digest(operation.planContent as string) !== operation.planHash ||
    digest(operation.validationContent as string) !== operation.validationHash ||
    digest(operation.reviewContent as string) !== operation.reviewHash ||
    operationDigest(JSON.parse(operation.projectionJson as string)) !== operation.projectionHash ||
    (hasRuntimeInput &&
      operationDigest(JSON.parse(operation.runtimeInputJson as string)) !== operation.runtimeInputHash)
  )
    throw new ServiceError('Stored publish payload hash mismatch.', 'CONFLICT')
  if (operation.extensionReviews.length > MAX_EXTENSIONS)
    throw new ServiceError('Stored publish has too many extension reviews.', 'CONFLICT')
  operation.extensionReviews.forEach(validateExtensionReview)
  if (hasRuntimeInput)
    validateValidationAstRuntimeInput({
      operation,
      projectionJson: operation.projectionJson as string,
      extensionReviews: operation.extensionReviews,
    })
  if (
    immutableOperationHash(
      operation,
      operation.extensionReviews.map(review => review.artifactHash),
    ) !== operation.operationHash
  )
    throw new ServiceError('Stored publish operation hash mismatch.', 'CONFLICT')
}

export async function prepareValidationAstPublish(
  input: {
    id: string
    planId: string
    planProjectionId: string
    targetProjectId: string
    targetFingerprint: string
    idempotencyKey: string
    expectedPlanHash: string
    expectedPlanArtifactHash: string
    expectedValidationHash?: string
    expectedReviewHash: string
    planHash: string
    validationHash: string
    reviewHash: string
    planContent: string
    validationContent: string
    reviewContent: string
    astId: string
    astHash: string
    contextHash: string
    previewHash: string
    receiptHash: string
    projectionHash: string
    projectionJson: string
    validationProjectionJson: string
    runtimeInputHash: string
    runtimeInputJson: string
    extensionReviews: Array<{
      extensionId: string
      version: string
      sourceHash: string
      compiledHash: string
      artifactHash: string
      artifactJson: string
    }>
  },
  client: PrismaClient = prisma,
) {
  if (input.id !== validationAstPublishOperationId(input.receiptHash))
    throw new ServiceError('Validation AST publish operation id does not match its receipt.', 'VALIDATION')
  for (const content of [
    input.planContent,
    input.validationContent,
    input.reviewContent,
    input.projectionJson,
    input.validationProjectionJson,
    input.runtimeInputJson,
  ])
    if (Buffer.byteLength(content) > MAX_ARTIFACT_BYTES)
      throw new ServiceError('Publish payload exceeds 1 MiB.', 'VALIDATION')
  if (input.extensionReviews.length > MAX_EXTENSIONS)
    throw new ServiceError('Too many extension reviews.', 'VALIDATION')
  if (
    digest(input.planContent) !== input.planHash ||
    digest(input.validationContent) !== input.validationHash ||
    digest(input.reviewContent) !== input.reviewHash ||
    operationDigest(JSON.parse(input.projectionJson)) !== input.projectionHash ||
    operationDigest(JSON.parse(input.runtimeInputJson)) !== input.runtimeInputHash
  )
    throw new ServiceError('Publish artifact hash does not match its server payload.', 'VALIDATION')
  input.extensionReviews.forEach(validateExtensionReview)
  validateValidationAstRuntimeInput({
    operation: input,
    projectionJson: input.projectionJson,
    extensionReviews: input.extensionReviews,
  })
  const operationHash = immutableOperationHash(
    { ...input, expectedValidationHash: input.expectedValidationHash ?? null },
    input.extensionReviews.map(item => item.artifactHash),
  )
  return client.$transaction(async tx => {
    const existing = await tx.validationAstPublishOperation.findUnique({
      where: { planId_idempotencyKey: { planId: input.planId, idempotencyKey: input.idempotencyKey } },
    })
    if (existing) {
      if (existing.operationHash !== operationHash)
        throw new ServiceError('Publish idempotency key belongs to different artifacts.', 'CONFLICT')
      return existing
    }
    const { extensionReviews, ...operationInput } = input
    let operation
    try {
      operation = await tx.validationAstPublishOperation.create({
        data: {
          ...operationInput,
          idempotencyKey: input.idempotencyKey,
          operationHash,
          expectedValidationHash: input.expectedValidationHash ?? null,
        },
      })
    } catch (error) {
      const winner = await tx.validationAstPublishOperation.findUnique({
        where: { planId_idempotencyKey: { planId: input.planId, idempotencyKey: input.idempotencyKey } },
      })
      if (winner?.operationHash === operationHash) return winner
      throw error
    }
    await tx.validationExtensionReview.createMany({
      data: extensionReviews.map(review => ({ operationId: operation.id, ...review })),
    })
    return operation
  })
}

export async function advanceValidationAstPublish(
  input: { operationId: string; from: Phase; to: Phase },
  client: PrismaClient = prisma,
) {
  const fromIndex = VALIDATION_AST_PUBLISH_PHASES.indexOf(input.from)
  if (fromIndex < 0 || VALIDATION_AST_PUBLISH_PHASES[fromIndex + 1] !== input.to)
    throw new ServiceError('Publish phases must advance adjacently.', 'VALIDATION')
  const result = await client.validationAstPublishOperation.updateMany({
    where: { id: input.operationId, phase: input.from },
    data: { phase: input.to, failure: null },
  })
  if (result.count === 1)
    return client.validationAstPublishOperation.findUniqueOrThrow({ where: { id: input.operationId } })
  const current = await client.validationAstPublishOperation.findUniqueOrThrow({ where: { id: input.operationId } })
  if (VALIDATION_AST_PUBLISH_PHASES.indexOf(current.phase as Phase) >= VALIDATION_AST_PUBLISH_PHASES.indexOf(input.to))
    return current
  throw new ServiceError(`Publish operation cannot advance from ${current.phase}.`, 'CONFLICT')
}
