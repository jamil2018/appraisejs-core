import { createHash } from 'node:crypto'

import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashCanonical } from '@/lib/quality-design/state'
import { canonicalizeAndValidateQualityRealization } from '@/lib/quality-design/validation-realization'
import {
  qualityValidationGenerationIdentity,
  qualityValidationPublicationCommandRequestHash,
  qualityValidationPublicationOperationIdentity,
} from '@/services/coordinator/quality-validation-generation-service'
import {
  ASSESSMENT_PREFLIGHT_ALGORITHM,
  QUALITY_VALIDATION_PUBLICATION_AUTHORITY,
  REMOTE_EVALUATION_SCOPE_AUTHORITY,
  type RemoteScopePhaseBinding,
} from '@/lib/quality-design/remote-evaluation-scope-contract'
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
  expectedRealizationHash?: string | null
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
  /** Local publications do not carry this. Remote publication uses it as the
   * same-transaction compare-and-swap guard for projections and the sealed
   * publication row. */
  remoteScopeBinding?: RemoteScopePhaseBinding
}

const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
type PublicationTransaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

function uniqueConstraint(error: unknown) {
  return Boolean(
    error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'P2002',
  )
}

function publicationRaceConflict(): never {
  throw new ServiceError(
    'Concurrent publication persistence did not converge to the requested immutable artifact.',
    'CONFLICT',
    409,
    { code: 'publication_persistence_conflict' },
  )
}

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

async function assertRemotePublicationScopeCurrent(input: PublicationInput, tx: PublicationTransaction) {
  if (!input.remoteScopeBinding) return
  const { assertRemoteEvaluationScopeCurrent } = await import('./remote-evaluation-scope-service')
  await assertRemoteEvaluationScopeCurrent(input.remoteScopeBinding, tx as never)
  const [revision, validation] = await Promise.all([
    tx.qualityPlanRevision.findUnique({ where: { id: input.qualityPlanRevisionId } }),
    tx.validationVersion.findUnique({ where: { id: input.validationVersionId } }),
  ])
  const current =
    revision &&
    revision.contentHash === input.expectedRevisionHash &&
    validation &&
    validation.canonicalHash === input.validationHash &&
    validation.canonicalAstJson === input.validationContent &&
    validation.realizationHash === (input.expectedRealizationHash ?? null)
  if (!current)
    throw new ServiceError('Remote evaluation scope has changed before publication.', 'CONFLICT', 409, {
      code: 'remote_evaluation_scope_stale',
    })
}

async function existingOrCreatePublication(input: {
  tx: PublicationTransaction
  publication: PublicationInput
  node: import('@/lib/quality-design/validation-artifact-contract').ValidationArtifact['validations'][number]
  operationHash: string
  generation: ReturnType<typeof qualityValidationGenerationIdentity> & {
    artifactSchemaVersion: string
    preflightAlgorithmVersion: string
    preflightAuthority: string
    scopeIntentHash: string
    realizationIntentHash: string
    preflightHash: string
    canonicalRealizationJson: string
    realizationHash: string
    compilationHash: string
    assuranceLevel: string
  }
  id: string
  reviewHash: string
  projectionHash: string
  projectionJson: string
  validationProjectionJson: string
  runtimeInputHash: string
  runtimeInputJson: string
  extensionReviews: PublicationInput['extensionReviews']
}) {
  const {
    extensionReviews,
    generation,
    id,
    node,
    operationHash,
    projectionHash,
    projectionJson,
    publication,
    reviewHash,
    runtimeInputHash,
    runtimeInputJson,
    tx,
    validationProjectionJson,
  } = input
  const database = tx as unknown as {
    qualityValidationGeneration: {
      findUnique: (args: unknown) => Promise<{ id: string; generationKey: string } | null>
      create: (args: unknown) => Promise<{ id: string; generationKey: string }>
    }
    qualityValidationPublication: {
      findUnique: (args: unknown) => Promise<{ id: string; operationHash: string; generationId: string } | null>
      create: (args: unknown) => Promise<unknown>
    }
    validationVersion: {
      updateMany: (args: unknown) => Promise<{ count: number }>
      findUniqueOrThrow: (args: unknown) => Promise<{ activeGenerationId: string | null }>
    }
  }
  let persistedGeneration = await database.qualityValidationGeneration.findUnique({
    where: { generationKey: generation.generationKey },
  })
  if (!persistedGeneration) {
    try {
      persistedGeneration = await database.qualityValidationGeneration.create({
        data: {
          ...generation,
          targetProjectId: publication.targetProjectId,
          qualityPlanRevisionId: publication.qualityPlanRevisionId,
          validationVersionId: publication.validationVersionId,
          disposition: 'ACTIVE',
        },
      })
    } catch (error) {
      if (!uniqueConstraint(error)) throw error
      // A deterministic generation key may be inserted by another caller.
      // Re-read the exact key; never select a newest/active fallback.
      persistedGeneration = await database.qualityValidationGeneration.findUnique({
        where: { generationKey: generation.generationKey },
      })
      if (!persistedGeneration || persistedGeneration.id !== generation.id) publicationRaceConflict()
    }
  }
  const existing = await database.qualityValidationPublication.findUnique({
    where: { generationId: persistedGeneration.id },
  })
  if (existing) {
    if (existing.operationHash !== operationHash)
      throw new ServiceError('Quality validation generation has a different immutable publication.', 'CONFLICT', 409, {
        code: 'generation_publication_conflict',
      })
  } else {
    try {
      await database.qualityValidationPublication.create({
        data: {
          id,
          generationId: persistedGeneration.id,
          targetProjectId: publication.targetProjectId,
          targetFingerprint: publication.targetFingerprint,
          qualityPlanRevisionId: publication.qualityPlanRevisionId,
          validationVersionId: publication.validationVersionId,
          idempotencyKey: null,
          operationHash,
          preflightAlgorithmVersion: generation.preflightAlgorithmVersion,
          preflightAuthority: generation.preflightAuthority,
          scopeIntentHash: generation.scopeIntentHash,
          realizationIntentHash: generation.realizationIntentHash,
          preflightHash: generation.preflightHash,
          preflightDisposition: 'ACTIVE',
          expectedRevisionHash: publication.expectedRevisionHash,
          validationHash: publication.validationHash,
          validationContent: publication.validationContent,
          reviewHash,
          reviewContent: publication.reviewContent,
          astId: publication.astId,
          astHash: publication.astHash,
          contextHash: publication.contextHash,
          previewHash: publication.previewHash,
          receiptHash: publication.receiptHash,
          projectionHash,
          projectionJson,
          validationProjectionJson,
          runtimeInputHash,
          runtimeInputJson,
          extensionReviews: { create: extensionReviews },
        },
      })
    } catch (error) {
      if (!uniqueConstraint(error)) throw error
      // One fresh exact lookup is the only supported race recovery. A row
      // with another operation hash is an immutable-artifact conflict, not a
      // raw database uniqueness error.
      const raced = await database.qualityValidationPublication.findUnique({
        where: { generationId: persistedGeneration.id },
      })
      if (!raced) publicationRaceConflict()
      if (raced.operationHash !== operationHash)
        throw new ServiceError(
          'Quality validation generation has a different immutable publication.',
          'CONFLICT',
          409,
          {
            code: 'generation_publication_conflict',
          },
        )
    }
  }
  const activation = await database.validationVersion.updateMany({
    where: { id: publication.validationVersionId, activeGenerationId: null },
    data: { activeGenerationId: persistedGeneration.id },
  })
  if (!activation.count) {
    const version = await database.validationVersion.findUniqueOrThrow({
      where: { id: publication.validationVersionId },
    })
    if (version.activeGenerationId !== persistedGeneration.id)
      throw new ServiceError('Validation version already has a different active generation.', 'CONFLICT', 409, {
        code: 'active_generation_conflict',
      })
  }
  await persistProjectedExecutionArtifacts(tx, { targetProjectId: publication.targetProjectId, node })
  return (await database.qualityValidationPublication.findUnique({ where: { generationId: persistedGeneration.id } }))!
}

/**
 * Seal the existing reviewed Validation AST runtime envelope under Quality
 * identities. This preserves the command-receipt/materializer contract while
 * without retaining the removed development-planning ownership chain.
 */
export async function publishQualityValidationRuntime(input: PublicationInput, client: PrismaClient = prisma) {
  const canonical = canonicalizeAndValidateQualityRealization({
    realization: {
      runtimePublication: {
        idempotencyKey: input.idempotencyKey,
        projection: input.projection,
        validationProjection: input.validationProjection,
        runtimeInput: input.runtimeInput,
        reviewContent: input.reviewContent,
        extensionReviews: input.extensionReviews,
      },
    },
    target: { id: input.targetProjectId, fingerprint: input.targetFingerprint },
  })
  const { envelope, runtimeInput: runtime } = canonical
  const node = canonical.validation.validations.find(item => item.id === input.astId)
  if (!node)
    throw new ServiceError(
      'Quality runtime publication AST id is not present in its validation projection.',
      'VALIDATION',
    )
  const immutablePairs = [
    [runtime.astId, input.astId],
    [runtime.astHash, input.astHash],
    [runtime.contextHash, input.contextHash],
    [runtime.previewHash, input.previewHash],
    [runtime.receiptHash, input.receiptHash],
  ]
  if (immutablePairs.some(([actual, expected]) => actual !== expected))
    throw new ServiceError('Quality runtime publication input is missing immutable compiler hashes.', 'VALIDATION')
  const projectionJson = canonicalContractJson(envelope.projection)
  const validationProjectionJson = canonicalContractJson(canonical.validation)
  const runtimeInputJson = canonicalContractJson(runtime)
  const runtimeInputHash = digest(runtime)
  const reviewHash = digest(input.reviewContent)
  const projectionHash = digest(envelope.projection)
  const preflightAuthority = input.remoteScopeBinding
    ? REMOTE_EVALUATION_SCOPE_AUTHORITY
    : QUALITY_VALIDATION_PUBLICATION_AUTHORITY
  const scopeIntentHash =
    input.remoteScopeBinding?.scopeIntentHash ??
    hashCanonical({
      schemaVersion: 'appraise.quality-publication-scope-intent/v3',
      targetProjectId: input.targetProjectId,
      qualityPlanRevisionId: input.qualityPlanRevisionId,
      validationVersionId: input.validationVersionId,
      validationHash: input.validationHash,
    })
  const realizationIntentHash =
    input.remoteScopeBinding?.realizationIntentHash ??
    hashCanonical({
      schemaVersion: 'appraise.quality-publication-realization-intent/v3',
      validationHash: input.validationHash,
      expectedRealizationHash: input.expectedRealizationHash ?? null,
    })
  const canonicalRealizationJson = canonicalContractJson({
    projection: envelope.projection,
    validationProjection: canonical.validation,
    runtimeInput: runtime,
    reviewContent: input.reviewContent,
    extensionReviews: envelope.extensionReviews,
  })
  const realizationHash = input.expectedRealizationHash ?? digest(canonicalRealizationJson)
  const compilationHash = hashCanonical({
    validationVersionId: input.validationVersionId,
    validationHash: input.validationHash,
    realizationHash,
  })
  const generation = {
    ...qualityValidationGenerationIdentity({
      targetProjectId: input.targetProjectId,
      qualityPlanRevisionId: input.qualityPlanRevisionId,
      validationVersionId: input.validationVersionId,
      validationHash: input.validationHash,
      artifactSchemaVersion: 'appraise.quality-validation-generation/v3',
      preflightAlgorithmVersion: ASSESSMENT_PREFLIGHT_ALGORITHM,
      preflightAuthority,
      scopeIntentHash,
      realizationIntentHash,
      preflightHash:
        input.remoteScopeBinding?.preflightHash ??
        hashCanonical({
          algorithmVersion: ASSESSMENT_PREFLIGHT_ALGORITHM,
          scopeIntentHash,
          realizationIntentHash,
          realizationHash,
        }),
      canonicalRealizationJson,
      realizationHash,
      compilationHash,
      assuranceLevel: 'STANDARD',
    }),
    artifactSchemaVersion: 'appraise.quality-validation-generation/v3',
    preflightAlgorithmVersion: ASSESSMENT_PREFLIGHT_ALGORITHM,
    preflightAuthority,
    scopeIntentHash,
    realizationIntentHash,
    preflightHash:
      input.remoteScopeBinding?.preflightHash ??
      hashCanonical({
        algorithmVersion: ASSESSMENT_PREFLIGHT_ALGORITHM,
        scopeIntentHash,
        realizationIntentHash,
        realizationHash,
      }),
    canonicalRealizationJson,
    realizationHash,
    compilationHash,
    assuranceLevel: 'STANDARD',
  }
  const immutablePublication = {
    targetProjectId: input.targetProjectId,
    targetFingerprint: input.targetFingerprint,
    qualityPlanRevisionId: input.qualityPlanRevisionId,
    validationVersionId: input.validationVersionId,
    expectedRevisionHash: input.expectedRevisionHash,
    validationHash: input.validationHash,
    validationContent: input.validationContent,
    expectedRealizationHash: input.expectedRealizationHash ?? null,
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
  }
  const { id, operationHash } = qualityValidationPublicationOperationIdentity({
    generationId: generation.id,
    immutablePublication,
    extensionArtifactHashes: envelope.extensionReviews.map(review => review.artifactHash),
  })
  const requestHash = qualityValidationPublicationCommandRequestHash({
    targetProjectId: input.targetProjectId,
    qualityPlanRevisionId: input.qualityPlanRevisionId,
    validationVersionId: input.validationVersionId,
    generationKey: generation.generationKey,
    operationHash,
  })
  const commit = () =>
    client.$transaction(async tx => {
      await assertRemotePublicationScopeCurrent(input, tx)
      const commands = tx as unknown as {
        qualityValidationPublicationCommandReceipt: {
          findUnique: (args: unknown) => Promise<{ requestHash: string; publicationId: string } | null>
          create: (args: unknown) => Promise<unknown>
        }
        qualityValidationPublication: { findUniqueOrThrow: (args: unknown) => Promise<unknown> }
      }
      const existingCommand = await commands.qualityValidationPublicationCommandReceipt.findUnique({
        where: {
          targetProjectId_idempotencyKey: {
            targetProjectId: input.targetProjectId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      })
      if (existingCommand) {
        if (existingCommand.requestHash !== requestHash)
          throw new ServiceError(
            'Publication idempotency key was reused with a different immutable request.',
            'CONFLICT',
            409,
            {
              code: 'publication_command_conflict',
            },
          )
        return commands.qualityValidationPublication.findUniqueOrThrow({ where: { id: existingCommand.publicationId } })
      }
      const publication = await existingOrCreatePublication({
        tx,
        publication: input,
        node,
        generation,
        operationHash,
        id,
        reviewHash,
        projectionHash,
        projectionJson,
        validationProjectionJson,
        runtimeInputHash,
        runtimeInputJson,
        extensionReviews: envelope.extensionReviews,
      })
      await commands.qualityValidationPublicationCommandReceipt.create({
        data: {
          targetProjectId: input.targetProjectId,
          idempotencyKey: input.idempotencyKey,
          requestHash,
          generationKey: generation.generationKey,
          operationHash,
          publicationId: publication.id,
        },
      })
      return publication
    })
  try {
    return await commit()
  } catch (error) {
    if (!uniqueConstraint(error)) throw error
    // Command receipt insertion can race after the immutable artifact has
    // committed. Retry exactly once in a fresh transaction so replay is
    // returned from committed bytes. A second unique failure is surfaced as a
    // typed conflict rather than leaking Prisma P2002.
    try {
      return await commit()
    } catch (retryError) {
      if (uniqueConstraint(retryError)) publicationRaceConflict()
      throw retryError
    }
  }
}
