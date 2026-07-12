import { createHash } from 'node:crypto'
import path from 'node:path'
import { BrowserEngine, TestRunResult, TestRunStatus, type Prisma, type PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { extractCucumberEvidence } from '@/lib/baseline-execution/baseline'
import {
  analyzeBlockingFeedback,
  canCompleteImplementation,
  implementationState,
  queuedFeedbackMessage,
  runnableTasks,
  type CheckpointType,
  type TaskState,
} from '@/lib/implementation-checkpoints/protocol'
import {
  parseYamlArtifact,
  serializeYamlArtifact,
  type PlanArtifact,
  type ReviewArtifact,
  type ValidationArtifact,
} from '@/lib/plan-contract'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { findProjectRoot } from '@/lib/plans/project-root'
import { syncPlans } from '@/lib/plans/plan-sync-service'
import { ServiceError } from '@/services/shared/errors'
import { getTestRunLogsService } from '@/services/test-run/test-run-service'
import {
  createTestRunArtifactAccess,
  createTestRunArtifactContext,
} from '@/services/test-run/test-run-artifact-context'
import { summarizeRunEvidence, type TestRunEvidenceHealthValue } from '@/services/test-run/run-evidence-summary-service'
import { RuntimeCapsuleTestRunService } from '@/services/test-run/runtime-capsule-test-run-service'

import {
  appendPlanEvent,
  assertPlanNotCancelled,
  readLatestPlanEventSequence,
  withPlanEventStreamLock,
} from './coordinator-service'
import { readStoredJsonReport } from './coordinator-baseline-service'

type Options = { client?: PrismaClient; projectDirectory?: string; now?: Date; appraiseRoot?: string }

function completionEvidenceHash(value: unknown) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

async function readArtifacts(planId: string, projectDirectory?: string) {
  const projectRoot = await findProjectRoot(projectDirectory)
  const repository = new PlanArtifactRepository(projectRoot)
  const [planStored, validationStored, reviewStored] = await Promise.all([
    repository.read('plan', planId),
    repository.read('validation', planId),
    repository.read('review', planId),
  ])
  return {
    projectRoot,
    repository,
    planStored,
    validationStored,
    reviewStored,
    plan: parseYamlArtifact('plan', planStored.content) as PlanArtifact,
    validation: parseYamlArtifact('validation', validationStored.content) as ValidationArtifact,
    review: parseYamlArtifact('review', reviewStored.content) as ReviewArtifact,
  }
}

async function writeArtifacts(
  artifacts: Awaited<ReturnType<typeof readArtifacts>>,
  plan: PlanArtifact,
  validation: ValidationArtifact,
  review: ReviewArtifact,
  client: PrismaClient,
) {
  // This mirrors the baseline coordinator's artifact transaction boundary.
  // fallow-ignore-next-line code-duplication
  await artifacts.repository.compareAndWrite(
    'validation',
    plan.planId,
    artifacts.validationStored.hash,
    serializeYamlArtifact('validation', validation),
  )
  if (plan.lifecycle !== artifacts.plan.lifecycle) {
    await artifacts.repository.compareAndWrite(
      'plan',
      plan.planId,
      artifacts.planStored.hash,
      serializeYamlArtifact('plan', plan),
    )
  }
  if (review.finalSignOff !== artifacts.review.finalSignOff) {
    await artifacts.repository.compareAndWrite(
      'review',
      plan.planId,
      artifacts.reviewStored.hash,
      serializeYamlArtifact('review', review),
    )
  }
  await syncPlans({ projectDirectory: artifacts.projectRoot, client })
}

function assertImplementationLifecycle(plan: PlanArtifact) {
  if (
    !['in_progress', 'paused', 'ready_for_validation', 'validating', 'failed_validation', 'validation_passed'].includes(
      plan.lifecycle,
    )
  ) {
    throw new ServiceError('The plan is not in implementation.', 'CONFLICT')
  }
}

function assertBaselineAccepted(validation: ValidationArtifact) {
  if (validation.baselineDecision === 'accepted') return
  throw new ServiceError('Accepted baselines are required before implementation.', 'CONFLICT')
}

function preImplementationRecovery(plan: PlanArtifact, validation: ValidationArtifact) {
  if (
    ['in_progress', 'paused', 'ready_for_validation', 'validating', 'failed_validation', 'validation_passed'].includes(
      plan.lifecycle,
    ) &&
    validation.baselineDecision === 'accepted'
  ) {
    return null
  }
  const next =
    plan.lifecycle === 'validations_approved' || plan.lifecycle === 'baseline_changes_requested'
      ? {
          action: 'start_baseline',
          tool: 'baseline_start',
          endpoint: `/api/internal/coordinator/plans/${plan.planId}/baseline/start`,
        }
      : plan.lifecycle === 'baseline_running'
        ? {
            action: 'reconcile_baseline',
            tool: 'baseline_reconcile',
            endpoint: `/api/internal/coordinator/plans/${plan.planId}/baseline/reconcile`,
          }
        : plan.lifecycle === 'baseline_review'
          ? {
              action: 'accept_baseline',
              tool: 'baseline_accept',
              endpoint: `/api/internal/coordinator/plans/${plan.planId}/baseline/accept`,
            }
          : plan.lifecycle === 'baseline_accepted' && validation.baselineDecision === 'accepted'
            ? {
                action: 'start_implementation',
                tool: 'implementation_start',
                endpoint: `/api/internal/coordinator/plans/${plan.planId}/implementation/start`,
              }
            : {
                action: 'wait_for_lifecycle_gate',
                tool: 'validation_review_loop',
                endpoint: `/api/internal/coordinator/plans/${plan.planId}/events`,
              }
  return {
    status: 'blocked_pre_implementation',
    planId: plan.planId,
    lifecycle: plan.lifecycle,
    baselineDecision: validation.baselineDecision,
    terminal: false,
    mustContinue: true,
    blockingReasons: ['Implementation checkpoints require accepted baseline evidence and implementation_start.'],
    nextAllowedAction: next,
    nextRecommendedAction:
      'Complete validation review, baseline execution, baseline acceptance, and implementation_start before recording implementation checkpoints.',
    nextRequiredAgentBehavior: next.action,
  }
}

function completionNextActions(planId: string, blockers: string[]) {
  return blockers.map(blocker => {
    if (blocker.includes('Required tasks are not verified')) {
      return {
        blocker,
        nextMcpAction: 'implementation_task_update',
        requiredInput: { planId, taskId: '<task-id>', status: 'verified' },
      }
    }
    if (blocker.includes('fresh passing run')) {
      return {
        blocker,
        nextMcpAction: 'implementation_validation_start',
        requiredInput: { planId, validationIds: ['<validation-id>'], commitHash: '<current-commit>' },
      }
    }
    if (blocker.includes('evidence must remain protected')) {
      return {
        blocker,
        nextMcpAction: 'implementation_completion_review',
        requiredInput: { planId },
      }
    }
    return {
      blocker,
      nextMcpAction: 'implementation_checkpoint',
      requiredInput: { planId, type: 'before_completion' },
    }
  })
}

async function implementationContext(planId: string, options: Options) {
  const client = options.client ?? prisma
  await assertPlanNotCancelled(planId, client)
  const artifacts = await readArtifacts(planId, options.projectDirectory)
  assertImplementationLifecycle(artifacts.plan)
  assertBaselineAccepted(artifacts.validation)
  return { client, artifacts, implementation: implementationState(artifacts.validation) }
}

// fallow-ignore-next-line complexity
export async function reachImplementationCheckpoint(
  input: { planId: string; type: CheckpointType; taskIds?: string[]; queuedFeedbackCount?: number },
  options: Options = {},
) {
  const client = options.client ?? prisma
  await assertPlanNotCancelled(input.planId, client)
  const artifacts = await readArtifacts(input.planId, options.projectDirectory)
  const recovery = preImplementationRecovery(artifacts.plan, artifacts.validation)
  if (recovery) return recovery
  assertImplementationLifecycle(artifacts.plan)
  assertBaselineAccepted(artifacts.validation)
  const implementation = implementationState(artifacts.validation)
  const checkpoint = {
    type: input.type,
    taskIds: input.taskIds ?? [],
    queuedFeedbackCount: input.queuedFeedbackCount ?? 0,
    reachedAt: (options.now ?? new Date()).toISOString(),
  }
  const validation = { ...artifacts.validation, implementation: { ...implementation, checkpoint } }
  await writeArtifacts(artifacts, artifacts.plan, validation, artifacts.review, client)
  await appendPlanEvent(
    {
      planId: input.planId,
      type: 'implementation_checkpoint',
      payload: {
        ...checkpoint,
        feedbackMessage: checkpoint.queuedFeedbackCount ? queuedFeedbackMessage(input.type) : undefined,
      },
    },
    client,
  )
  return {
    checkpoint,
    runnableTaskIds: runnableTasks(
      artifacts.plan,
      implementation.taskStates,
      implementation.approvedGroupIds,
      implementation.pausedTaskIds,
    ),
  }
}

// Task transition and dependency checks intentionally remain together.
// fallow-ignore-next-line complexity
export async function updateImplementationTask(
  input: { planId: string; taskId: string; status: TaskState; commitHash?: string },
  options: Options = {},
) {
  const { client, artifacts, implementation } = await implementationContext(input.planId, options)
  if (!artifacts.plan.tasks.some(task => task.id === input.taskId))
    throw new ServiceError('Plan task not found.', 'NOT_FOUND')
  const allowed: Record<TaskState, readonly TaskState[]> = {
    pending: ['in_progress'],
    in_progress: ['implemented', 'pending'],
    implemented: ['verified', 'in_progress'],
    verified: ['in_progress'],
  }
  const current = implementation.taskStates[input.taskId] ?? 'pending'
  const commitOnlyReplay = current === input.status && input.status === 'implemented' && Boolean(input.commitHash)
  if (!commitOnlyReplay && !allowed[current].includes(input.status)) {
    throw new ServiceError(`Cannot transition task from ${current} to ${input.status}.`, 'CONFLICT')
  }
  if (input.status === 'in_progress') {
    const runnable = runnableTasks(
      artifacts.plan,
      implementation.taskStates,
      implementation.approvedGroupIds,
      implementation.pausedTaskIds,
    )
    if (!runnable.includes(input.taskId) && current === 'pending') {
      throw new ServiceError('Task dependencies or implementation-group approval are incomplete.', 'CONFLICT')
    }
  }
  const existingCommit = input.commitHash
    ? implementation.commits.find(commit => commit.hash === input.commitHash)
    : undefined
  if (commitOnlyReplay && existingCommit?.taskIds.includes(input.taskId)) return implementation
  const commits =
    input.status === 'implemented' && input.commitHash
      ? existingCommit
        ? implementation.commits.map(commit =>
            commit.hash === input.commitHash
              ? { ...commit, taskIds: Array.from(new Set([...commit.taskIds, input.taskId])).sort() }
              : commit,
          )
        : [
            ...implementation.commits,
            { hash: input.commitHash, taskIds: [input.taskId], createdAt: (options.now ?? new Date()).toISOString() },
          ]
      : implementation.commits
  const validation = {
    ...artifacts.validation,
    implementation: {
      ...implementation,
      taskStates: { ...implementation.taskStates, [input.taskId]: input.status },
      commits,
    },
  }
  await writeArtifacts(artifacts, artifacts.plan, validation, artifacts.review, client)
  await appendPlanEvent({ planId: input.planId, type: 'task_updated', payload: input }, client)
  return validation.implementation
}

export async function approveImplementationGroups(
  input: { planId: string; groupIds: string[] },
  options: Options = {},
) {
  const { client, artifacts, implementation } = await implementationContext(input.planId, options)
  const knownGroupIds = new Set(artifacts.plan.implementationGroups.map(group => group.id))
  const unknownGroupIds = input.groupIds.filter(groupId => !knownGroupIds.has(groupId))
  if (unknownGroupIds.length > 0) {
    throw new ServiceError(`Implementation groups were not found: ${unknownGroupIds.join(', ')}.`, 'NOT_FOUND')
  }
  const approvedGroupIds = Array.from(new Set([...implementation.approvedGroupIds, ...input.groupIds])).sort()
  const validation = { ...artifacts.validation, implementation: { ...implementation, approvedGroupIds } }
  await writeArtifacts(artifacts, artifacts.plan, validation, artifacts.review, client)
  const runnableTaskIds = runnableTasks(
    artifacts.plan,
    validation.implementation.taskStates,
    validation.implementation.approvedGroupIds,
    validation.implementation.pausedTaskIds,
  )
  await appendPlanEvent(
    {
      planId: input.planId,
      type: 'implementation_groups_approved',
      payload: { approvedGroupIds, runnableTaskIds },
    },
    client,
  )
  return { implementation: validation.implementation, runnableTaskIds }
}

// fallow-ignore-next-line complexity
export async function applyBlockingFeedback(
  input: { planId: string; affectedTaskIds: string[]; confirmed: boolean; pausePlanWide?: boolean },
  options: Options = {},
) {
  const { client, artifacts, implementation } = await implementationContext(input.planId, options)
  const impact = analyzeBlockingFeedback(
    artifacts.plan,
    artifacts.validation,
    input.affectedTaskIds,
    implementation.approvedGroupIds,
  )
  if (!input.confirmed) return { confirmationRequired: true, impact }
  const pausedTaskIds = input.pausePlanWide
    ? artifacts.plan.tasks.map(task => task.id)
    : [...new Set([...implementation.pausedTaskIds, ...impact.affectedTaskIds, ...impact.transitiveDependentIds])]
  const impactedValidationIds = new Set(impact.impactedValidationIds)
  const validation = {
    ...artifacts.validation,
    implementation: {
      ...implementation,
      pausedTaskIds,
      approvedGroupIds: implementation.approvedGroupIds.filter(
        id => !impact.approvalsRequiringConfirmation.includes(id),
      ),
      taskStates: Object.fromEntries(
        Object.entries(implementation.taskStates).map(([taskId, state]) => [
          taskId,
          pausedTaskIds.includes(taskId) && state !== 'pending' ? 'pending' : state,
        ]),
      ),
      validationRuns: implementation.validationRuns.map(run =>
        impactedValidationIds.has(run.validationId) ? { ...run, fresh: false } : run,
      ),
    },
  }
  const plan = input.pausePlanWide ? { ...artifacts.plan, lifecycle: 'paused' as const } : artifacts.plan
  await writeArtifacts(artifacts, plan, validation, artifacts.review, client)
  await appendPlanEvent({ planId: input.planId, type: 'implementation_feedback_applied', payload: impact }, client)
  return { confirmationRequired: false, impact, plan, implementation: validation.implementation }
}

// fallow-ignore-next-line complexity
export async function controlImplementation(
  input: { planId: string; action: 'pause' | 'resume' | 'cancel'; stopActiveRuns?: boolean },
  options: Options = {},
) {
  const client = options.client ?? prisma
  if (input.action !== 'cancel') await assertPlanNotCancelled(input.planId, client)
  const artifacts = await readArtifacts(input.planId, options.projectDirectory)
  assertImplementationLifecycle(artifacts.plan)
  const lifecycle = input.action === 'pause' ? 'paused' : input.action === 'resume' ? 'in_progress' : 'cancelled'
  const plan = { ...artifacts.plan, lifecycle } as PlanArtifact
  await writeArtifacts(artifacts, plan, artifacts.validation, artifacts.review, client)
  await appendPlanEvent(
    {
      planId: input.planId,
      type: input.action === 'cancel' ? 'plan_cancelled' : `implementation_${input.action}d`,
      payload: input.action === 'cancel' ? { stopActiveRuns: input.stopActiveRuns ?? false } : undefined,
    },
    client,
  )
  return plan
}

function browserEngine(browser: string): BrowserEngine {
  const normalized = browser.trim().toLowerCase()
  if (normalized === 'firefox') return BrowserEngine.FIREFOX
  if (normalized === 'webkit') return BrowserEngine.WEBKIT
  return BrowserEngine.CHROMIUM
}

function implementationValidationRunId(validationId: string, browser: string, environment: string, startedAt: string) {
  const stamp = startedAt.replace(/[^0-9]/g, '').slice(0, 14)
  return `implementation-validation-${validationId}-${browser}-${environment}-${stamp}`
}

function preparedImplementationRun(input: {
  planId: string
  id: string
  validation: ValidationArtifact['validations'][number]
  commitHash: string
  browser: string
  environment: string
  tagExpression: string
  testRunId?: string
  runtimePaths?: { featurePaths: string[]; importPaths: string[] }
}) {
  return {
    id: input.id,
    validationId: input.validation.id,
    taskIds: input.validation.taskIds,
    required: input.validation.required,
    status: 'running' as const,
    fresh: true,
    commitHash: input.commitHash,
    evidenceSource: 'managed' as const,
    assurance: 'reduced' as const,
    browser: input.browser,
    environment: input.environment,
    tagExpression: input.tagExpression,
    ...(input.testRunId ? { testRunId: input.testRunId } : {}),
    ...(input.runtimePaths
      ? {
          runtimePaths: {
            gherkinPaths: input.runtimePaths.featurePaths,
            stepPaths: input.runtimePaths.importPaths,
            executablePath: input.validation.executable.path,
          },
        }
      : {}),
    evidenceUrls: [`/plans/${input.planId}?review=implementation#${input.validation.id}`],
  }
}

type ImplementationValidationRun = NonNullable<ValidationArtifact['implementation']>['validationRuns'][number]
type ManagedTestRunEvidence = {
  runId: string
  status: TestRunStatus
  result: TestRunResult
  reportPath: string | null
  completedAt: Date | null
  evidenceHealth?: TestRunEvidenceHealthValue
}

function managedInfrastructureFailure(run: ImplementationValidationRun, now: Date) {
  return {
    ...run,
    status: 'infrastructure_failure' as const,
    assurance: 'reduced' as const,
    evidenceSource: 'managed' as const,
    evidenceUrls: run.evidenceUrls,
    completedAt: now.toISOString(),
  }
}

function implementationRunStatus(testRun: ManagedTestRunEvidence) {
  if (
    testRun.status === TestRunStatus.RUNNING ||
    testRun.status === TestRunStatus.QUEUED ||
    testRun.status === TestRunStatus.CANCELLING
  ) {
    return 'running' as const
  }
  if (testRun.evidenceHealth && testRun.evidenceHealth !== 'valid') {
    return testRun.evidenceHealth === 'infrastructure_failure'
      ? ('infrastructure_failure' as const)
      : ('failed' as const)
  }
  if (testRun.result === TestRunResult.PASSED) return 'passed' as const
  if (testRun.result === TestRunResult.CANCELLED) return 'cancelled' as const
  return 'failed' as const
}

async function failureSignatureHashForRun(testRun: ManagedTestRunEvidence, client: PrismaClient, appraiseRoot: string) {
  const capsule = await client.testRun.findUnique({
    where: { runId: testRun.runId },
    select: { runtimeCapsule: { select: { id: true } } },
  })
  const report = capsule?.runtimeCapsule
    ? await createTestRunArtifactAccess(createTestRunArtifactContext(appraiseRoot), client)
        .readText({ runId: testRun.runId, kind: 'report' })
        .then(JSON.parse)
    : await readStoredJsonReport(testRun.reportPath)
  const reportEvidence = extractCucumberEvidence(report)
  const logs = await getTestRunLogsService(testRun.runId, undefined, appraiseRoot, client).catch(() => [])
  const failureText = [
    ...reportEvidence.failureSignatures,
    ...logs.filter(log => log.type === 'stderr').map(log => log.message.trim()),
  ]
    .filter(Boolean)
    .join('\n')
  return failureText ? completionEvidenceHash(failureText) : undefined
}

async function loadManagedImplementationRun(
  run: ImplementationValidationRun,
  client: PrismaClient,
  now: Date,
  appraiseRoot: string,
) {
  if (!run.testRunId) {
    return managedInfrastructureFailure(run, now)
  }

  const testRun = await client.testRun.findUnique({
    where: { runId: run.testRunId },
    select: { runId: true, status: true, result: true, reportPath: true, completedAt: true },
  })
  if (!testRun) {
    return managedInfrastructureFailure(run, now)
  }

  const evidenceSummary = await summarizeRunEvidence(testRun.runId, client, appraiseRoot)
  const status = implementationRunStatus({ ...testRun, evidenceHealth: evidenceSummary.evidenceHealth })
  const failureSignatureHash = await failureSignatureHashForRun(testRun, client, appraiseRoot)

  return {
    ...run,
    evidenceSource: 'managed' as const,
    assurance:
      status === 'passed' && evidenceSummary.evidenceHealth === 'valid' ? ('full' as const) : ('reduced' as const),
    status,
    testRunId: testRun.runId,
    evidenceUrls: [`/test-runs/${testRun.runId}`, `/api/test-runs/${testRun.runId}/logs`],
    evidence: {
      logsUrl: `/api/test-runs/${testRun.runId}/logs`,
      reportUrl: `/test-runs/${testRun.runId}`,
      traceUrls: [],
      screenshotUrls: [],
    },
    failureSignatureHash,
    completedAt: status === 'running' ? undefined : (testRun.completedAt ?? now).toISOString(),
  }
}

export async function recordImplementationValidation(
  input: {
    planId: string
    run: NonNullable<ValidationArtifact['implementation']>['validationRuns'][number]
  },
  options: Options = {},
) {
  const { client, artifacts, implementation } = await implementationContext(input.planId, options)
  const manualRun = {
    ...input.run,
    evidenceSource: 'manual' as const,
    assurance: 'reduced' as const,
    testRunId: undefined,
  }
  const validationRuns = [...implementation.validationRuns.filter(run => run.id !== manualRun.id), manualRun]
  const validation = { ...artifacts.validation, implementation: { ...implementation, validationRuns } }
  const readiness = canCompleteImplementation(artifacts.plan, validation)
  const plan = {
    ...artifacts.plan,
    lifecycle: readiness.ready ? ('validation_passed' as const) : ('failed_validation' as const),
  }
  await writeArtifacts(artifacts, plan, validation, artifacts.review, client)
  await appendPlanEvent(
    {
      planId: input.planId,
      type: readiness.ready ? 'validation_passed' : 'validation_failed',
      payload: { runId: input.run.id, blockers: readiness.blockers },
    },
    client,
  )
  return { plan, validation, readiness }
}

type ImplementationValidation = ValidationArtifact['validations'][number]
type CapsuleStart = {
  request: Parameters<RuntimeCapsuleTestRunService['prepare']>[0]
  testRunDbId: string
}

function selectImplementationValidations(validation: ValidationArtifact, requestedValidationIds?: string[]) {
  const requestedIds = new Set(requestedValidationIds ?? validation.validations.map(item => item.id))
  const selected = validation.validations.filter(item => requestedIds.has(item.id))
  if (selected.length !== requestedIds.size) {
    throw new ServiceError('One or more implementation validations were not found.', 'NOT_FOUND')
  }
  if (selected.some(item => item.astProvenance?.schemaVersion !== '2')) {
    throw new ServiceError('AST validations require an exact reviewed v2 publication before execution.', 'CONFLICT')
  }
  return selected
}

async function loadImplementationExecutionContext(
  planId: string,
  selected: ImplementationValidation[],
  client: PrismaClient,
) {
  const projection = await client.planProjection.findUnique({
    where: { planId },
    select: { targetProject: { select: { id: true, canonicalPath: true } } },
  })
  const requestedValues = [...new Set(selected.flatMap(item => item.matrix.map(matrix => matrix.environment)))]
  const environments = await client.environment.findMany({
    where: { OR: [{ id: { in: requestedValues } }, { name: { in: requestedValues } }] },
    select: { id: true, name: true },
  })
  return {
    projection,
    environmentByValue: new Map(
      environments.flatMap(environment => [
        [environment.id, environment],
        [environment.name, environment],
      ]),
    ),
  }
}

function mapTestCasesToSuites(validation: ValidationArtifact) {
  return new Map(
    validation.validations.flatMap(item =>
      item.appraiseArtifacts.testSuites.flatMap(suite =>
        suite.testCaseIds.map(testCaseId => [testCaseId, suite.id] as const),
      ),
    ),
  )
}

function expectedTestCasesForValidation(
  validation: ImplementationValidation,
  suiteIdByTestCaseId: Map<string, string>,
) {
  return validation.testCaseIds.map(testCaseId => {
    const testSuiteId = suiteIdByTestCaseId.get(testCaseId)
    if (!testSuiteId) throw new ServiceError(`Test case "${testCaseId}" is not assigned to a suite.`, 'VALIDATION')
    return { testCaseId, testSuiteId }
  })
}

async function durablePreparationKey(input: { client: PrismaClient; prefix: string }) {
  const preparations = await input.client.testRun.findMany({
    where: { preparationKey: { startsWith: input.prefix } },
    select: { preparationKey: true, status: true },
    orderBy: { preparationKey: 'asc' },
  })
  const reusable = preparations.find(run => run.status === TestRunStatus.QUEUED || run.status === TestRunStatus.RUNNING)
  const ordinal = reusable ? Number(reusable.preparationKey!.slice(input.prefix.length)) : preparations.length
  return `${input.prefix}${ordinal}`
}

async function prepareImplementationMatrixEntry(input: {
  planId: string
  commitHash?: string
  startedAt: string
  artifacts: Awaited<ReturnType<typeof readArtifacts>>
  client: PrismaClient
  projection: Awaited<ReturnType<typeof loadImplementationExecutionContext>>['projection']
  environmentByValue: Awaited<ReturnType<typeof loadImplementationExecutionContext>>['environmentByValue']
  validation: ImplementationValidation
  matrix: ImplementationValidation['matrix'][number]
  expectedTestCases: Array<{ testCaseId: string; testSuiteId: string }>
  tagExpression: string
  capsuleService: RuntimeCapsuleTestRunService
  capsuleStarts: CapsuleStart[]
  preparedCapsuleTestRunDbIds: string[]
}) {
  const environment = input.environmentByValue.get(input.matrix.environment)
  if (!environment) throw new ServiceError(`Environment "${input.matrix.environment}" was not found.`, 'VALIDATION')
  const provenance = input.validation.astProvenance
  if (provenance?.schemaVersion !== '2')
    throw new ServiceError('Managed implementation validation requires exact v2 AST provenance.', 'CONFLICT')
  const id = implementationValidationRunId(
    input.validation.id,
    input.matrix.browser,
    input.matrix.environment,
    input.startedAt,
  )
  const provenanceIdentity = `${provenance.publishOperationId}:${provenance.runtimeInputHash}`
  const prefix = `implementation:${input.planId}:${input.artifacts.plan.revision}:${provenanceIdentity}:${input.validation.id}:${input.matrix.browser}:${input.matrix.environment}:`
  const preparationKey = await durablePreparationKey({ client: input.client, prefix })
  const name = `Implementation validation ${input.planId} ${input.validation.id} ${input.matrix.browser} ${input.matrix.environment}`
  let testRunId: string | undefined
  {
    const request = {
      operationId: provenance.publishOperationId,
      planId: input.planId,
      validationId: input.validation.id,
      targetProjectId: input.projection!.targetProject!.id,
      environmentId: environment.id,
      name,
      browserEngine: browserEngine(input.matrix.browser),
      preparationKey,
    }
    const prepared = await input.capsuleService.prepare(request)
    testRunId = prepared.runId
    input.capsuleStarts.push({ request, testRunDbId: prepared.id })
    input.preparedCapsuleTestRunDbIds.push(prepared.id)
  }
  return preparedImplementationRun({
    id,
    planId: input.planId,
    validation: input.validation,
    commitHash: input.commitHash ?? 'pending',
    browser: input.matrix.browser,
    environment: input.matrix.environment,
    tagExpression: input.tagExpression,
    testRunId,
  })
}

async function prepareImplementationMatrix(input: {
  planId: string
  commitHash?: string
  startedAt: string
  artifacts: Awaited<ReturnType<typeof readArtifacts>>
  selected: ImplementationValidation[]
  client: PrismaClient
  preparedCapsuleTestRunDbIds: string[]
}) {
  const { projection, environmentByValue } = await loadImplementationExecutionContext(
    input.planId,
    input.selected,
    input.client,
  )
  const suiteIdByTestCaseId = mapTestCasesToSuites(input.artifacts.validation)
  const runningRuns: ImplementationValidationRun[] = []
  const capsuleStarts: CapsuleStart[] = []
  const preparedCapsuleTestRunDbIds = input.preparedCapsuleTestRunDbIds
  const capsuleService = new RuntimeCapsuleTestRunService(input.client)

  for (const validation of input.selected) {
    if (!projection?.targetProject?.id) {
      throw new ServiceError('Reviewed AST validation requires an authoritative target project.', 'CONFLICT')
    }
    const expectedTestCases = expectedTestCasesForValidation(validation, suiteIdByTestCaseId)
    const tagExpression = expectedTestCases
      .map(({ testCaseId, testSuiteId }) => `(@ts_${testSuiteId} and @tc_${testCaseId})`)
      .join(' or ')
    for (const matrix of validation.matrix) {
      runningRuns.push(
        await prepareImplementationMatrixEntry({
          ...input,
          projection,
          environmentByValue,
          validation,
          matrix,
          expectedTestCases,
          tagExpression,
          capsuleService,
          capsuleStarts,
          preparedCapsuleTestRunDbIds,
        }),
      )
    }
  }
  return { capsuleService, capsuleStarts, preparedCapsuleTestRunDbIds, runningRuns }
}

async function cancelPreparedCapsuleRuns(client: PrismaClient, ids: string[]) {
  if (ids.length === 0) return
  await client.testRun.updateMany({
    where: { id: { in: ids }, status: TestRunStatus.QUEUED },
    data: { status: TestRunStatus.CANCELLED, result: TestRunResult.CANCELLED, completedAt: new Date() },
  })
}

async function persistImplementationValidationStart(input: {
  planId: string
  client: PrismaClient
  artifacts: Awaited<ReturnType<typeof readArtifacts>>
  implementation: NonNullable<ValidationArtifact['implementation']>
  runningRuns: ImplementationValidationRun[]
}) {
  const existingIds = new Set(input.runningRuns.map(run => run.id))
  const validation = {
    ...input.artifacts.validation,
    implementation: {
      ...input.implementation,
      validationRuns: [
        ...input.implementation.validationRuns.filter(run => !existingIds.has(run.id)),
        ...input.runningRuns,
      ],
    },
  }
  const plan = { ...input.artifacts.plan, lifecycle: 'validating' as const }
  await writeArtifacts(input.artifacts, plan, validation, input.artifacts.review, input.client)
  await appendPlanEvent(
    {
      planId: input.planId,
      type: 'implementation_validation_started',
      payload: { runIds: input.runningRuns.map(run => run.id) },
    },
    input.client,
  )
  return { plan, validation }
}

async function startPreparedCapsules(capsuleService: RuntimeCapsuleTestRunService, starts: CapsuleStart[]) {
  const results = await Promise.allSettled(
    starts.map(({ request, testRunDbId }) => capsuleService.start({ ...request, testRunDbId })),
  )
  return starts.map(({ testRunDbId }, index) => {
    const result = results[index]!
    return result.status === 'fulfilled'
      ? { testRunDbId, status: 'started' as const, attemptId: result.value.attemptId }
      : {
          testRunDbId,
          status: 'infrastructure_failure' as const,
          code: 'CAPSULE_START_FAILED' as const,
          message: 'The managed runtime capsule could not start. Inspect bounded run diagnostics before retrying.',
        }
  })
}

export async function startImplementationValidation(
  input: { planId: string; validationIds?: string[]; commitHash?: string },
  options: Options = {},
) {
  const { client, artifacts, implementation } = await implementationContext(input.planId, options)
  const selected = selectImplementationValidations(artifacts.validation, input.validationIds)
  const startedAt = (options.now ?? new Date()).toISOString()
  const preparedCapsuleTestRunDbIds: string[] = []
  let prepared
  try {
    prepared = await prepareImplementationMatrix({
      planId: input.planId,
      commitHash: input.commitHash,
      startedAt,
      artifacts,
      selected,
      client,
      preparedCapsuleTestRunDbIds,
    })
  } catch (error) {
    await cancelPreparedCapsuleRuns(client, preparedCapsuleTestRunDbIds)
    throw error
  }
  const { plan, validation } = await persistImplementationValidationStart({
    planId: input.planId,
    client,
    artifacts,
    implementation,
    runningRuns: prepared.runningRuns,
  })
  const capsuleStartOutcomes = await startPreparedCapsules(prepared.capsuleService, prepared.capsuleStarts)
  return {
    plan,
    validation,
    runs: prepared.runningRuns,
    capsuleStartOutcomes,
  }
}

function assertTaskReconciliationInput(input: { verifyTaskIds?: string[]; idempotencyKey?: string }) {
  const hasTasks = Boolean(input.verifyTaskIds?.length)
  const hasKey = Boolean(input.idempotencyKey)
  if (hasTasks !== hasKey) {
    throw new ServiceError('Task verification and its idempotency key must be supplied together.', 'VALIDATION')
  }
}

function managedRunSatisfiesTask(run: ImplementationValidationRun | undefined) {
  return Boolean(
    run?.fresh &&
      run.status === 'passed' &&
      run.evidenceSource === 'managed' &&
      run.assurance === 'full' &&
      run.testRunId,
  )
}

function assertTasksCanBeVerified(input: {
  plan: PlanArtifact
  validation: ValidationArtifact
  implementation: NonNullable<ValidationArtifact['implementation']>
  updatedRuns: ImplementationValidationRun[]
  taskIds: string[]
}) {
  const knownTaskIds = new Set(input.plan.tasks.map(task => task.id))
  const unknownTaskIds = input.taskIds.filter(taskId => !knownTaskIds.has(taskId))
  if (unknownTaskIds.length)
    throw new ServiceError(`Plan tasks were not found: ${unknownTaskIds.join(', ')}.`, 'NOT_FOUND')

  for (const taskId of input.taskIds) {
    if (!['implemented', 'verified'].includes(input.implementation.taskStates[taskId] ?? 'pending')) {
      throw new ServiceError(`Task "${taskId}" must be implemented before evidence can verify it.`, 'CONFLICT')
    }
    const unsatisfied = input.validation.validations
      .filter(validation => validation.required && validation.taskIds.includes(taskId))
      .map(validation => validation.id)
      .filter(validationId => {
        const run = [...input.updatedRuns].reverse().find(candidate => candidate.validationId === validationId)
        return !managedRunSatisfiesTask(run)
      })
    if (unsatisfied.length) {
      throw new ServiceError(
        `Task "${taskId}" requires fresh passing managed evidence for: ${unsatisfied.join(', ')}.`,
        'CONFLICT',
      )
    }
  }
}

function reconciliationEvent(input: {
  receipt?: NonNullable<ValidationArtifact['implementation']>['reconciliationReceipts'][number]
  runIds: string[]
  blockers: string[]
  ready: boolean
}) {
  if (input.receipt) return { type: 'task_evidence_reconciled', payload: input.receipt }
  return {
    type: input.ready ? 'validation_passed' : 'validation_failed',
    payload: { runIds: input.runIds, blockers: input.blockers },
  }
}

export async function reconcileImplementationValidation(
  input: {
    planId: string
    runIds?: string[]
    verifyTaskIds?: string[]
    idempotencyKey?: string
  },
  options: Options = {},
) {
  const { client, artifacts, implementation } = await implementationContext(input.planId, options)
  assertTaskReconciliationInput(input)
  const existingReceipt = implementation.reconciliationReceipts.find(
    receipt => receipt.idempotencyKey === input.idempotencyKey,
  )
  if (existingReceipt) {
    return {
      plan: artifacts.plan,
      validation: artifacts.validation,
      readiness: canCompleteImplementation(artifacts.plan, artifacts.validation),
      receipt: existingReceipt,
    }
  }
  const selectedRunIds = new Set(input.runIds ?? implementation.validationRuns.map(run => run.id))
  const selectedRuns = implementation.validationRuns.filter(run => selectedRunIds.has(run.id))
  if (selectedRuns.length !== selectedRunIds.size) {
    throw new ServiceError('One or more implementation validation runs were not found.', 'NOT_FOUND')
  }
  const now = options.now ?? new Date()
  const managedUpdates = await Promise.all(
    selectedRuns.map(run =>
      run.evidenceSource === 'managed' || run.testRunId
        ? loadManagedImplementationRun(
            run,
            client,
            now,
            options.appraiseRoot ?? path.join(artifacts.projectRoot, '.appraise'),
          )
        : run,
    ),
  )
  const updates = new Map(managedUpdates.map(run => [run.id, run]))
  const updatedRuns = implementation.validationRuns.map(run => updates.get(run.id) ?? run)
  const verifiedTaskIds = Array.from(new Set(input.verifyTaskIds ?? [])).sort()
  assertTasksCanBeVerified({
    plan: artifacts.plan,
    validation: artifacts.validation,
    implementation,
    updatedRuns,
    taskIds: verifiedTaskIds,
  })
  const receipt = input.idempotencyKey
    ? {
        idempotencyKey: input.idempotencyKey,
        runIds: [...updates.keys()].sort(),
        verifiedTaskIds,
        reconciledAt: now.toISOString(),
      }
    : undefined
  const validation = {
    ...artifacts.validation,
    implementation: {
      ...implementation,
      validationRuns: updatedRuns,
      taskStates: Object.fromEntries(
        Object.entries(implementation.taskStates).concat(verifiedTaskIds.map(taskId => [taskId, 'verified'])),
      ),
      reconciliationReceipts: receipt
        ? [...implementation.reconciliationReceipts, receipt]
        : implementation.reconciliationReceipts,
    },
  }
  const readiness = canCompleteImplementation(artifacts.plan, validation)
  const plan = {
    ...artifacts.plan,
    lifecycle: readiness.ready ? ('validation_passed' as const) : ('failed_validation' as const),
  }
  await writeArtifacts(artifacts, plan, validation, artifacts.review, client)
  const event = reconciliationEvent({
    receipt,
    runIds: [...updates.keys()],
    blockers: readiness.blockers,
    ready: readiness.ready,
  })
  await appendPlanEvent(
    {
      planId: input.planId,
      ...event,
    },
    client,
  )
  return { plan, validation, readiness, receipt }
}

// Completion keeps all independent final gates in one receipt.
// fallow-ignore-next-line complexity
async function evaluateImplementationCompletion(
  artifacts: Awaited<ReturnType<typeof readArtifacts>>,
  client: PrismaClient,
) {
  const implementation = implementationState(artifacts.validation)
  const baseReadiness = canCompleteImplementation(artifacts.plan, artifacts.validation)
  let exportJob: Prisma.RepositoryExportJobGetPayload<{ include: { receipt: true } }> | null
  try {
    exportJob = await client.repositoryExportJob.findFirst({
      where: { publishOperation: { planId: artifacts.plan.planId }, policy: 'required' },
      orderBy: { createdAt: 'desc' },
      include: { receipt: true },
    })
  } catch (error) {
    // A rolling-upgrade or focused legacy fixture without the additive Phase 4
    // tables has the safe disabled-policy behavior until migrations apply.
    if ((error as { code?: string }).code !== 'P2021') throw error
    exportJob = null
  }
  const exportBlockers =
    exportJob &&
    (!exportJob.receipt ||
      exportJob.state !== 'succeeded' ||
      exportJob.receipt.validationHash !== exportJob.validationHash)
      ? ['Required repository export lacks a successful receipt for the exact validation hash.']
      : []
  const readiness = {
    ...baseReadiness,
    ready: baseReadiness.ready && exportBlockers.length === 0,
    blockers: [...baseReadiness.blockers, ...exportBlockers],
  }
  const tasks = artifacts.plan.tasks.map(task => ({
    taskId: task.id,
    status: implementation.taskStates[task.id] ?? 'pending',
  }))
  const optionalFailures = implementation.validationRuns.filter(run => !run.required && run.status !== 'passed')
  const acknowledgedFailures = implementation.validationRuns.filter(
    run => run.failureSignatureHash && run.acknowledgedAt,
  )
  const receipt = {
    plan: {
      planId: artifacts.plan.planId,
      revision: artifacts.plan.revision,
      lifecycle: artifacts.plan.lifecycle,
      hash: artifacts.planStored.hash,
    },
    validation: {
      revision: artifacts.validation.revision,
      hash: artifacts.validationStored.hash,
      requiredValidationIds: artifacts.validation.validations.filter(item => item.required).map(item => item.id),
    },
    readiness,
    tasks,
    commits: implementation.commits,
    validationRuns: implementation.validationRuns,
    repositoryExport: exportJob
      ? {
          policy: exportJob.policy,
          state: exportJob.state,
          validationHash: exportJob.validationHash,
          receiptManifestHash: exportJob.receipt?.manifestHash ?? null,
        }
      : { policy: 'disabled', state: 'not_requested' },
    structuredBlockers: completionNextActions(artifacts.plan.planId, readiness.blockers),
    optionalFailures,
    acknowledgedFailures,
    blockingRemarks: artifacts.review.threads.filter(thread => thread.blocking),
    nonBlockingRemarks: artifacts.review.threads.filter(thread => !thread.blocking),
    finalSignOff: artifacts.review.finalSignOff,
    eventSequence: await readLatestPlanEventSequence(artifacts.plan.planId, client),
  }
  return { ...receipt, evidenceHash: completionEvidenceHash(receipt) }
}

export async function reviewImplementationCompletion(planId: string, options: Options = {}) {
  const artifacts = await readArtifacts(planId, options.projectDirectory)
  return evaluateImplementationCompletion(artifacts, options.client ?? prisma)
}

function staleCompletionReceipt(
  inputHash: string,
  currentReceipt: Awaited<ReturnType<typeof evaluateImplementationCompletion>>,
) {
  return new ServiceError(
    'Completion approval must reference the current completion evidence hash.',
    'CONFLICT',
    undefined,
    {
      staleEvidenceHash: inputHash,
      currentEvidenceHash: currentReceipt.evidenceHash,
      currentReceipt,
    },
  )
}

// Completion deliberately keeps all final gates adjacent to the sign-off write.
// fallow-ignore-next-line complexity
export async function approveImplementationCompletion(
  input: { planId: string; approvedBy: string; contentHash: string },
  options: Options = {},
) {
  const client = options.client ?? prisma
  let artifacts = await readArtifacts(input.planId, options.projectDirectory)
  let receipt = await evaluateImplementationCompletion(artifacts, client)
  if (input.contentHash !== receipt.evidenceHash) throw staleCompletionReceipt(input.contentHash, receipt)
  if (receipt.plan.lifecycle !== 'validation_passed') {
    throw new ServiceError('Passing validations are required before completion.', 'CONFLICT')
  }
  if (!receipt.readiness.ready) throw new ServiceError(receipt.readiness.blockers.join(' '), 'CONFLICT')
  if (receipt.blockingRemarks.length)
    throw new ServiceError('Blocking feedback must be resolved before completion.', 'CONFLICT')
  return withPlanEventStreamLock(
    input.planId,
    async () => {
      // Re-read inside the event-stream critical section. Repository compare-and-write
      // remains the final artifact CAS for non-event artifact mutations.
      artifacts = await readArtifacts(input.planId, options.projectDirectory)
      receipt = await evaluateImplementationCompletion(artifacts, client)
      if (input.contentHash !== receipt.evidenceHash) throw staleCompletionReceipt(input.contentHash, receipt)
      const review = {
        ...artifacts.review,
        finalSignOff: {
          id: `completion-${input.planId}`,
          revision: artifacts.plan.revision,
          contentHash: input.contentHash,
          relevantHashes: {
            plan: artifacts.planStored.hash,
            validation: artifacts.validationStored.hash,
            review: artifacts.reviewStored.hash,
          },
          approvedBy: input.approvedBy,
          approvedAt: (options.now ?? new Date()).toISOString(),
        },
      }
      const plan = { ...artifacts.plan, lifecycle: 'completed' as const }
      const validation = {
        ...artifacts.validation,
        implementation: { ...implementationState(artifacts.validation), evidenceProtected: false },
      }
      await writeArtifacts(artifacts, plan, validation, review, client)
      await appendPlanEvent(
        { planId: input.planId, type: 'plan_completed', payload: { approvedBy: input.approvedBy } },
        client,
      )
      return { plan, review, validation }
    },
    client,
  )
}
