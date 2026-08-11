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

export async function persistProjectedExecutionArtifacts(
  tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
  input: {
    targetProjectId: string
    node: import('@/lib/quality-design/validation-artifact-contract').ValidationArtifact['validations'][number]
  },
) {
  const { targetProjectId, node } = input
  for (const artifactModule of node.appraiseArtifacts.modules)
    await tx.module.upsert({
      where: { id: artifactModule.id },
      create: { ...artifactModule, targetProjectId },
      update: { name: artifactModule.name, parentId: artifactModule.parentId ?? null },
    })
  for (const group of node.appraiseArtifacts.locatorGroups)
    await tx.locatorGroup.upsert({
      where: { id: group.id },
      create: { ...group, targetProjectId },
      update: { name: group.name, route: group.route, moduleId: group.moduleId },
    })
  for (const locator of node.appraiseArtifacts.locators)
    await tx.locator.upsert({
      where: { id: locator.id },
      create: { ...locator, targetProjectId },
      update: { name: locator.name, value: locator.value, locatorGroupId: locator.locatorGroupId },
    })
  for (const testCase of node.appraiseArtifacts.testCases) {
    await tx.testCase.upsert({
      where: { id: testCase.id },
      create: { id: testCase.id, title: testCase.title, description: testCase.description, targetProjectId },
      update: { title: testCase.title, description: testCase.description },
    })
    for (const step of testCase.steps)
      await tx.testCaseStep.upsert({
        where: { id: step.id },
        create: {
          id: step.id,
          testCaseId: testCase.id,
          order: step.order,
          gherkinStep: step.gherkinStep,
          icon: 'VALIDATION',
          label: step.label,
          invocationJson: canonicalContractJson(step.invocation),
        },
        update: {
          order: step.order,
          gherkinStep: step.gherkinStep,
          label: step.label,
          invocationJson: canonicalContractJson(step.invocation),
        },
      })
  }
  for (const suite of node.appraiseArtifacts.testSuites)
    await tx.testSuite.upsert({
      where: { id: suite.id },
      create: {
        id: suite.id,
        name: suite.name,
        moduleId: suite.moduleId,
        targetProjectId,
        testCases: { connect: suite.testCaseIds.map(id => ({ id })) },
      },
      update: {
        name: suite.name,
        moduleId: suite.moduleId,
        testCases: { set: suite.testCaseIds.map(id => ({ id })) },
      },
    })
}

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
      await persistProjectedExecutionArtifacts(tx, { targetProjectId: input.targetProjectId, node })
      return existing
    }
    await persistProjectedExecutionArtifacts(tx, { targetProjectId: input.targetProjectId, node })
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
