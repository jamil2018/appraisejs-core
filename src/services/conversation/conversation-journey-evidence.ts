import type { PrismaClient, StepStatus, TestRunResult, TestRunStatus } from '@prisma/client'

import prisma from '@/config/db-config'
import { qualityJourneyIdentifierSchema } from '@/lib/quality-journey'
import { hashRuntimeCapsuleValue } from '@/lib/runtime-capsule'
import { reportStepEvidenceHref, reportStepScreenshotHref } from '@/lib/report-step-evidence'
import { ServiceError } from '@/services/shared/errors'

import { getLatestConversationJourney } from './conversation-service'

type Scope = { targetProjectId: string; conversationId: string; journeyId: string }
type Outcome = 'PASSED' | 'FAILED' | 'SKIPPED' | 'UNVERIFIED'
type UnverifiedReason =
  | 'RUN_IN_PROGRESS'
  | 'RUN_CANCELLED'
  | 'EVIDENCE_MISSING'
  | 'EVIDENCE_INVALID'
  | 'REPORT_MISSING'
  | 'REPORT_AMBIGUOUS'
  | 'REPORT_INCOMPLETE'
  | 'OUTCOME_UNCORROBORATED'

export type ConversationJourneyEvidenceStep = {
  id: string
  label: string
  status: StepStatus
  errorMessage: string | null
  reportHref: string
  screenshotHref?: string
}

export type ConversationJourneyEvidenceRun = {
  executionCycleId: string
  testRunId: string
  runId: string
  status: TestRunStatus
  result: TestRunResult
  title: string | null
  outcome: Outcome
  reason: UnverifiedReason | null
  evidenceReceiptId: string | null
  receiptHash: string | null
  reportId: string | null
  reportHref: string | null
  steps: ConversationJourneyEvidenceStep[]
}

type SealedEvidence = {
  journeyId: string
  targetProjectId: string
  executionCycleId: string
  cycleId: string
  preparedCapsuleId: string
  preparedCapsulesHash: string
  testRunId: string
  runId: string
  status: TestRunStatus
  result: TestRunResult
  evidenceHealth: string
  artifacts: Array<{ kind: string; reportStepId?: string; contentHash: string; size: number }>
  missingArtifacts: string[]
}

const maxRuns = 100
const maxSteps = 512
const maxReceiptBytes = 256_000

function readSeal(raw: string, hash: string): SealedEvidence | null {
  if (Buffer.byteLength(raw, 'utf8') > maxReceiptBytes) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    if (hashRuntimeCapsuleValue(parsed) !== hash) return null
    const evidence = parsed as SealedEvidence
    if (
      !Array.isArray(evidence.artifacts) ||
      !evidence.artifacts.every(
        artifact =>
          artifact &&
          typeof artifact === 'object' &&
          typeof artifact.kind === 'string' &&
          typeof artifact.contentHash === 'string' &&
          Number.isSafeInteger(artifact.size) &&
          artifact.size >= 0,
      ) ||
      !Array.isArray(evidence.missingArtifacts) ||
      !evidence.missingArtifacts.every(item => typeof item === 'string')
    )
      return null
    return evidence
  } catch {
    return null
  }
}

function unverified(run: Omit<ConversationJourneyEvidenceRun, 'outcome' | 'reason'>, reason: UnverifiedReason) {
  return { ...run, outcome: 'UNVERIFIED' as const, reason }
}

/** Read-only observed evidence for the Journey currently attached to this saved project chat. */
export async function readConversationJourneyEvidence(input: Scope, client: PrismaClient = prisma) {
  qualityJourneyIdentifierSchema.parse(input.targetProjectId)
  qualityJourneyIdentifierSchema.parse(input.journeyId)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.conversationId))
    throw new ServiceError('Conversation id is invalid.', 'VALIDATION', 400)
  if ((await getLatestConversationJourney(input, client)) !== input.journeyId)
    throw new ServiceError('This Journey is no longer linked to the saved chat.', 'CONFLICT', 409)
  const journey = await client.qualityJourney.findFirst({
    where: { id: input.journeyId, targetProjectId: input.targetProjectId },
    select: {
      executionCycles: {
        where: { targetProjectId: input.targetProjectId },
        select: { id: true },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: 1,
      },
    },
  })
  if (!journey) throw new ServiceError('Quality Journey target scope was not found.', 'NOT_FOUND', 404)
  const latestCycleId = journey.executionCycles[0]?.id ?? null
  if (!latestCycleId) return { latestCycleId, runs: [] }

  const bindings = await client.qualityJourneyExecutionTestRun.findMany({
    where: { executionCycleId: latestCycleId },
    select: {
      executionCycleId: true,
      preparedCapsuleId: true,
      testRunId: true,
      runId: true,
      executionCycle: { select: { cycleId: true, preparedCapsulesHash: true } },
      testRun: {
        select: {
          status: true,
          result: true,
          evidenceHealth: true,
          targetProjectId: true,
          intent: true,
          runId: true,
          testCases: { select: { id: true, testCaseId: true }, take: 2 },
          qualityJourneyExecutionEvidence: {
            select: { id: true, executionCycleId: true, testRunId: true, receiptHash: true, evidenceJson: true },
          },
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: maxRuns,
  })
  const testRunIds = bindings.map(binding => binding.testRunId)
  const reports = testRunIds.length
    ? await client.report.findMany({
        where: { testRunId: { in: testRunIds }, targetProjectId: input.targetProjectId },
        select: {
          id: true,
          testRunId: true,
          testCases: { select: { reportScenarioId: true, testRunTestCaseId: true, testCaseId: true }, take: 2 },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: maxRuns + 1,
      })
    : []
  const steps = reports.length
    ? await client.reportStep.findMany({
        where: { reportScenario: { reportFeature: { reportId: { in: reports.map(report => report.id) } } } },
        select: {
          id: true,
          keyword: true,
          name: true,
          status: true,
          errorMessage: true,
          screenshotPath: true,
          order: true,
          reportScenario: { select: { id: true, name: true, reportFeature: { select: { reportId: true } } } },
        },
        orderBy: [{ createdAt: 'asc' }, { order: 'asc' }, { id: 'asc' }],
        take: maxSteps + 1,
      })
    : []
  const stepsTruncated = steps.length > maxSteps

  const runs = bindings.map(binding => {
    const observed = binding.testRun
    const receipt = observed.qualityJourneyExecutionEvidence
    const reportMatches = reports.filter(report => report.testRunId === binding.testRunId)
    const report = reportMatches.length === 1 ? reportMatches[0]! : null
    const runCase = observed.testCases.length === 1 ? observed.testCases[0]! : null
    const reportCase =
      report &&
      report.testCases.length === 1 &&
      runCase &&
      report.testCases[0]?.testRunTestCaseId === runCase.id &&
      report.testCases[0]?.testCaseId === runCase.testCaseId
        ? report.testCases[0]
        : null
    const reportSteps =
      report && reportCase?.reportScenarioId
        ? steps.filter(
            step =>
              step.reportScenario.id === reportCase.reportScenarioId &&
              step.reportScenario.reportFeature.reportId === report.id,
          )
        : []
    const evidence = receipt ? readSeal(receipt.evidenceJson, receipt.receiptHash) : null
    const screenshotIds = new Set(
      evidence?.artifacts.filter(artifact => artifact.kind === 'screenshot').map(artifact => artifact.reportStepId) ??
        [],
    )
    const linkedSteps: ConversationJourneyEvidenceStep[] =
      report && evidence
        ? reportSteps.map(step => ({
            id: step.id,
            label: `${step.keyword} ${step.name}`,
            status: step.status,
            errorMessage: step.errorMessage?.slice(0, 2_000) ?? null,
            reportHref: reportStepEvidenceHref(input.targetProjectId, report.id, step.id),
            ...(step.screenshotPath && screenshotIds.has(step.id)
              ? { screenshotHref: reportStepScreenshotHref(input.targetProjectId, step.id) }
              : {}),
          }))
        : []
    const base = {
      executionCycleId: binding.executionCycleId,
      testRunId: binding.testRunId,
      runId: binding.runId,
      status: observed.status,
      result: observed.result,
      title: reportSteps[0]?.reportScenario.name ?? null,
      evidenceReceiptId: receipt?.id ?? null,
      receiptHash: receipt?.receiptHash ?? null,
      reportId: report?.id ?? null,
      reportHref: report
        ? `/reports/${encodeURIComponent(report.id)}?project=${encodeURIComponent(input.targetProjectId)}`
        : null,
      steps: linkedSteps,
    }
    if (observed.status === 'CANCELLED') return unverified(base, 'RUN_CANCELLED')
    if (observed.status !== 'COMPLETED') return unverified(base, 'RUN_IN_PROGRESS')
    if (!receipt) return unverified(base, 'EVIDENCE_MISSING')
    if (
      !evidence ||
      receipt.executionCycleId !== binding.executionCycleId ||
      receipt.testRunId !== binding.testRunId ||
      evidence.journeyId !== input.journeyId ||
      evidence.targetProjectId !== input.targetProjectId ||
      evidence.executionCycleId !== binding.executionCycleId ||
      evidence.cycleId !== binding.executionCycle.cycleId ||
      evidence.preparedCapsuleId !== binding.preparedCapsuleId ||
      evidence.preparedCapsulesHash !== binding.executionCycle.preparedCapsulesHash ||
      evidence.testRunId !== binding.testRunId ||
      evidence.runId !== binding.runId ||
      observed.runId !== binding.runId ||
      observed.targetProjectId !== input.targetProjectId ||
      observed.intent !== 'QUALITY_JOURNEY' ||
      evidence.status !== observed.status ||
      evidence.result !== observed.result ||
      evidence.evidenceHealth !== observed.evidenceHealth
    )
      return unverified({ ...base, steps: [] }, 'EVIDENCE_INVALID')
    if (!reportMatches.length) return unverified(base, 'REPORT_MISSING')
    if (!report || reports.length > maxRuns) return unverified({ ...base, steps: [] }, 'REPORT_AMBIGUOUS')
    if (
      stepsTruncated ||
      !reportCase ||
      !reportSteps.length ||
      !evidence.artifacts.some(artifact => artifact.kind === 'report') ||
      evidence.missingArtifacts.includes('report')
    )
      return unverified({ ...base, steps: [] }, 'REPORT_INCOMPLETE')
    if (
      observed.result === 'FAILED' &&
      observed.evidenceHealth === 'valid' &&
      reportSteps.some(step => step.status === 'FAILED')
    )
      return { ...base, outcome: 'FAILED' as const, reason: null }
    if (
      observed.result === 'PASSED' &&
      observed.evidenceHealth === 'valid' &&
      reportSteps.every(step => step.status === 'PASSED')
    )
      return { ...base, outcome: 'PASSED' as const, reason: null }
    if (
      observed.result === 'BLOCKED' &&
      observed.evidenceHealth === 'valid' &&
      reportSteps.some(step => step.status === 'SKIPPED') &&
      reportSteps.every(step => step.status === 'SKIPPED' || step.status === 'PASSED')
    )
      return { ...base, outcome: 'SKIPPED' as const, reason: null }
    return unverified(base, 'OUTCOME_UNCORROBORATED')
  })
  return { latestCycleId, runs }
}
