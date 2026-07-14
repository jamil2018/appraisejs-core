import { createHash } from 'node:crypto'

import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import {
  parseYamlArtifact,
  serializeYamlArtifact,
  type ReviewArtifact,
  type ValidationArtifact,
} from '@/lib/plan-contract'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { ServiceError } from '@/services/shared/errors'

type ReviewState = {
  validationHash: string
  reviewHash: string
  validationProjectionJson: string
}

const digest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`

export function immutableValidationContent(content: string) {
  try {
    const validation = parseYamlArtifact('validation', content) as ValidationArtifact
    return serializeYamlArtifact('validation', {
      ...validation,
      validationDecisions: [],
      reviewSubmittedAt: undefined,
    })
  } catch {
    return content
  }
}

export function immutableReviewContent(content: string) {
  try {
    const review = parseYamlArtifact('review', content) as ReviewArtifact
    return serializeYamlArtifact('review', { ...review, fileApprovals: [] })
  } catch {
    return content
  }
}

export function immutableValidationProjection(value: string | null | undefined) {
  if (!value) return value ?? null
  const validation = JSON.parse(value) as ValidationArtifact
  return JSON.stringify({ ...validation, validationDecisions: [], reviewSubmittedAt: undefined })
}

export function validationReviewStateReceipt(state: ReviewState) {
  const json = JSON.stringify(state)
  return { json, hash: digest(json) }
}

export async function reconcileManagedValidationReviewState(
  planId: string,
  options: { client?: PrismaClient; projectDirectory?: string } = {},
) {
  const client = options.client ?? prisma
  const repository = new PlanArtifactRepository(options.projectDirectory)
  const [operation, validation, review, projection] = await Promise.all([
    client.validationAstPublishOperation.findFirst({
      where: { planId, phase: 'review_ready' },
      orderBy: { createdAt: 'desc' },
    }),
    repository.read('validation', planId),
    repository.read('review', planId),
    client.planProjection.findUnique({ where: { planId }, select: { validationJson: true } }),
  ])
  if (!operation || !projection?.validationJson)
    throw new ServiceError('Managed validation review state is not ready to reconcile.', 'CONFLICT')
  if (
    digest(immutableValidationContent(validation.content)) !==
      digest(immutableValidationContent(operation.validationContent)) ||
    digest(immutableReviewContent(review.content)) !== digest(immutableReviewContent(operation.reviewContent)) ||
    immutableValidationProjection(projection.validationJson) !==
      immutableValidationProjection(operation.validationProjectionJson)
  )
    throw new ServiceError('Immutable managed validation publication content changed.', 'CONFLICT')

  const receipt = validationReviewStateReceipt({
    validationHash: validation.hash,
    reviewHash: review.hash,
    validationProjectionJson: projection.validationJson,
  })
  await client.validationAstPublishOperation.update({
    where: { id: operation.id },
    data: { reviewStateHash: receipt.hash, reviewStateJson: receipt.json },
  })
  return { operationId: operation.id, reviewStateHash: receipt.hash }
}
