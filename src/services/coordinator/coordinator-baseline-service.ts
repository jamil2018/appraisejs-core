import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { BrowserEngine, TestRunResult, TestRunStatus, type PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import type { TestRun as TestRunFormValue } from '@/constants/form-opts/test-run-form-opts'
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
import { ServiceError } from '@/services/shared/errors'
import {
  cancelTestRunService,
  createTestRunFromValidatedValue,
  getTestRunLogsService,
} from '@/services/test-run/test-run-service'

import { appendPlanEvent } from './coordinator-service'

type BaselineOptions = {
  client?: PrismaClient
  projectDirectory?: string
  now?: Date
  submitRun?: (input: {
    planId: string
    validation: ValidationArtifact['validations'][number]
    browser: string
    environment: string
  }) => Promise<{ testRunId: string }>
  loadEvidence?: (testRunId: string) => Promise<BaselineEvidence & { status: 'running' | 'completed' }>
}

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

async function assertBaselineReady(artifacts: Awaited<ReturnType<typeof readBaselineArtifacts>>): Promise<void> {
  await assertValidationFilesUnchanged(artifacts)
  const readiness = assessBaselineAcceptance(artifacts.validation)
  if (!readiness.ready) throw new ServiceError(readiness.blockers.join(' '), 'CONFLICT')
}

function browserEngine(browser: string): BrowserEngine {
  const value = browser.toUpperCase()
  if (value === 'CHROMIUM' || value === 'FIREFOX' || value === 'WEBKIT') return value as BrowserEngine
  throw new ServiceError(`Unsupported baseline browser "${browser}".`, 'VALIDATION')
}

async function submitAppraiseTestRun(
  input: {
    planId: string
    validation: ValidationArtifact['validations'][number]
    browser: string
    environment: string
  },
  client: PrismaClient,
): Promise<{ testRunId: string }> {
  const environment = await client.environment.findUnique({ where: { name: input.environment } })
  if (!environment) throw new ServiceError(`Environment "${input.environment}" was not found.`, 'VALIDATION')
  const testCases = await client.testCase.findMany({
    where: { id: { in: input.validation.testCaseIds } },
    select: { id: true, TestSuite: { select: { id: true } } },
  })
  if (testCases.length !== input.validation.testCaseIds.length) {
    throw new ServiceError('One or more baseline test cases were not found.', 'VALIDATION')
  }
  const suites = new Map<string, string[]>()
  for (const testCase of testCases) {
    const suiteId = testCase.TestSuite[0]?.id
    if (!suiteId) throw new ServiceError(`Test case "${testCase.id}" is not assigned to a suite.`, 'VALIDATION')
    suites.set(suiteId, [...(suites.get(suiteId) ?? []), testCase.id])
  }
  const value: TestRunFormValue = {
    name: `Baseline ${input.planId} ${input.validation.id} ${input.browser} ${input.environment} ${randomUUID()}`,
    environmentId: environment.id,
    browserEngine: browserEngine(input.browser),
    testWorkersCount: 1,
    tags: [],
    testSuites: [...suites].map(([testSuiteId, testCaseIds]) => ({ testSuiteId, runAll: false, testCaseIds })),
  }
  const created = await createTestRunFromValidatedValue(value)
  await client.testRun.update({ where: { id: created.id }, data: { planId: input.planId } })
  return { testRunId: created.runId }
}

async function loadAppraiseEvidence(testRunId: string, client: PrismaClient) {
  const run = await client.testRun.findUnique({
    where: { runId: testRunId },
    include: { testCases: true },
  })
  if (!run) throw new ServiceError('Baseline test run not found.', 'NOT_FOUND')
  if (
    run.status === TestRunStatus.RUNNING ||
    run.status === TestRunStatus.QUEUED ||
    run.status === TestRunStatus.CANCELLING
  ) {
    return { status: 'running' as const, result: 'interrupted' as const, failureSignatures: [], completedStepIds: [] }
  }
  const logs = await getTestRunLogsService(testRunId).catch(() => [])
  const logFailureSignatures = logs
    .filter(log => log.type === 'stderr')
    .map(log => log.message.trim())
    .filter(Boolean)
  const report = run.reportPath
    ? await fs
        .readFile(resolveStoredPath(run.reportPath), 'utf8')
        .then(content => JSON.parse(content) as unknown)
        .catch(() => null)
    : null
  const reportEvidence = extractCucumberEvidence(report)
  return {
    status: 'completed' as const,
    result:
      run.result === TestRunResult.PASSED
        ? ('passed' as const)
        : run.result === TestRunResult.CANCELLED
          ? ('cancelled' as const)
          : ('failed' as const),
    failureSignatures:
      reportEvidence.failureSignatures.length > 0 ? reportEvidence.failureSignatures : logFailureSignatures,
    completedStepIds: reportEvidence.completedStepIds,
  }
}

export async function startBaselineExecution(planId: string, options: BaselineOptions = {}) {
  const client = options.client ?? prisma
  const artifacts = await readBaselineArtifacts(planId, options.projectDirectory, client)
  if (!['validations_approved', 'baseline_changes_requested'].includes(artifacts.plan.lifecycle)) {
    throw new ServiceError('The plan is not ready for baseline execution.', 'CONFLICT')
  }
  await assertValidationFilesUnchanged(artifacts)
  const active = new Set(
    artifacts.validation.baselineAttempts
      .filter(attempt => ['scheduled', 'running'].includes(attempt.status))
      .map(baselineCombinationKey),
  )
  const submitRun = options.submitRun ?? (input => submitAppraiseTestRun(input, client))
  const attempts = [...artifacts.validation.baselineAttempts]
  for (const combination of requiredBaselineCombinations(artifacts.validation)) {
    if (active.has(baselineCombinationKey(combination))) continue
    const validation = artifacts.validation.validations.find(item => item.id === combination.validationId)!
    const { testRunId } = await submitRun({ planId, validation, ...combination })
    attempts.push({
      id: `baseline-${randomUUID()}`,
      ...combination,
      testRunId,
      status: 'running',
      evidence: {
        logsUrl: `/api/test-runs/${testRunId}/logs`,
        reportUrl: `/test-runs/${testRunId}`,
        traceUrls: [],
        screenshotUrls: [],
      },
      createdAt: (options.now ?? new Date()).toISOString(),
    })
  }
  const plan = { ...artifacts.plan, lifecycle: 'baseline_running' as const }
  const validation = { ...artifacts.validation, baselineAttempts: attempts, baselineDecision: 'pending' as const }
  await writeBaselineArtifacts(artifacts, plan, validation, client)
  await appendPlanEvent({ planId, type: 'baseline_started', payload: { attempts: attempts.length } }, client)
  return { plan, validation }
}

export async function reconcileBaselineExecution(planId: string, options: BaselineOptions = {}) {
  const { client, artifacts } = await readRunningBaselineArtifacts(planId, options)
  await assertValidationFilesUnchanged(artifacts)
  const loadEvidence = options.loadEvidence ?? (testRunId => loadAppraiseEvidence(testRunId, client))
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
  const stillRunning = attempts.some(attempt => ['scheduled', 'running', 'interrupted'].includes(attempt.status))
  const plan = {
    ...artifacts.plan,
    lifecycle: stillRunning ? ('baseline_running' as const) : ('baseline_review' as const),
  }
  const validation = { ...artifacts.validation, baselineAttempts: attempts }
  await writeBaselineArtifacts(artifacts, plan, validation, client)
  if (!stillRunning) await appendPlanEvent({ planId, type: 'baseline_review_ready' }, client)
  return { plan, validation }
}

export async function cancelBaselineExecution(planId: string, options: BaselineOptions = {}) {
  const { client, artifacts } = await readRunningBaselineArtifacts(planId, options)
  const activeAttempts = artifacts.validation.baselineAttempts.filter(attempt =>
    ['scheduled', 'running'].includes(attempt.status),
  )
  await Promise.all(activeAttempts.map(attempt => cancelTestRunService(attempt.testRunId)))
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
  return { plan, validation }
}

export async function acknowledgeBaselineFailure(
  input: { planId: string; attemptId: string; acknowledgedBy: string },
  options: BaselineOptions = {},
) {
  const client = options.client ?? prisma
  const artifacts = await readBaselineArtifacts(input.planId, options.projectDirectory, client)
  const attempt = artifacts.validation.baselineAttempts.find(item => item.id === input.attemptId)
  if (attempt?.classification !== 'pre_existing_unrelated_failure' || !attempt.signatureHash) {
    throw new ServiceError('Only current unrelated failures can be acknowledged.', 'CONFLICT')
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
  return acknowledgement
}

export async function justifyBaselineRegressionPass(
  input: { planId: string; attemptId: string; justification: string },
  options: BaselineOptions = {},
) {
  if (!input.justification.trim()) throw new ServiceError('Regression justification is required.', 'VALIDATION')
  const client = options.client ?? prisma
  const artifacts = await readBaselineArtifacts(input.planId, options.projectDirectory, client)
  const attempt = artifacts.validation.baselineAttempts.find(item => item.id === input.attemptId)
  if (attempt?.classification !== 'accepted_regression_pass') {
    throw new ServiceError('Only passing baselines accept regression justification.', 'CONFLICT')
  }
  const validation = {
    ...artifacts.validation,
    baselineAttempts: artifacts.validation.baselineAttempts.map(item =>
      item.id === attempt.id ? { ...item, regressionJustification: input.justification.trim() } : item,
    ),
  }
  await writeBaselineArtifacts(artifacts, artifacts.plan, validation, client)
}

export async function acceptBaseline(planId: string, options: BaselineOptions = {}) {
  const client = options.client ?? prisma
  const artifacts = await readBaselineArtifacts(planId, options.projectDirectory, client)
  if (artifacts.plan.lifecycle !== 'baseline_review') {
    throw new ServiceError('The plan is not awaiting baseline acceptance.', 'CONFLICT')
  }
  await assertBaselineReady(artifacts)
  const plan = { ...artifacts.plan, lifecycle: 'baseline_accepted' as const }
  const validation = { ...artifacts.validation, baselineDecision: 'accepted' as const }
  await writeBaselineArtifacts(artifacts, plan, validation, client)
  await appendPlanEvent({ planId, type: 'baseline_accepted' }, client)
  return { plan, validation }
}

export async function startImplementation(planId: string, options: BaselineOptions = {}) {
  const client = options.client ?? prisma
  const artifacts = await readBaselineArtifacts(planId, options.projectDirectory, client)
  if (artifacts.plan.lifecycle !== 'baseline_accepted' || artifacts.validation.baselineDecision !== 'accepted') {
    throw new ServiceError('Accepted baselines are required before implementation.', 'CONFLICT')
  }
  await assertBaselineReady(artifacts)
  const plan = { ...artifacts.plan, lifecycle: 'in_progress' as const }
  await writeBaselineArtifacts(artifacts, plan, artifacts.validation, client)
  await appendPlanEvent({ planId, type: 'implementation_started', payload: { revision: plan.revision } }, client)
  return plan
}
