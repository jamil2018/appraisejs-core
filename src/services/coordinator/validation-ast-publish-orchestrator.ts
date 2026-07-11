import type { Prisma, PrismaClient } from '@prisma/client'
import prisma from '@/config/db-config'
import { validationArtifactSchema } from '@/lib/plan-contract'
import { PlanArtifactRepository, PlanRepositoryError } from '@/lib/plans/artifact-repository'
import type { CompiledCustomExtension } from '@/lib/validation-ast'
import { ServiceError } from '@/services/shared/errors'
import { projectCompiledValidationArtifacts } from './validation-runtime-projection-service'
import {
  advanceValidationAstPublish,
  validateStoredValidationAstPublish,
} from './validation-ast-publish-journal-service'

type CrashPhase = 'after_artifacts' | 'after_projection' | 'after_review_ready'
type PublishOperation = Prisma.ValidationAstPublishOperationGetPayload<{ include: { extensionReviews: true } }>

function assertReviewOwnership(
  ownership: Prisma.ValidationAstPublishOperationGetPayload<{ include: { plan: true; targetProject: true } }>,
) {
  const matches = [
    ownership.plan.id === ownership.planProjectionId,
    ownership.targetProject.id === ownership.targetProjectId,
    ownership.plan.sourceHash === ownership.expectedPlanHash,
    ownership.targetProject.fingerprint === ownership.targetFingerprint,
    ownership.plan.lifecycle === 'preparing_validations',
    ownership.plan.validationJson === ownership.validationProjectionJson,
  ]
  if (matches.some(match => !match)) throw new ServiceError('Publish operation review context changed.', 'CONFLICT')
}

async function markValidationReviewReady(operation: PublishOperation, client: PrismaClient) {
  return client.$transaction(async tx => {
    const current = await tx.validationAstPublishOperation.findUniqueOrThrow({ where: { id: operation.id } })
    if (current.phase !== 'projected') return current
    const ownership = await tx.validationAstPublishOperation.findUniqueOrThrow({
      where: { id: operation.id },
      include: { plan: true, targetProject: true },
    })
    assertReviewOwnership(ownership)
    const plan = await tx.planProjection.update({
      where: { planId: current.planId },
      data: { lifecycle: 'awaiting_validation_review' },
    })
    const latest = await tx.planEvent.findFirst({
      where: { planProjectionId: plan.id },
      orderBy: { sequence: 'desc' },
    })
    await tx.planEvent.upsert({
      where: { publishOperationId_type: { publishOperationId: operation.id, type: 'validation_review_ready' } },
      update: {},
      create: {
        planProjectionId: plan.id,
        publishOperationId: operation.id,
        sequence: (latest?.sequence ?? 0) + 1,
        type: 'validation_review_ready',
        payloadJson: JSON.stringify({
          revision: plan.revision,
          operationId: operation.id,
          receiptHash: operation.receiptHash,
          validationHash: operation.validationHash,
          reviewHash: operation.reviewHash,
          extensionReviewHashes: operation.extensionReviews.map(item => item.artifactHash),
        }),
      },
    })
    return tx.validationAstPublishOperation.update({
      where: { id: operation.id },
      data: { phase: 'review_ready', failure: null },
    })
  })
}

async function ensureArtifact(
  repository: PlanArtifactRepository,
  input: {
    kind: 'plan' | 'validation' | 'review'
    planId: string
    expectedHash: string | null
    desiredHash: string
    content: string
  },
) {
  let stored
  try {
    const current = await repository.read(input.kind, input.planId)
    if (current.hash === input.desiredHash) return current
    if (!input.expectedHash)
      throw new ServiceError(`${input.kind} artifact already exists with different content.`, 'CONFLICT')
    stored = await repository.compareAndWrite(input.kind, input.planId, input.expectedHash, input.content)
  } catch (error) {
    if (error instanceof PlanRepositoryError && error.code === 'not-found' && !input.expectedHash)
      stored = await repository.create(input.kind, input.planId, input.content)
    else throw error
  }
  if (stored.hash !== input.desiredHash)
    throw new ServiceError(`${input.kind} artifact content does not match its journal hash.`, 'CONFLICT')
  return stored
}

async function assertPublishedArtifacts(
  repository: PlanArtifactRepository,
  operation: {
    planId: string
    planHash: string
    validationHash: string
    reviewHash: string
  },
) {
  const [plan, validation, review] = await Promise.all([
    repository.read('plan', operation.planId),
    repository.read('validation', operation.planId),
    repository.read('review', operation.planId),
  ])
  if (
    plan.hash !== operation.planHash ||
    validation.hash !== operation.validationHash ||
    review.hash !== operation.reviewHash
  )
    throw new ServiceError('Published AST artifacts drifted during recovery.', 'CONFLICT')
}

async function resumeValidationAstPublishInternal(
  operationId: string,
  options: { client?: PrismaClient; projectDirectory?: string; crashAfter?: CrashPhase } = {},
) {
  const client = options.client ?? prisma
  const repository = new PlanArtifactRepository(options.projectDirectory)
  let operation = await client.validationAstPublishOperation.findUniqueOrThrow({
    where: { id: operationId },
    include: { extensionReviews: true },
  })
  validateStoredValidationAstPublish(operation as never)
  if (operation.phase === 'prepared') {
    await ensureArtifact(repository, {
      kind: 'validation',
      planId: operation.planId,
      expectedHash: operation.expectedValidationHash,
      desiredHash: operation.validationHash,
      content: operation.validationContent,
    })
    await ensureArtifact(repository, {
      kind: 'review',
      planId: operation.planId,
      expectedHash: operation.expectedReviewHash,
      desiredHash: operation.reviewHash,
      content: operation.reviewContent,
    })
    await ensureArtifact(repository, {
      kind: 'plan',
      planId: operation.planId,
      expectedHash: operation.expectedPlanArtifactHash,
      desiredHash: operation.planHash,
      content: operation.planContent,
    })
    operation = (await advanceValidationAstPublish(
      { operationId, from: 'prepared', to: 'artifacts_written' },
      client,
    )) as typeof operation
    operation = await client.validationAstPublishOperation.findUniqueOrThrow({
      where: { id: operationId },
      include: { extensionReviews: true },
    })
    validateStoredValidationAstPublish(operation as never)
    if (options.crashAfter === 'after_artifacts') throw new Error('injected-after-artifacts')
  }
  if (operation.phase === 'artifacts_written') {
    await assertPublishedArtifacts(repository, operation)
    const validation = validationArtifactSchema.parse(JSON.parse(operation.validationProjectionJson))
    const extensions = operation.extensionReviews.map(item => JSON.parse(item.artifactJson) as CompiledCustomExtension)
    await projectCompiledValidationArtifacts(
      {
        planId: operation.planId,
        validation,
        astId: operation.astId,
        astHash: operation.astHash,
        compiledExtensions: extensions,
        publishOperationId: operation.id,
      },
      client,
    )
    operation = await client.validationAstPublishOperation.findUniqueOrThrow({
      where: { id: operationId },
      include: { extensionReviews: true },
    })
    validateStoredValidationAstPublish(operation as never)
    if (options.crashAfter === 'after_projection') throw new Error('injected-after-projection')
  }
  if (operation.phase === 'projected') {
    await assertPublishedArtifacts(repository, operation)
    operation = (await markValidationReviewReady(operation, client)) as typeof operation
    if (options.crashAfter === 'after_review_ready') throw new Error('injected-after-review-ready')
  }
  return operation
}

export async function resumeValidationAstPublish(
  operationId: string,
  options: { client?: PrismaClient; projectDirectory?: string; crashAfter?: CrashPhase } = {},
) {
  const client = options.client ?? prisma
  try {
    return await resumeValidationAstPublishInternal(operationId, options)
  } catch (error) {
    if (options.crashAfter) throw error
    const recovery = await recoverConcurrentPublish(operationId, options, error, client)
    if (recovery.operation) return recovery.operation
    const failure = (recovery.error instanceof Error ? recovery.error.message : String(recovery.error)).slice(0, 2000)
    await client.validationAstPublishOperation
      .updateMany({
        where: { id: operationId, phase: { not: 'review_ready' } },
        data: { failure },
      })
      .catch(() => undefined)
    throw recovery.error
  }
}

async function recoverConcurrentPublish(
  operationId: string,
  options: { client?: PrismaClient; projectDirectory?: string },
  initialError: unknown,
  client: PrismaClient,
): Promise<{ operation?: PublishOperation; error: unknown }> {
  let error = initialError
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const concurrent = await client.validationAstPublishOperation
      .findUnique({ where: { id: operationId }, include: { extensionReviews: true } })
      .catch(() => null)
    if (concurrent?.phase === 'review_ready') return { operation: concurrent, error }
    if (concurrent?.phase === 'projected') {
      try {
        return { operation: await resumeValidationAstPublishInternal(operationId, options), error }
      } catch (retryError) {
        error = retryError
      }
    }
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  return { error }
}
