import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { BrowserEngine, TestRunResult, TestRunStatus, type PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import {
  assessBaselineAcceptance,
  baselineCombinationKey,
  classifyBaselineResult,
  extractCucumberEvidence,
  requiredBaselineCombinations,
  type BaselineEvidence,
} from '@/lib/baseline-execution/baseline'
import { resolveStoredPath } from '@/lib/automation/automation-path-roots'
import {
  parseYamlArtifact,
  serializeYamlArtifact,
  type PlanArtifact,
  type ValidationArtifact,
} from '@/lib/plan-contract'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { findProjectRoot } from '@/lib/plans/project-root'
import { syncPlans } from '@/lib/plans/plan-sync-service'
import { hashFileContent } from '@/lib/validation-review/file-review'
import { validationNodeHash } from '@/lib/validation-review/approval'
import { ServiceError } from '@/services/shared/errors'
import { getTestRunLogsService } from '@/services/test-run/test-run-service'
import { testRunEvidenceLinks } from '@/services/test-run/test-run-evidence-links'
import { summarizeRunEvidence } from '@/services/test-run/run-evidence-summary-service'
import { RuntimeCapsuleTestRunService } from '@/services/test-run/runtime-capsule-test-run-service'
import {
  createTestRunArtifactAccess,
  createTestRunArtifactContext,
} from '@/services/test-run/test-run-artifact-context'

import { appendPlanEvent } from './coordinator-service'
import {
  completeCoordinatorOperation,
  prepareCoordinatorOperation,
  readCoordinatorOperationResult,
  recordCoordinatorOperationOutcome,
} from './coordinator-operation-receipt-service'
import { assertValidationEnvironmentsReady } from './validation-canonical-projection-service'
import {
  preflightBaselineEnvironments,
  type EnvironmentRuntimePreflight,
} from './environment-runtime-preflight-service'

type BaselineOptions = {
  client?: PrismaClient
  projectDirectory?: string
  now?: Date
  submitRun?: (input: {
    planId: string
    validation: ValidationArtifact['validations'][number]
    browser: string
    environment: string
    preparationKey: string
    attemptOrdinal: number
  }) => Promise<{ testRunId: string }>
  loadEvidence?: (testRunId: string) => Promise<BaselineEvidence & { status: 'running' | 'completed' }>
  capsuleService?: RuntimeCapsuleTestRunService
  appraiseRoot?: string
  preflightEnvironments?: typeof preflightBaselineEnvironments
  idempotencyKey?: string
}

async function prepareBaselineOperation(
  operationName: string,
  planId: string,
  idempotencyKey: string,
  request: unknown,
  client: PrismaClient,
) {
  return prepareCoordinatorOperation(
    { operationName, scopeKey: planId, idempotencyKey, request, planId, recoverUnknown: true },
    client,
  )
}

async function completeBaselineOperation(
  operation: Awaited<ReturnType<typeof prepareBaselineOperation>>,
  result: unknown,
  client: PrismaClient,
) {
  await completeCoordinatorOperation(operation.receipt, result, client)
}

async function recordBaselineOperationFailure(
  operation: Awaited<ReturnType<typeof prepareBaselineOperation>>,
  planId: string,
  committedLifecycles: readonly PlanArtifact['lifecycle'][],
  options: BaselineOptions,
  client: PrismaClient,
) {
  const lifecycle = await readBaselineArtifacts(planId, options.projectDirectory, client)
    .then(result => result.plan.lifecycle)
    .catch(() => undefined)
  await recordCoordinatorOperationOutcome(
    operation.receipt,
    lifecycle && committedLifecycles.includes(lifecycle) ? 'unknown' : 'not_committed',
    client,
  ).catch(() => undefined)
}

export function baselineCapsulePreparationKey(input: {
  planId: string
  revision: number
  validationId: string
  browser: string
  environment: string
  attemptOrdinal: number
  publishOperationId: string
  publicationId?: string
  runtimeInputHash: string
}) {
  return `baseline:${input.planId}:${input.revision}:${input.publishOperationId}:${input.publicationId ?? 'legacy-unbound'}:${input.runtimeInputHash}:${input.validationId}:${input.browser}:${input.environment}:${input.attemptOrdinal}`
}

export async function readStoredJsonReport(reportPath: string | null | undefined) {
  return reportPath
    ? fs
        .readFile(resolveStoredPath(reportPath), 'utf8')
        .then(content => JSON.parse(content) as unknown)
        .catch(() => null)
    : null
}

// fallow-ignore-next-line code-duplication -- mirrors validation artifact loading so both gates use identical roots.
async function readBaselineArtifacts(planId: string, projectDirectory?: string, client: PrismaClient = prisma) {
  const projectRoot = await findProjectRoot(projectDirectory)
  const repository = new PlanArtifactRepository(projectRoot)
  const [planStored, validationStored, projection] = await Promise.all([
    repository.read('plan', planId),
    repository.read('validation', planId),
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
    validationStored,
    plan: parseYamlArtifact('plan', planStored.content) as PlanArtifact,
    validation: parseYamlArtifact('validation', validationStored.content) as ValidationArtifact,
  }
}

async function writeBaselineArtifacts(
  artifacts: Awaited<ReturnType<typeof readBaselineArtifacts>>,
  plan: PlanArtifact,
  validation: ValidationArtifact,
  client: PrismaClient,
) {
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
  await syncPlans({ projectDirectory: artifacts.projectRoot, client })
  await persistBaselineHistory(artifacts, plan, validation, client)
}

async function persistBaselineHistory(
  artifacts: Awaited<ReturnType<typeof readBaselineArtifacts>>,
  plan: PlanArtifact,
  validation: ValidationArtifact,
  client: PrismaClient,
) {
  const projection = await client.planProjection.findUniqueOrThrow({
    where: { planId: plan.planId },
    select: { id: true },
  })
  // fallow-ignore-next-line complexity
  await client.$transaction(async transaction => {
    const appendAttemptEvent = async (input: {
      attemptId: string
      kind: string
      idempotencyKey: string
      payloadJson: string
      createdAt?: Date
    }) => {
      const existing = await transaction.baselineAttemptEvent.findUnique({
        where: {
          attemptId_idempotencyKey: { attemptId: input.attemptId, idempotencyKey: input.idempotencyKey },
        },
      })
      if (existing) return existing
      const latest = await transaction.baselineAttemptEvent.findFirst({
        where: { attemptId: input.attemptId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      })
      return transaction.baselineAttemptEvent.create({
        data: { ...input, sequence: (latest?.sequence ?? 0) + 1 },
      })
    }
    const currentRequiredCombinations = new Set(requiredBaselineCombinations(validation).map(baselineCombinationKey))
    for (const attempt of validation.baselineAttempts) {
      const node = validation.validations.find(item => item.id === attempt.validationId)
      const publication =
        node?.astProvenance?.schemaVersion === '2'
          ? await transaction.validationNodePublication.findFirst({
              where: {
                planId: plan.planId,
                validationId: node.id,
                contentHash: validationNodeHash(node),
                publishOperationId: node.astProvenance.publishOperationId,
              },
              select: { id: true },
            })
          : null
      if (!publication)
        throw new ServiceError('Baseline evidence requires an exact immutable validation publication.', 'CONFLICT')
      const existingAttempt = await transaction.baselineAttempt.findUnique({
        where: { id: attempt.id },
        select: { publicationId: true },
      })
      if (
        existingAttempt &&
        existingAttempt.publicationId !== publication.id &&
        currentRequiredCombinations.has(baselineCombinationKey(attempt))
      )
        throw new ServiceError(
          'Existing baseline evidence lacks the exact immutable validation publication binding.',
          'CONFLICT',
        )
      if (existingAttempt && existingAttempt.publicationId !== publication.id) continue
      await transaction.baselineAttempt.upsert({
        where: { id: attempt.id },
        update: {},
        create: {
          id: attempt.id,
          planProjectionId: projection.id,
          validationId: attempt.validationId,
          validationRevision: plan.revision,
          validationHash: hashFileContent(serializeYamlArtifact('validation', validation)),
          browser: attempt.browser,
          environment: attempt.environment,
          testRunId: attempt.testRunId,
          evidenceJson: JSON.stringify(attempt.evidence),
          publicationId: publication.id,
          createdAt: new Date(attempt.createdAt),
        },
      })
      const state = {
        status: attempt.status,
        classification: attempt.classification,
        signatureHash: attempt.signatureHash,
        completedAt: attempt.completedAt,
      }
      await appendAttemptEvent({
        attemptId: attempt.id,
        kind: 'state_observed',
        idempotencyKey: `state:${JSON.stringify(state)}`,
        payloadJson: JSON.stringify(state),
      })
      if (attempt.regressionJustification) {
        await appendAttemptEvent({
          attemptId: attempt.id,
          kind: 'regression_justified',
          idempotencyKey: `regression_justification:${attempt.regressionJustification}`,
          payloadJson: JSON.stringify({ justification: attempt.regressionJustification }),
        })
      }
    }
    for (const acknowledgement of validation.baselineAcknowledgements) {
      await appendAttemptEvent({
        attemptId: acknowledgement.attemptId,
        kind: 'failure_acknowledged',
        idempotencyKey: `acknowledged:${acknowledgement.signatureHash}`,
        payloadJson: JSON.stringify(acknowledgement),
        createdAt: new Date(acknowledgement.acknowledgedAt),
      })
    }
  })
}

async function assertValidationFilesUnchanged(input: {
  projectRoot: string
  validationFileRoot: string
  targetProject: Awaited<ReturnType<typeof readBaselineArtifacts>>['targetProject']
  validation: ValidationArtifact
}) {
  const changedFiles: Array<{
    path: string
    resolvedAbsolutePath: string
    expectedHash: string | null
    currentHash: string | null
  }> = []
  const root = input.validationFileRoot
  for (const file of input.validation.files) {
    const absolutePath = path.resolve(root, file.path)
    const relative = path.relative(root, absolutePath)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new ServiceError(`Validation file path escapes the project: ${file.path}`, 'VALIDATION')
    }
    const content = await fs.readFile(absolutePath, 'utf8').catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    })
    const currentHash = content === null ? null : hashFileContent(content)
    if (currentHash !== file.contentHash) {
      changedFiles.push({
        path: file.path,
        resolvedAbsolutePath: absolutePath,
        expectedHash: file.contentHash,
        currentHash,
      })
    }
  }
  if (changedFiles.length > 0) {
    throw new ServiceError(
      `Validation files changed after approval or baseline execution: ${changedFiles.map(file => file.path).join(', ')}. Re-review is required.`,
      'CONFLICT',
      undefined,
      {
        changedFiles,
        targetProject: input.targetProject
          ? {
              id: input.targetProject.id,
              canonicalPath: input.targetProject.canonicalPath,
              displayName: input.targetProject.displayName,
              fingerprint: input.targetProject.fingerprint,
            }
          : null,
        hubProject: { canonicalPath: input.projectRoot },
        resolvedRoot: root,
      },
    )
  }
}

async function readRunningBaselineArtifacts(planId: string, options: BaselineOptions) {
  const client = options.client ?? prisma
  const artifacts = await readBaselineArtifacts(planId, options.projectDirectory, client)
  if (artifacts.plan.lifecycle !== 'baseline_running') {
    throw new ServiceError('The plan is not running baselines.', 'CONFLICT')
  }
  return { client, artifacts }
}

async function assertBaselineReady(
  artifacts: Awaited<ReturnType<typeof readBaselineArtifacts>>,
  client: PrismaClient,
): Promise<void> {
  await assertValidationFilesUnchanged(artifacts)
  await assertValidationEnvironmentsReady(artifacts.validation, client, artifacts.targetProject)
  const readiness = assessBaselineAcceptance(artifacts.validation)
  if (!readiness.ready) throw new ServiceError(readiness.blockers.join(' '), 'CONFLICT')
}

function browserEngine(browser: string): BrowserEngine {
  const value = browser.toUpperCase()
  if (value === 'CHROMIUM' || value === 'FIREFOX' || value === 'WEBKIT') return value as BrowserEngine
  throw new ServiceError(`Unsupported baseline browser "${browser}".`, 'VALIDATION')
}

function baselineStartResult(
  plan: PlanArtifact,
  validation: ValidationArtifact,
  reused: boolean,
  environmentPreflight: EnvironmentRuntimePreflight[] = [],
) {
  const activeAttempts = validation.baselineAttempts.filter(attempt =>
    ['scheduled', 'running', 'interrupted'].includes(attempt.status),
  )
  return {
    plan,
    validation,
    baselineExecution: {
      reused,
      lifecycle: plan.lifecycle,
      reconcileLegal: plan.lifecycle === 'baseline_running',
      attempts: activeAttempts.map(attempt => ({
        attemptId: attempt.id,
        testRunId: attempt.testRunId,
        validationId: attempt.validationId,
        browser: attempt.browser,
        environment: attempt.environment,
        status: attempt.status,
      })),
      environmentPreflight,
      nextAllowedAction: {
        tool: 'baseline_reconcile',
        reason: reused
          ? 'Reconcile the already active baseline attempt.'
          : 'Reconcile the newly started baseline attempt.',
      },
    },
  }
}

async function submitCapsuleTestRun(
  input: {
    planId: string
    targetProject: NonNullable<Awaited<ReturnType<typeof readBaselineArtifacts>>['targetProject']>
    validation: ValidationArtifact['validations'][number]
    browser: string
    environment: string
    preparationKey: string
    attemptOrdinal: number
  },
  client: PrismaClient,
  capsuleService: RuntimeCapsuleTestRunService,
): Promise<{ testRunId: string; start: () => Promise<unknown> }> {
  const provenance = input.validation.astProvenance
  if (provenance?.schemaVersion !== '2')
    throw new ServiceError('Reviewed AST baseline requires an exact managed publish operation.', 'CONFLICT')
  const operationId = provenance.publishOperationId
  const environment = await client.environment.findFirst({
    where: {
      targetProjectId: input.targetProject.id,
      OR: [{ id: input.environment }, { name: input.environment }],
    },
  })
  if (!environment) throw new ServiceError(`Environment "${input.environment}" was not found.`, 'VALIDATION')
  const request = {
    operationId,
    planId: input.planId,
    validationId: input.validation.id,
    targetProjectId: input.targetProject.id,
    environmentId: environment.id,
    name: `Baseline ${input.planId} ${input.validation.id} ${input.browser} ${input.environment} attempt ${input.attemptOrdinal + 1}`,
    browserEngine: browserEngine(input.browser),
    preparationKey: input.preparationKey,
  }
  const prepared = await capsuleService.prepare(request)
  return {
    testRunId: prepared.runId,
    start: () => capsuleService.start({ ...request, testRunDbId: prepared.id }),
  }
}

function isActiveTestRunStatus(status: TestRunStatus) {
  return [TestRunStatus.RUNNING, TestRunStatus.QUEUED, TestRunStatus.CANCELLING].includes(status)
}

function isInterruptedTestRun(run: {
  evidenceHealth: string
  runtimeCapsuleExecutionAttempt: { state: string; failure: string | null } | null
}) {
  return run.evidenceHealth === 'infrastructure_failure' || run.runtimeCapsuleExecutionAttempt?.state === 'INTERRUPTED'
}

async function loadAppraiseEvidence(testRunId: string, client: PrismaClient, appraiseRoot: string) {
  const run = await client.testRun.findUnique({
    where: { runId: testRunId },
    include: { testCases: true, runtimeCapsule: true, runtimeCapsuleExecutionAttempt: true },
  })
  if (!run) throw new ServiceError('Baseline test run not found.', 'NOT_FOUND')
  if (isActiveTestRunStatus(run.status)) {
    return {
      status: 'running' as const,
      result: 'interrupted' as const,
      evidenceHealth: 'infrastructure_failure' as const,
      blockers: [],
      failureSignatures: [],
      completedStepIds: [],
    }
  }
  const logs = await getTestRunLogsService(testRunId, undefined, appraiseRoot, client).catch(() => [])
  const logFailureSignatures = logs
    .filter(log => log.type === 'stderr')
    .map(log => log.message.trim())
    .filter(Boolean)
  if (isInterruptedTestRun(run)) {
    return {
      status: 'completed' as const,
      result: 'interrupted' as const,
      evidenceHealth: 'infrastructure_failure' as const,
      blockers: [],
      failureSignatures: [
        run.runtimeCapsuleExecutionAttempt?.failure?.trim() ||
          logFailureSignatures[0] ||
          'Runtime capsule execution was interrupted.',
      ],
      completedStepIds: [],
    }
  }
  const evidenceSummary = await summarizeRunEvidence(testRunId, client, appraiseRoot)
  if (evidenceSummary.evidenceHealth !== 'valid') {
    return invalidBaselineEvidence({
      evidenceHealth: evidenceSummary.evidenceHealth,
      blockers: evidenceSummary.blockers,
      logFailureSignatures,
      completedStepIds: [],
    })
  }
  const report = run.runtimeCapsule
    ? await createTestRunArtifactAccess(createTestRunArtifactContext(appraiseRoot), client)
        .readText({ runId: testRunId, kind: 'report' })
        .then(JSON.parse)
    : await readStoredJsonReport(run.reportPath)
  const reportEvidence = extractCucumberEvidence(report)
  return completedBaselineEvidence(run.result, evidenceSummary, reportEvidence, logFailureSignatures)
}

function completedBaselineEvidence(
  result: TestRunResult,
  evidenceSummary: Awaited<ReturnType<typeof summarizeRunEvidence>>,
  reportEvidence: ReturnType<typeof extractCucumberEvidence>,
  logFailureSignatures: string[],
): BaselineEvidence & { status: 'completed' } {
  const baselineResult: BaselineEvidence['result'] =
    result === TestRunResult.PASSED ? 'passed' : result === TestRunResult.CANCELLED ? 'cancelled' : 'failed'
  return {
    status: 'completed' as const,
    evidenceHealth: evidenceSummary.evidenceHealth,
    blockers: evidenceSummary.blockers,
    result: baselineResult,
    failureSignatures:
      reportEvidence.failureSignatures.length > 0 ? reportEvidence.failureSignatures : logFailureSignatures,
    completedStepIds: reportEvidence.completedStepIds,
  }
}

async function baselineRuntimeValidation(
  planId: string,
  artifacts: Awaited<ReturnType<typeof readBaselineArtifacts>>,
  client: PrismaClient,
) {
  void planId
  void client
  const invalid = artifacts.validation.validations.filter(validation => validation.astProvenance?.schemaVersion !== '2')
  if (invalid.length > 0)
    throw new ServiceError(
      `Managed baseline requires exact managed Validation AST provenance for every validation; invalid validations: ${invalid.map(item => item.id).join(', ')}.`,
      'CONFLICT',
    )
  return artifacts.validation
}

function invalidBaselineEvidence(input: {
  evidenceHealth: BaselineEvidence['evidenceHealth']
  blockers: string[]
  logFailureSignatures: string[]
  completedStepIds: string[]
}) {
  const evidenceFailureSignatures = input.blockers.length
    ? input.blockers
    : [`Evidence health is ${input.evidenceHealth}.`]
  return {
    status: 'completed' as const,
    result: 'failed' as const,
    evidenceHealth: input.evidenceHealth,
    blockers: input.blockers,
    failureSignatures:
      input.evidenceHealth === 'infrastructure_failure'
        ? [...evidenceFailureSignatures, ...input.logFailureSignatures]
        : evidenceFailureSignatures,
    completedStepIds: input.completedStepIds,
  }
}

type BaselineSubmitRun = (
  input: Parameters<NonNullable<BaselineOptions['submitRun']>>[0],
) => Promise<{ testRunId: string; start?: () => Promise<unknown> }>

async function prepareBaselineAttempts(input: {
  planId: string
  artifacts: Awaited<ReturnType<typeof readBaselineArtifacts>>
  runtimeValidation: ValidationArtifact
  submitRun: BaselineSubmitRun
  client: PrismaClient
  now: Date
}) {
  const active = new Set(
    input.runtimeValidation.baselineAttempts
      .filter(attempt => ['scheduled', 'running'].includes(attempt.status))
      .map(baselineCombinationKey),
  )
  const attempts = [...input.runtimeValidation.baselineAttempts]
  const pendingStarts: Array<() => Promise<unknown>> = []
  for (const combination of requiredBaselineCombinations(input.runtimeValidation)) {
    if (active.has(baselineCombinationKey(combination))) continue
    const validation = input.runtimeValidation.validations.find(item => item.id === combination.validationId)!
    const attemptOrdinal = input.runtimeValidation.baselineAttempts.filter(
      attempt => baselineCombinationKey(attempt) === baselineCombinationKey(combination),
    ).length
    const provenance = validation.astProvenance
    if (provenance?.schemaVersion !== '2')
      throw new ServiceError('Managed baseline requires exact managed Validation AST provenance.', 'CONFLICT')
    if (!input.artifacts.targetProject)
      throw new ServiceError('Reviewed AST baseline requires a registered target project.', 'CONFLICT')
    const publication = await input.client.validationNodePublication.findFirst({
      where: {
        planId: input.planId,
        targetProjectId: input.artifacts.targetProject.id,
        validationId: validation.id,
        contentHash: validationNodeHash(validation),
        publishOperationId: provenance.publishOperationId,
        runtimeInputHash: provenance.runtimeInputHash,
      },
      select: { id: true },
    })
    if (!publication)
      throw new ServiceError('Managed baseline requires an exact immutable validation publication.', 'CONFLICT')
    const preparationKey = baselineCapsulePreparationKey({
      planId: input.planId,
      revision: input.artifacts.plan.revision,
      validationId: combination.validationId,
      browser: combination.browser,
      environment: combination.environment,
      attemptOrdinal,
      publishOperationId: provenance.publishOperationId,
      publicationId: publication.id,
      runtimeInputHash: provenance.runtimeInputHash,
    })
    const submitted = await input.submitRun({
      planId: input.planId,
      validation,
      preparationKey,
      attemptOrdinal,
      ...combination,
    })
    if (submitted.start) pendingStarts.push(submitted.start)
    const evidenceLinks = testRunEvidenceLinks(submitted.testRunId, input.artifacts.targetProject.id)
    attempts.push({
      id: `baseline-${randomUUID()}`,
      ...combination,
      testRunId: submitted.testRunId,
      status: 'running',
      evidence: {
        logsUrl: evidenceLinks.logsUrl,
        reportUrl: evidenceLinks.reportUrl,
        traceUrls: [],
        screenshotUrls: [],
      },
      createdAt: input.now.toISOString(),
    })
  }
  return { attempts, pendingStarts }
}

export async function startBaselineExecution(planId: string, options: BaselineOptions = {}) {
  const client = options.client ?? prisma
  const artifacts = await readBaselineArtifacts(planId, options.projectDirectory, client)
  const operation = await prepareBaselineOperation(
    'baseline_start',
    planId,
    options.idempotencyKey ?? `internal:${randomUUID()}`,
    {},
    client,
  )
  try {
    if (artifacts.plan.lifecycle === 'baseline_running') {
      const result = baselineStartResult(artifacts.plan, artifacts.validation, true)
      await completeBaselineOperation(
        operation,
        { lifecycle: artifacts.plan.lifecycle, attemptIds: artifacts.validation.baselineAttempts.map(item => item.id) },
        client,
      )
      return result
    }
    if (!['validations_approved', 'baseline_changes_requested'].includes(artifacts.plan.lifecycle)) {
      throw new ServiceError('The plan is not ready for baseline execution.', 'CONFLICT')
    }
    const runtimeValidation = await baselineRuntimeValidation(planId, artifacts, client)
    if (!artifacts.targetProject)
      throw new ServiceError('Reviewed AST baseline requires a registered target project.', 'CONFLICT')
    const environmentPreflight = await (options.preflightEnvironments ?? preflightBaselineEnvironments)(
      runtimeValidation,
      artifacts.targetProject,
      client,
    )
    const capsuleService = options.capsuleService ?? new RuntimeCapsuleTestRunService(client)
    const submitRun =
      options.submitRun ??
      (async input => {
        if (!artifacts.targetProject)
          throw new ServiceError('Reviewed AST baseline requires a registered target project.', 'CONFLICT')
        return submitCapsuleTestRun({ targetProject: artifacts.targetProject, ...input }, client, capsuleService)
      })
    const { attempts, pendingStarts } = await prepareBaselineAttempts({
      planId,
      artifacts,
      runtimeValidation,
      submitRun,
      client,
      now: options.now ?? new Date(),
    })
    const plan = { ...artifacts.plan, lifecycle: 'baseline_running' as const }
    const validation = { ...runtimeValidation, baselineAttempts: attempts, baselineDecision: 'pending' as const }
    await writeBaselineArtifacts(artifacts, plan, validation, client)
    await appendPlanEvent({ planId, type: 'baseline_started', payload: { attempts: attempts.length } }, client)
    const startResults = await Promise.allSettled(pendingStarts.map(start => start()))
    if (startResults.some(result => result.status === 'rejected'))
      await appendPlanEvent(
        {
          planId,
          type: 'baseline_run_start_failed',
          payload: { failures: startResults.filter(result => result.status === 'rejected').length },
        },
        client,
      )
    const result = baselineStartResult(plan, validation, false, environmentPreflight)
    await completeBaselineOperation(
      operation,
      { lifecycle: plan.lifecycle, attemptIds: validation.baselineAttempts.map(item => item.id) },
      client,
    )
    return result
  } catch (error) {
    await recordBaselineOperationFailure(operation, planId, ['baseline_running'], options, client)
    throw error
  }
}

export async function reconcileBaselineExecution(planId: string, options: BaselineOptions = {}) {
  const client = options.client ?? prisma
  const operation = await prepareBaselineOperation(
    'baseline_reconcile',
    planId,
    options.idempotencyKey ?? `internal:${randomUUID()}`,
    {},
    client,
  )
  // fallow-ignore-next-line code-duplication
  if (operation.replay && operation.receipt.operationOutcome === 'committed')
    return readCoordinatorOperationResult<{
      plan: PlanArtifact
      validation: ValidationArtifact
      currentValidationHash: string
    }>(operation.receipt)!
  const { artifacts } = await readRunningBaselineArtifacts(planId, options)
  await assertValidationFilesUnchanged(artifacts)
  const startFailed = await client.planEvent.findFirst({
    where: { plan: { planId }, type: 'baseline_run_start_failed' },
    select: { id: true },
  })
  if (startFailed) {
    await client.testRun.updateMany({
      where: {
        runId: { in: artifacts.validation.baselineAttempts.map(attempt => attempt.testRunId) },
        status: TestRunStatus.QUEUED,
      },
      data: {
        status: TestRunStatus.COMPLETED,
        result: TestRunResult.FAILED,
        evidenceHealth: 'infrastructure_failure',
        completedAt: new Date(),
      },
    })
  }
  const loadEvidence =
    options.loadEvidence ??
    (testRunId =>
      loadAppraiseEvidence(testRunId, client, options.appraiseRoot ?? path.join(artifacts.projectRoot, '.appraise')))
  const attempts = await Promise.all(
    artifacts.validation.baselineAttempts.map(async attempt => {
      if (!['scheduled', 'running', 'interrupted'].includes(attempt.status)) return attempt
      const evidence = await loadEvidence(attempt.testRunId)
      if (evidence.status === 'running') return { ...attempt, status: 'running' as const }
      const validation = artifacts.validation.validations.find(item => item.id === attempt.validationId)!
      const classified = classifyBaselineResult(validation, attempt, evidence)
      return {
        ...attempt,
        status: evidence.result === 'cancelled' ? ('cancelled' as const) : ('completed' as const),
        classification: classified.classification,
        signatureHash: classified.signatureHash,
        completedAt: (options.now ?? new Date()).toISOString(),
      }
    }),
  )
  const requiredCombinationKeys = new Set(
    requiredBaselineCombinations(artifacts.validation).map(baselineCombinationKey),
  )
  const latestAttempts = new Map<string, (typeof attempts)[number]>()
  attempts.forEach(attempt => {
    const key = baselineCombinationKey(attempt)
    if (requiredCombinationKeys.has(key)) latestAttempts.set(key, attempt)
  })
  const stillRunning = [...latestAttempts.values()].some(attempt =>
    ['scheduled', 'running', 'interrupted'].includes(attempt.status),
  )
  const hasHarnessFailure = [...latestAttempts.values()].some(
    attempt => attempt.status === 'completed' && attempt.classification === 'authoring_failure',
  )
  const plan = {
    ...artifacts.plan,
    lifecycle: stillRunning
      ? ('baseline_running' as const)
      : hasHarnessFailure
        ? ('validation_changes_requested' as const)
        : ('baseline_review' as const),
  }
  const validation = {
    ...artifacts.validation,
    baselineAttempts: attempts,
    baselineDecision: hasHarnessFailure ? ('changes-requested' as const) : artifacts.validation.baselineDecision,
  }
  await writeBaselineArtifacts(artifacts, plan, validation, client)
  if (!stillRunning && hasHarnessFailure) {
    await appendPlanEvent(
      {
        planId,
        type: 'validation_changes_requested',
        payload: {
          scope: 'test_artifact',
          reason:
            'Baseline execution found a validation harness failure. Fix runtime step definitions, imports, Cucumber config, or browser/world setup before retrying validation review.',
        },
      },
      client,
    )
  } else if (!stillRunning) await appendPlanEvent({ planId, type: 'baseline_review_ready' }, client)
  const result = {
    plan,
    validation,
    currentValidationHash: hashFileContent(serializeYamlArtifact('validation', validation)),
  }
  await completeBaselineOperation(operation, result, client)
  return result
}

export async function cancelBaselineExecution(planId: string, options: BaselineOptions = {}) {
  const client = options.client ?? prisma
  const operation = await prepareBaselineOperation(
    'baseline_cancel',
    planId,
    options.idempotencyKey ?? `internal:${randomUUID()}`,
    {},
    client,
  )
  // fallow-ignore-next-line code-duplication
  if (operation.replay && operation.receipt.operationOutcome === 'committed')
    return readCoordinatorOperationResult<{ plan: PlanArtifact; validation: ValidationArtifact }>(operation.receipt)!
  const { artifacts } = await readRunningBaselineArtifacts(planId, options)
  const activeAttempts = artifacts.validation.baselineAttempts.filter(attempt =>
    ['scheduled', 'running'].includes(attempt.status),
  )
  const capsuleService = options.capsuleService ?? new RuntimeCapsuleTestRunService(client)
  await Promise.all(
    activeAttempts.map(async attempt => {
      const run = await client.testRun.findUnique({
        where: { runId: attempt.testRunId },
        select: { id: true, runtimeCapsuleExecutionAttempt: { select: { id: true } } },
      })
      if (!run?.runtimeCapsuleExecutionAttempt)
        throw new ServiceError('Managed baseline cancellation requires a capsule execution attempt.', 'CONFLICT')
      await capsuleService.cancel(run.id)
    }),
  )
  const completedAt = (options.now ?? new Date()).toISOString()
  const validation = {
    ...artifacts.validation,
    baselineAttempts: artifacts.validation.baselineAttempts.map(attempt =>
      activeAttempts.some(active => active.id === attempt.id)
        ? { ...attempt, status: 'cancelled' as const, completedAt }
        : attempt,
    ),
    baselineDecision: 'changes-requested' as const,
  }
  const plan = { ...artifacts.plan, lifecycle: 'baseline_changes_requested' as const }
  await writeBaselineArtifacts(artifacts, plan, validation, client)
  await appendPlanEvent({ planId, type: 'baseline_cancelled' }, client)
  const result = { plan, validation }
  await completeBaselineOperation(operation, result, client)
  return result
}

export async function acknowledgeBaselineFailure(
  input: { planId: string; attemptId: string; acknowledgedBy: string },
  options: BaselineOptions = {},
) {
  const client = options.client ?? prisma
  const operation = await prepareBaselineOperation(
    'baseline_failure_acknowledge',
    input.planId,
    options.idempotencyKey ?? `internal:${randomUUID()}`,
    input,
    client,
  )
  if (operation.replay && operation.receipt.operationOutcome === 'committed')
    return readCoordinatorOperationResult<{
      attemptId: string
      signatureHash: string
      acknowledgedBy: string
      acknowledgedAt: string
    }>(operation.receipt)!
  const { artifacts, attempt } = await readBaselineAttempt(input, options, client)
  if (
    !attempt?.classification ||
    !['expected_product_failure', 'unrelated_existing_failure'].includes(attempt.classification) ||
    !attempt.signatureHash
  ) {
    throw new ServiceError('Only current expected or unrelated baseline failures can be acknowledged.', 'CONFLICT')
  }
  const acknowledgement = {
    attemptId: attempt.id,
    signatureHash: attempt.signatureHash,
    acknowledgedBy: input.acknowledgedBy,
    acknowledgedAt: (options.now ?? new Date()).toISOString(),
  }
  const validation = {
    ...artifacts.validation,
    baselineAcknowledgements: [
      ...artifacts.validation.baselineAcknowledgements.filter(item => item.attemptId !== attempt.id),
      acknowledgement,
    ],
  }
  await writeBaselineArtifacts(artifacts, artifacts.plan, validation, client)
  await completeBaselineOperation(operation, acknowledgement, client)
  return acknowledgement
}

export async function justifyBaselineRegressionPass(
  input: { planId: string; attemptId: string; justification: string },
  options: BaselineOptions = {},
) {
  if (!input.justification.trim()) throw new ServiceError('Regression justification is required.', 'VALIDATION')
  const client = options.client ?? prisma
  const operation = await prepareBaselineOperation(
    'baseline_regression_justify',
    input.planId,
    options.idempotencyKey ?? `internal:${randomUUID()}`,
    input,
    client,
  )
  if (operation.replay && operation.receipt.operationOutcome === 'committed') return
  const { artifacts, attempt } = await readBaselineAttempt(input, options, client)
  if (attempt?.classification !== 'unexpected_pass') {
    throw new ServiceError('Only passing baselines accept regression justification.', 'CONFLICT')
  }
  const validation = {
    ...artifacts.validation,
    baselineAttempts: artifacts.validation.baselineAttempts.map(item =>
      item.id === attempt.id ? { ...item, regressionJustification: input.justification.trim() } : item,
    ),
  }
  await writeBaselineArtifacts(artifacts, artifacts.plan, validation, client)
  await completeBaselineOperation(operation, { acknowledged: true }, client)
}

async function readBaselineAttempt(
  input: { planId: string; attemptId: string },
  options: BaselineOptions,
  client: PrismaClient,
) {
  const artifacts = await readBaselineArtifacts(input.planId, options.projectDirectory, client)
  return {
    artifacts,
    attempt: artifacts.validation.baselineAttempts.find(item => item.id === input.attemptId),
  }
}

export async function retryBaselineAfterRepair(
  input: { planId: string; reason: string; expectedValidationHash: string },
  options: BaselineOptions = {},
) {
  if (!input.reason.trim()) throw new ServiceError('A baseline repair reason is required.', 'VALIDATION')
  const client = options.client ?? prisma
  const operation = await prepareBaselineOperation(
    'baseline_retry_after_repair',
    input.planId,
    options.idempotencyKey ?? `internal:${randomUUID()}`,
    input,
    client,
  )
  if (operation.replay && operation.receipt.operationOutcome === 'committed')
    return readCoordinatorOperationResult<{ plan: PlanArtifact; validation: ValidationArtifact }>(operation.receipt)!
  const artifacts = await readBaselineArtifacts(input.planId, options.projectDirectory, client)
  if (artifacts.validationStored.hash !== input.expectedValidationHash) {
    throw new ServiceError(
      'The validation artifact changed before baseline repair could be requested.',
      'CONFLICT',
      undefined,
      {
        expectedValidationHash: input.expectedValidationHash,
        currentValidationHash: artifacts.validationStored.hash,
        nextRecommendedAction: 'Read the current validation artifact and retry with its exact hash.',
      },
    )
  }
  const activeAttempts = artifacts.validation.baselineAttempts.filter(attempt =>
    ['scheduled', 'running', 'interrupted'].includes(attempt.status),
  )
  if (activeAttempts.length > 0) {
    throw new ServiceError(
      'Active baseline runs must finish or be cancelled before validation repair.',
      'CONFLICT',
      undefined,
      {
        activeAttemptIds: activeAttempts.map(attempt => attempt.id),
        nextRecommendedAction: 'Cancel or reconcile active baseline runs, then retry baseline repair.',
      },
    )
  }
  if (artifacts.plan.lifecycle === 'validation_changes_requested') {
    const result = { plan: artifacts.plan, validation: artifacts.validation }
    await completeBaselineOperation(operation, result, client)
    return result
  }
  if (artifacts.plan.lifecycle !== 'baseline_review') {
    throw new ServiceError('Only baseline review evidence can be returned for validation repair.', 'CONFLICT')
  }
  const hasRepairableEvidence = artifacts.validation.baselineAttempts.some(
    attempt =>
      attempt.status === 'completed' &&
      ['authoring_failure', 'unrelated_existing_failure'].includes(attempt.classification ?? ''),
  )
  if (!hasRepairableEvidence) {
    throw new ServiceError(
      'Baseline repair is only available when current evidence requires validation changes.',
      'CONFLICT',
    )
  }
  const plan = { ...artifacts.plan, lifecycle: 'validation_changes_requested' as const }
  const validation = {
    ...artifacts.validation,
    approvals: [],
    validationDecisions: [],
    runtimeProjections: undefined,
    runtimePreflight: undefined,
    reviewSubmittedAt: undefined,
    baselineDecision: 'changes-requested' as const,
  }
  await writeBaselineArtifacts(artifacts, plan, validation, client)
  await appendPlanEvent(
    {
      planId: input.planId,
      type: 'validation_changes_requested',
      payload: { scope: 'test_artifact', reason: input.reason.trim(), preservedBaselineAttempts: true },
    },
    client,
  )
  const result = { plan, validation }
  await completeBaselineOperation(operation, result, client)
  return result
}

export async function acceptBaseline(planId: string, options: BaselineOptions = {}) {
  const client = options.client ?? prisma
  const artifacts = await readBaselineArtifacts(planId, options.projectDirectory, client)
  const operation = await prepareBaselineOperation(
    'baseline_accept',
    planId,
    options.idempotencyKey ?? `internal:${randomUUID()}`,
    {},
    client,
  )
  try {
    if (operation.replay && operation.receipt.operationOutcome === 'committed') {
      return { plan: artifacts.plan, validation: artifacts.validation }
    }
    if (artifacts.plan.lifecycle !== 'baseline_review') {
      throw new ServiceError('The plan is not awaiting baseline acceptance.', 'CONFLICT')
    }
    await assertBaselineReady(artifacts, client)
    const plan = { ...artifacts.plan, lifecycle: 'baseline_accepted' as const }
    const validation = { ...artifacts.validation, baselineDecision: 'accepted' as const }
    await writeBaselineArtifacts(artifacts, plan, validation, client)
    await appendPlanEvent({ planId, type: 'baseline_accepted' }, client)
    await completeBaselineOperation(
      operation,
      { lifecycle: plan.lifecycle, validationHash: artifacts.validationStored.hash },
      client,
    )
    return { plan, validation }
  } catch (error) {
    await recordBaselineOperationFailure(operation, planId, ['baseline_accepted'], options, client)
    throw error
  }
}

export async function startImplementation(planId: string, options: BaselineOptions = {}) {
  const client = options.client ?? prisma
  const artifacts = await readBaselineArtifacts(planId, options.projectDirectory, client)
  const operation = await prepareBaselineOperation(
    'implementation_start',
    planId,
    options.idempotencyKey ?? `internal:${randomUUID()}`,
    {},
    client,
  )
  try {
    if (operation.replay && operation.receipt.operationOutcome === 'committed') return artifacts.plan
    if (artifacts.plan.lifecycle !== 'baseline_accepted' || artifacts.validation.baselineDecision !== 'accepted') {
      throw new ServiceError('Accepted baselines are required before implementation.', 'CONFLICT')
    }
    await assertBaselineReady(artifacts, client)
    const plan = { ...artifacts.plan, lifecycle: 'in_progress' as const }
    await writeBaselineArtifacts(artifacts, plan, artifacts.validation, client)
    await appendPlanEvent({ planId, type: 'implementation_started', payload: { revision: plan.revision } }, client)
    await completeBaselineOperation(operation, { lifecycle: plan.lifecycle, revision: plan.revision }, client)
    return plan
  } catch (error) {
    await recordBaselineOperationFailure(operation, planId, ['in_progress'], options, client)
    throw error
  }
}
