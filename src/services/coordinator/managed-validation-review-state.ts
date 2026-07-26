import { createHash } from 'node:crypto'

import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
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

function withoutMutableReviewState(validation: ValidationArtifact) {
  return { ...validation, validationDecisions: [], reviewSubmittedAt: undefined }
}

function withoutPartialAcknowledgements(validation: ValidationArtifact) {
  const legacy = structuredClone(validation)
  for (const node of legacy.validations)
    for (const mapping of node.coverageArgument?.mappings ?? []) delete mapping.partialAcknowledgement
  return legacy
}

function restorePartialAcknowledgements(current: ValidationArtifact, published: ValidationArtifact) {
  const repaired = structuredClone(current)
  for (const [validationIndex, publishedNode] of published.validations.entries()) {
    const currentNode = repaired.validations[validationIndex]
    if (!currentNode) continue
    for (const [mappingIndex, publishedMapping] of (publishedNode.coverageArgument?.mappings ?? []).entries()) {
      const currentMapping = currentNode.coverageArgument?.mappings[mappingIndex]
      if (currentMapping && publishedMapping.partialAcknowledgement)
        currentMapping.partialAcknowledgement = publishedMapping.partialAcknowledgement
    }
  }
  return repaired
}

function isLegacyPartialAcknowledgementProjection(current: ValidationArtifact, published: ValidationArtifact) {
  return (
    canonicalContractJson(withoutPartialAcknowledgements(withoutMutableReviewState(current))) ===
    canonicalContractJson(withoutPartialAcknowledgements(withoutMutableReviewState(published)))
  )
}

export function immutablePublishedValidationContent(content: string, projectionJson: string) {
  const artifact = parseYamlArtifact('validation', content) as ValidationArtifact
  const projection = JSON.parse(projectionJson) as ValidationArtifact
  return isLegacyPartialAcknowledgementProjection(artifact, projection)
    ? serializeYamlArtifact('validation', projection)
    : content
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
  return canonicalContractJson(withoutMutableReviewState(validation))
}

export function managedValidationStateHash(content: string) {
  try {
    return digest(canonicalContractJson(parseYamlArtifact('validation', content)))
  } catch {
    return digest(content)
  }
}

export function managedReviewStateHash(content: string) {
  try {
    return digest(canonicalContractJson(parseYamlArtifact('review', content)))
  } catch {
    return digest(content)
  }
}

export function managedValidationProjectionState(value: string) {
  try {
    return canonicalContractJson(JSON.parse(value))
  } catch {
    return value
  }
}

export function validationReviewStateReceipt(state: ReviewState) {
  const json = canonicalContractJson(state)
  return { json, hash: digest(json) }
}

export async function reconcileManagedValidationReviewState(
  planId: string,
  options: { client?: PrismaClient; projectDirectory?: string } = {},
) {
  const client = options.client ?? prisma
  const repository = new PlanArtifactRepository(options.projectDirectory)
  const [operation, initialValidation, review, projection] = await Promise.all([
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
  let validation = initialValidation
  let projectionJson = projection.validationJson
  const publishedValidation = JSON.parse(operation.validationProjectionJson) as ValidationArtifact
  const expectedValidationContent = immutablePublishedValidationContent(
    operation.validationContent,
    operation.validationProjectionJson,
  )
  const currentValidation = parseYamlArtifact('validation', validation.content) as ValidationArtifact
  const currentProjection = JSON.parse(projectionJson) as ValidationArtifact
  if (
    isLegacyPartialAcknowledgementProjection(currentValidation, publishedValidation) &&
    isLegacyPartialAcknowledgementProjection(currentProjection, publishedValidation)
  ) {
    const repairedValidation = restorePartialAcknowledgements(currentValidation, publishedValidation)
    const repairedProjection = restorePartialAcknowledgements(currentProjection, publishedValidation)
    if (canonicalContractJson(currentValidation) !== canonicalContractJson(repairedValidation))
      validation = await repository.compareAndWrite(
        'validation',
        planId,
        validation.hash,
        serializeYamlArtifact('validation', repairedValidation),
      )
    projectionJson = JSON.stringify(repairedProjection)
    if (projection.validationJson !== projectionJson)
      await client.planProjection.update({ where: { planId }, data: { validationJson: projectionJson } })
  }
  const immutableMismatches = [
    digest(immutableValidationContent(validation.content)) !==
    digest(immutableValidationContent(expectedValidationContent))
      ? 'validation_artifact'
      : null,
    digest(immutableReviewContent(review.content)) !== digest(immutableReviewContent(operation.reviewContent))
      ? 'review_artifact'
      : null,
    immutableValidationProjection(projectionJson) !== immutableValidationProjection(operation.validationProjectionJson)
      ? 'validation_projection'
      : null,
  ].filter((value): value is string => value !== null)
  if (immutableMismatches.length > 0)
    throw new ServiceError('Immutable managed validation publication content changed.', 'CONFLICT', undefined, {
      blockerType: 'immutable_validation_publication_mismatch',
      mismatches: immutableMismatches,
    })

  const receipt = validationReviewStateReceipt({
    validationHash: managedValidationStateHash(validation.content),
    reviewHash: managedReviewStateHash(review.content),
    validationProjectionJson: managedValidationProjectionState(projectionJson),
  })
  await client.validationAstPublishOperation.update({
    where: { id: operation.id },
    data: { reviewStateHash: receipt.hash, reviewStateJson: receipt.json },
  })
  return { operationId: operation.id, reviewStateHash: receipt.hash }
}
