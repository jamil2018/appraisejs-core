import { randomUUID } from 'node:crypto'

import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import {
  parseYamlArtifact,
  serializeYamlArtifact,
  type PlanArtifact,
  type ReviewArtifact,
  type ValidationArtifact,
} from '@/lib/plan-contract'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { findProjectRoot } from '@/lib/plans/project-root'
import { assessValidationReadiness, fileReviewHash, validationNodeHash } from '@/lib/validation-review/approval'
import { syncPlans } from '@/lib/plans/plan-sync-service'
import { ServiceError } from '@/services/shared/errors'

import { appendPlanEvent } from './coordinator-service'

type Options = { client?: PrismaClient; projectDirectory?: string }

async function readArtifacts(planId: string, projectDirectory?: string) {
  const projectRoot = await findProjectRoot(projectDirectory)
  const repository = new PlanArtifactRepository(projectRoot)
  const [planStored, reviewStored, validationStored] = await Promise.all([
    repository.read('plan', planId),
    repository.read('review', planId),
    repository.read('validation', planId).catch(() => null),
  ])
  return {
    projectRoot,
    repository,
    planStored,
    reviewStored,
    validationStored,
    plan: parseYamlArtifact('plan', planStored.content) as PlanArtifact,
    review: parseYamlArtifact('review', reviewStored.content) as ReviewArtifact,
    validation: validationStored
      ? (parseYamlArtifact('validation', validationStored.content) as ValidationArtifact)
      : undefined,
  }
}

// Domain rules are tested separately; this coordinates locked writes and durable events.
// fallow-ignore-next-line complexity
export async function publishPreparedValidations(
  planId: string,
  validation: ValidationArtifact,
  options: Options = {},
) {
  const client = options.client ?? prisma
  const artifacts = await readArtifacts(planId, options.projectDirectory)
  if (artifacts.plan.lifecycle !== 'preparing_validations') {
    throw new ServiceError('The plan is not preparing validations.', 'CONFLICT')
  }
  if (validation.planId !== planId || validation.revision !== artifacts.plan.revision) {
    throw new ServiceError('Validation artifact does not match the current plan revision.', 'VALIDATION')
  }
  const content = serializeYamlArtifact('validation', validation)
  if (artifacts.validationStored) {
    await artifacts.repository.compareAndWrite('validation', planId, artifacts.validationStored.hash, content)
  } else {
    await artifacts.repository.create('validation', planId, content)
  }
  const nextPlan = { ...artifacts.plan, lifecycle: 'awaiting_validation_review' as const }
  await artifacts.repository.compareAndWrite(
    'plan',
    planId,
    artifacts.planStored.hash,
    serializeYamlArtifact('plan', nextPlan),
  )
  await syncPlans({ projectDirectory: artifacts.projectRoot, client })
  await appendPlanEvent({ planId, type: 'validation_review_ready', payload: { revision: validation.revision } }, client)
  return { validation, reviewUrl: `/plans/${planId}?review=validation` }
}

// fallow-ignore-next-line complexity
export async function decideValidationNode(
  input: {
    planId: string
    validationId: string
    decision: 'approved' | 'rejected' | 'deferred'
    decidedBy: string
  },
  options: Options = {},
) {
  const artifacts = await readArtifacts(input.planId, options.projectDirectory)
  if (!artifacts.validation || !artifacts.validationStored)
    throw new ServiceError('Validation artifact not found.', 'NOT_FOUND')
  const node = artifacts.validation.validations.find(validation => validation.id === input.validationId)
  if (!node) throw new ServiceError('Validation node not found.', 'NOT_FOUND')
  if (node.required && input.decision !== 'approved') {
    throw new ServiceError('Required validations must be approved or revised.', 'CONFLICT')
  }
  const decision = {
    validationId: node.id,
    decision: input.decision,
    contentHash: validationNodeHash(node),
    decidedBy: input.decidedBy,
    decidedAt: new Date().toISOString(),
  }
  const next = {
    ...artifacts.validation,
    validationDecisions: [
      ...artifacts.validation.validationDecisions.filter(item => item.validationId !== node.id),
      decision,
    ],
  }
  await artifacts.repository.compareAndWrite(
    'validation',
    input.planId,
    artifacts.validationStored.hash,
    serializeYamlArtifact('validation', next),
  )
  return decision
}

export async function approveValidationFile(
  input: { planId: string; path: string; contentHash: string; approvedBy: string },
  options: Options = {},
) {
  const artifacts = await readArtifacts(input.planId, options.projectDirectory)
  const file = artifacts.validation?.files.find(item => item.path === input.path)
  if (!file || fileReviewHash(file) !== input.contentHash) {
    throw new ServiceError('The file changed since it was presented for review.', 'CONFLICT')
  }
  const approval = {
    path: file.path,
    contentHash: input.contentHash,
    approvedBy: input.approvedBy,
    approvedAt: new Date().toISOString(),
  }
  const next = {
    ...artifacts.review,
    fileApprovals: [...artifacts.review.fileApprovals.filter(item => item.path !== file.path), approval],
  }
  await artifacts.repository.compareAndWrite(
    'review',
    input.planId,
    artifacts.reviewStored.hash,
    serializeYamlArtifact('review', next),
  )
  return approval
}

// fallow-ignore-next-line complexity
export async function submitValidationReview(planId: string, options: Options = {}) {
  const client = options.client ?? prisma
  const artifacts = await readArtifacts(planId, options.projectDirectory)
  if (
    artifacts.plan.lifecycle !== 'awaiting_validation_review' ||
    !artifacts.validation ||
    !artifacts.validationStored
  ) {
    throw new ServiceError('The plan is not awaiting validation review.', 'CONFLICT')
  }
  const readiness = assessValidationReadiness(artifacts.validation, artifacts.review)
  if (!readiness.ready) throw new ServiceError(readiness.blockers.join(' '), 'CONFLICT')

  const validation = { ...artifacts.validation, reviewSubmittedAt: new Date().toISOString() }
  await artifacts.repository.compareAndWrite(
    'validation',
    planId,
    artifacts.validationStored.hash,
    serializeYamlArtifact('validation', validation),
  )
  const plan = { ...artifacts.plan, lifecycle: 'validations_approved' as const }
  await artifacts.repository.compareAndWrite(
    'plan',
    planId,
    artifacts.planStored.hash,
    serializeYamlArtifact('plan', plan),
  )
  await syncPlans({ projectDirectory: artifacts.projectRoot, client })
  await appendPlanEvent(
    { planId, type: 'validation_approved', payload: { revision: plan.revision, submissionId: randomUUID() } },
    client,
  )
  return { plan, validation }
}
