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

import { appendPlanEvent, assertPlanNotCancelled } from './coordinator-service'
import {
  assertRuntimePreflightPassed,
  assertValidationEnvironmentsReady,
  assertValidationFilesMaterialized,
  materializeValidationRuntime,
  projectValidationArtifacts,
} from './validation-runtime-projection-service'

type Options = { client?: PrismaClient; projectDirectory?: string }
type ValidationFeedbackScope = 'test_artifact' | 'product_scope'
const validationArtifactPath = (planId: string) => `appraise/plans/validations/${planId}.validation.yaml`
const isAutomationStepPath = (filePath: string) =>
  filePath.startsWith('automation/steps/') && /\.(?:step|steps)\.ts$/.test(filePath)

async function readArtifacts(planId: string, projectDirectory?: string, client: PrismaClient = prisma) {
  const projectRoot = await findProjectRoot(projectDirectory)
  const repository = new PlanArtifactRepository(projectRoot)
  const [planStored, reviewStored, validationStored, projection] = await Promise.all([
    repository.read('plan', planId),
    repository.read('review', planId),
    repository.read('validation', planId).catch(() => null),
    client.planProjection.findUnique({
      where: { planId },
      select: {
        targetProject: {
          select: { id: true, canonicalPath: true, displayName: true, fingerprint: true },
        },
      },
    }),
  ])
  return {
    projectRoot,
    validationFileRoot: projection?.targetProject?.canonicalPath ?? projectRoot,
    targetProject: projection?.targetProject ?? null,
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

function assertCustomStepJustifications(validation: ValidationArtifact) {
  const justifiedPaths = new Set(validation.customStepJustifications?.map(justification => justification.path) ?? [])
  const reusedPaths = new Set([
    ...(validation.reusedStepPaths ?? []),
    ...(validation.reusedTemplateStepRefs ?? []).map(ref => ref.path).filter((path): path is string => Boolean(path)),
  ])
  const declaredNewPaths = new Set(validation.newStepPaths ?? [])
  const stepPaths = new Set([
    ...declaredNewPaths,
    ...validation.validations.flatMap(item => item.stepPaths),
    ...validation.manifestPaths,
    ...validation.files.map(file => file.path),
  ])
  for (const stepPath of stepPaths) {
    if (!isAutomationStepPath(stepPath) || reusedPaths.has(stepPath)) continue
    if (!justifiedPaths.has(stepPath)) {
      throw new ServiceError(
        `Custom step ${stepPath} requires a registry/template-step reuse gap justification.`,
        'VALIDATION',
      )
    }
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
  await assertPlanNotCancelled(planId, client)
  const artifacts = await readArtifacts(planId, options.projectDirectory, client)
  if (!['preparing_validations', 'validation_changes_requested'].includes(artifacts.plan.lifecycle)) {
    throw new ServiceError('The plan is not preparing validations.', 'CONFLICT')
  }
  if (validation.planId !== planId || validation.revision !== artifacts.plan.revision) {
    throw new ServiceError('Validation artifact does not match the current plan revision.', 'VALIDATION')
  }
  assertCustomStepJustifications(validation)
  const runtimeValidation = await materializeValidationRuntime({
    projectRoot: artifacts.projectRoot,
    validationFileRoot: artifacts.validationFileRoot,
    targetProject: artifacts.targetProject,
    client,
    validation,
  })
  assertRuntimePreflightPassed(runtimeValidation)
  const materializedValidation = await assertValidationFilesMaterialized({
    projectRoot: artifacts.projectRoot,
    validationFileRoot: artifacts.validationFileRoot,
    targetProject: artifacts.targetProject,
    validation: runtimeValidation,
    verifyHashes: false,
  })
  const content = serializeYamlArtifact('validation', materializedValidation)
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
  return {
    validation: materializedValidation,
    reviewUrl: `/plans/${planId}?review=validation`,
    lifecycle: nextPlan.lifecycle,
    revision: nextPlan.revision,
    validationArtifactPath: validationArtifactPath(planId),
    validationCount: validation.validations.length,
    changedFileCount: validation.files.length,
    manifestPaths: validation.manifestPaths,
    reusedStepPaths: validation.reusedStepPaths ?? [],
    reusedTemplateStepRefs: validation.reusedTemplateStepRefs ?? [],
    reusedStepBlockRefs: validation.reusedStepBlockRefs ?? [],
    newStepPaths: validation.newStepPaths ?? [],
    nextReviewAction:
      'Open the validation review URL, inspect validation nodes and changed-file evidence, then approve or request changes.',
  }
}

function id(prefix: string): string {
  return `${prefix}-${randomUUID()}`
}

function addValidationFeedbackThread(
  review: ReviewArtifact,
  input: {
    scope: ValidationFeedbackScope
    target: ReviewArtifact['threads'][number]['target']
    body: string
    actor?: string
  },
) {
  review.threads.push({
    id: id('feedback'),
    target: input.scope === 'product_scope' ? { type: 'plan' } : input.target,
    blocking: true,
    events: [
      {
        id: id('event'),
        action: 'created',
        actor: input.actor ?? 'local-user',
        createdAt: new Date().toISOString(),
        body:
          input.scope === 'product_scope'
            ? `Product-scope validation feedback requires plan review: ${input.body.trim()}`
            : input.body.trim(),
      },
    ],
  })
}

function affectedValidationIds(
  validation: ValidationArtifact,
  target: ReviewArtifact['threads'][number]['target'],
  explicitIds: string[] = [],
) {
  const ids = new Set(explicitIds)
  if (target.type === 'validation') ids.add(target.validationId)
  if (target.type === 'file') {
    for (const node of validation.validations) {
      const paths = [...node.gherkinPaths, ...node.stepPaths, node.executable.path]
      if (paths.includes(target.path)) ids.add(node.id)
    }
  }
  return ids
}

function affectedFilePaths(target: ReviewArtifact['threads'][number]['target'], explicitPaths: string[] = []) {
  const paths = new Set(explicitPaths)
  if (target.type === 'file') paths.add(target.path)
  return paths
}

function invalidateValidationEvidence(
  validation: ValidationArtifact,
  input: {
    scope: ValidationFeedbackScope
    target: ReviewArtifact['threads'][number]['target']
    affectedValidationIds?: string[]
  },
) {
  if (input.scope === 'product_scope') {
    return {
      ...validation,
      validationDecisions: [],
      reviewSubmittedAt: undefined,
      baselineAttempts: validation.baselineAttempts,
      baselineAcknowledgements: validation.baselineAcknowledgements,
      baselineDecision: 'pending' as const,
    }
  }

  const validationIds = affectedValidationIds(validation, input.target, input.affectedValidationIds)
  return {
    ...validation,
    validationDecisions: validation.validationDecisions.filter(decision => !validationIds.has(decision.validationId)),
    reviewSubmittedAt: undefined,
    baselineAttempts: validation.baselineAttempts,
    baselineAcknowledgements: validation.baselineAcknowledgements,
    baselineDecision: validationIds.size > 0 ? ('pending' as const) : validation.baselineDecision,
  }
}

function invalidateReviewEvidence(
  review: ReviewArtifact,
  input: {
    scope: ValidationFeedbackScope
    target: ReviewArtifact['threads'][number]['target']
    affectedFilePaths?: string[]
    currentPlanRevision: number
  },
) {
  if (input.scope === 'product_scope') {
    return {
      ...review,
      planApprovals: review.planApprovals.filter(approval => approval.revision !== input.currentPlanRevision),
      fileApprovals: [],
    }
  }

  const filePaths = affectedFilePaths(input.target, input.affectedFilePaths)
  return {
    ...review,
    fileApprovals: review.fileApprovals.filter(approval => !filePaths.has(approval.path)),
  }
}

// fallow-ignore-next-line complexity
export async function submitValidationFeedback(
  input: {
    planId: string
    scope: ValidationFeedbackScope
    target: ReviewArtifact['threads'][number]['target']
    body: string
    actor?: string
    affectedValidationIds?: string[]
    affectedFilePaths?: string[]
  },
  options: Options = {},
) {
  if (!input.body.trim()) throw new ServiceError('Feedback text is required.', 'VALIDATION')
  const client = options.client ?? prisma
  await assertPlanNotCancelled(input.planId, client)
  const artifacts = await readArtifacts(input.planId, options.projectDirectory, client)
  if (!artifacts.validation || !artifacts.validationStored) {
    throw new ServiceError('Validation artifact not found.', 'NOT_FOUND')
  }
  if (!['awaiting_validation_review', 'validations_approved'].includes(artifacts.plan.lifecycle)) {
    throw new ServiceError('The plan is not awaiting validation feedback.', 'CONFLICT')
  }

  const validation = invalidateValidationEvidence(artifacts.validation, input)
  const review = invalidateReviewEvidence(artifacts.review, {
    scope: input.scope,
    target: input.target,
    affectedFilePaths: input.affectedFilePaths,
    currentPlanRevision: artifacts.plan.revision,
  })
  addValidationFeedbackThread(review, input)

  const nextLifecycle = input.scope === 'product_scope' ? 'changes_requested' : 'validation_changes_requested'
  const plan = { ...artifacts.plan, lifecycle: nextLifecycle } as PlanArtifact
  await artifacts.repository.compareAndWrite(
    'validation',
    input.planId,
    artifacts.validationStored.hash,
    serializeYamlArtifact('validation', validation),
  )
  await artifacts.repository.compareAndWrite(
    'review',
    input.planId,
    artifacts.reviewStored.hash,
    serializeYamlArtifact('review', review),
  )
  await artifacts.repository.compareAndWrite(
    'plan',
    input.planId,
    artifacts.planStored.hash,
    serializeYamlArtifact('plan', plan),
  )
  await syncPlans({ projectDirectory: artifacts.projectRoot, client })
  await appendPlanEvent(
    {
      planId: input.planId,
      type: input.scope === 'product_scope' ? 'plan_changes_requested' : 'validation_changes_requested',
      payload: {
        revision: artifacts.plan.revision,
        scope: input.scope,
        target: input.target,
        rationale: input.body.trim(),
      },
    },
    client,
  )
  return { plan, review, validation }
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
  const artifacts = await readArtifacts(input.planId, options.projectDirectory, options.client ?? prisma)
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
  await syncPlans({ projectDirectory: artifacts.projectRoot, client: options.client ?? prisma })
  return decision
}

async function readValidationFileForReview(planId: string, path: string, options: Options = {}) {
  const artifacts = await readArtifacts(planId, options.projectDirectory, options.client ?? prisma)
  const file = artifacts.validation?.files.find(item => item.path === path)
  if (!file) throw new ServiceError('Validation file not found.', 'NOT_FOUND')
  return { artifacts, file }
}

export async function approveValidationFile(
  input: { planId: string; path: string; contentHash: string; approvedBy: string },
  options: Options = {},
) {
  const { artifacts, file } = await readValidationFileForReview(input.planId, input.path, options)
  if (fileReviewHash(file) !== input.contentHash) {
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
  await syncPlans({ projectDirectory: artifacts.projectRoot, client: options.client ?? prisma })
  return approval
}

export async function approveCurrentValidationFile(
  input: { planId: string; path: string; approvedBy: string },
  options: Options = {},
) {
  const { file } = await readValidationFileForReview(input.planId, input.path, options)
  return approveValidationFile({ ...input, contentHash: fileReviewHash(file) }, options)
}

// fallow-ignore-next-line complexity
export async function submitValidationReview(planId: string, options: Options = {}) {
  const client = options.client ?? prisma
  await assertPlanNotCancelled(planId, client)
  const artifacts = await readArtifacts(planId, options.projectDirectory, client)
  if (
    artifacts.plan.lifecycle !== 'awaiting_validation_review' ||
    !artifacts.validation ||
    !artifacts.validationStored
  ) {
    throw new ServiceError('The plan is not awaiting validation review.', 'CONFLICT')
  }
  const readiness = assessValidationReadiness(artifacts.validation, artifacts.review)
  if (!readiness.ready) throw new ServiceError(readiness.blockers.join(' '), 'CONFLICT')
  const runtimeValidation = await materializeValidationRuntime({
    projectRoot: artifacts.projectRoot,
    validationFileRoot: artifacts.validationFileRoot,
    targetProject: artifacts.targetProject,
    validation: artifacts.validation,
  })
  assertRuntimePreflightPassed(runtimeValidation)
  const materializedValidation = await assertValidationFilesMaterialized({
    projectRoot: artifacts.projectRoot,
    validationFileRoot: artifacts.validationFileRoot,
    targetProject: artifacts.targetProject,
    validation: runtimeValidation,
  })
  await assertValidationEnvironmentsReady(materializedValidation, client, artifacts.targetProject)
  const projection = await projectValidationArtifacts({ planId, validation: materializedValidation }, client)

  const validation = { ...materializedValidation, reviewSubmittedAt: new Date().toISOString() }
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
    {
      planId,
      type: 'validations_approved',
      payload: { revision: plan.revision, submissionId: randomUUID(), projection },
    },
    client,
  )
  return { plan, validation }
}
