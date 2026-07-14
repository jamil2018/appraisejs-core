import { createHash } from 'node:crypto'

import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { PlanArtifactRepository, PlanRepositoryError } from '@/lib/plans/artifact-repository'
import {
  immutableReviewContent,
  immutableValidationContent,
  immutableValidationProjection,
  validationReviewStateReceipt,
} from './managed-validation-review-state'

type Representation = { present: boolean; lifecycle?: string; hash?: string | null }

export type ManagedValidationIntegrity = {
  status: 'green' | 'not_applicable' | 'integrity_blocked'
  operationId?: string
  operationPhase?: string
  representations: {
    planArtifact: Representation
    projection: Representation
    validationArtifact: Representation
    reviewArtifact: Representation
    reviewReadyEvent: Representation
  }
  mismatches: string[]
  retryable: boolean
  nextRepairAction?: string
  failure?: unknown
}

async function optionalArtifact(repository: PlanArtifactRepository, kind: 'validation' | 'review', planId: string) {
  try {
    return await repository.read(kind, planId)
  } catch (error) {
    if (error instanceof PlanRepositoryError && error.code === 'not-found') return undefined
    throw error
  }
}

function parseFailure(value: string | null) {
  if (!value) return undefined
  try {
    return JSON.parse(value)
  } catch {
    return { message: value }
  }
}

function integrityMismatches(input: {
  planLifecycle?: string
  projectionLifecycle?: string
  operationPhase?: string
  validationHash?: string
  expectedValidationHash?: string
  reviewHash?: string
  expectedReviewHash?: string
  planHash: string
  expectedPlanHash?: string
  validationProjection?: string | null
  expectedValidationProjection?: string | null
  reviewStateHash?: string
  expectedReviewStateHash?: string | null
  hasEvent: boolean
}) {
  const checks: Array<[string, boolean]> = [
    ['plan_artifact_lifecycle', input.planLifecycle === 'awaiting_validation_review'],
    ['projection_lifecycle', input.projectionLifecycle === 'awaiting_validation_review'],
    ['publish_operation_phase', input.operationPhase === 'review_ready'],
    ['validation_compile_content_hash', input.validationHash === input.expectedValidationHash],
    ['review_compile_content_hash', input.reviewHash === input.expectedReviewHash],
    ['plan_artifact_hash', input.planHash === input.expectedPlanHash],
    ['validation_compile_projection_hash', input.validationProjection === input.expectedValidationProjection],
    ['validation_review_state_receipt', input.reviewStateHash === input.expectedReviewStateHash],
    ['validation_review_ready_event', input.hasEvent],
  ]
  return checks.filter(([, matches]) => !matches).map(([name]) => name)
}

function repairGuidance(operationPhase: string | undefined, hasMismatches: boolean) {
  const retryable = Boolean(
    operationPhase && ['prepared', 'artifacts_written', 'projected', 'review_ready'].includes(operationPhase),
  )
  return {
    retryable,
    nextRepairAction: !hasMismatches
      ? undefined
      : operationPhase === 'review_ready' && hasMismatches
        ? 'Call validation_review_reconcile for this operation. Appraise will preserve immutable publication history and refresh only the exact current review-state receipt.'
        : retryable
          ? 'Retry validation_ast_compile with the exact stored submission and receipt so Appraise can resume this operation.'
          : 'Run project_diagnostic and inspect the publish operation; republish from validation preparation after repairing the reported mismatch.',
  }
}

// fallow-ignore-next-line complexity
export async function auditManagedValidationIntegrity(
  planId: string,
  options: { client?: PrismaClient; projectDirectory?: string } = {},
): Promise<ManagedValidationIntegrity> {
  const client = options.client ?? prisma
  const repository = new PlanArtifactRepository(options.projectDirectory)
  const [planArtifact, validationArtifact, reviewArtifact, projection, operation] = await Promise.all([
    repository.read('plan', planId),
    optionalArtifact(repository, 'validation', planId),
    optionalArtifact(repository, 'review', planId),
    client.planProjection.findUnique({
      where: { planId },
      select: { id: true, lifecycle: true, validationJson: true },
    }),
    client.validationAstPublishOperation.findFirst({
      where: { planId },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  const planLifecycle = /^lifecycle:\s*([^\s]+)/m.exec(planArtifact.content)?.[1]
  const event = operation
    ? await client.planEvent.findUnique({
        where: { publishOperationId_type: { publishOperationId: operation.id, type: 'validation_review_ready' } },
      })
    : null
  const representations = {
    planArtifact: { present: true, lifecycle: planLifecycle, hash: planArtifact.hash },
    projection: { present: Boolean(projection), lifecycle: projection?.lifecycle },
    validationArtifact: { present: Boolean(validationArtifact), hash: validationArtifact?.hash },
    reviewArtifact: { present: Boolean(reviewArtifact), hash: reviewArtifact?.hash },
    reviewReadyEvent: { present: Boolean(event), hash: event?.stateHash },
  }
  const reviewLifecycle =
    planLifecycle === 'awaiting_validation_review' || projection?.lifecycle === 'awaiting_validation_review'
  if (!reviewLifecycle) {
    return {
      status: 'not_applicable',
      operationId: operation?.id,
      operationPhase: operation?.phase,
      representations,
      mismatches: [],
      retryable: false,
      failure: parseFailure(operation?.failure ?? null),
    }
  }
  const mismatches = integrityMismatches({
    planLifecycle,
    projectionLifecycle: projection?.lifecycle,
    operationPhase: operation?.phase,
    validationHash: validationArtifact
      ? hashContent(immutableValidationContent(validationArtifact.content))
      : undefined,
    expectedValidationHash: operation
      ? hashContent(immutableValidationContent(operation.validationContent))
      : undefined,
    reviewHash: reviewArtifact ? hashContent(immutableReviewContent(reviewArtifact.content)) : undefined,
    expectedReviewHash: operation ? hashContent(immutableReviewContent(operation.reviewContent)) : undefined,
    planHash: planArtifact.hash,
    expectedPlanHash: operation?.planHash,
    validationProjection: immutableValidationProjection(projection?.validationJson),
    expectedValidationProjection: immutableValidationProjection(operation?.validationProjectionJson),
    reviewStateHash:
      validationArtifact && reviewArtifact && projection?.validationJson
        ? validationReviewStateReceipt({
            validationHash: validationArtifact.hash,
            reviewHash: reviewArtifact.hash,
            validationProjectionJson: projection.validationJson,
          }).hash
        : undefined,
    expectedReviewStateHash: operation?.reviewStateHash,
    hasEvent: Boolean(event),
  })
  const repair = repairGuidance(operation?.phase, mismatches.length > 0)
  return {
    status: mismatches.length ? 'integrity_blocked' : 'green',
    operationId: operation?.id,
    operationPhase: operation?.phase,
    representations,
    mismatches,
    ...repair,
    failure: parseFailure(operation?.failure ?? null),
  }
}

function hashContent(content: string) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}
