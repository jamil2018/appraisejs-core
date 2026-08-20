import prisma from '@/config/db-config'
import { findMatchingTestRunTestCase } from '@/lib/test-run/matching'
import { findHumanVerificationEvent, type HumanVerificationEvent } from '@/lib/test-run/human-verification-event'
import { parseCucumberReportText, type ParsedReport } from '@/lib/test-run/report-parser'
import { ServiceError } from '@/services/shared/errors'
import {
  createTestRunArtifactAccess,
  createTestRunArtifactContext,
  readTestRunArtifactText,
} from '@/services/test-run/test-run-artifact-context'
import { TestRunResult, TestRunStatus, type PrismaClient } from '@prisma/client'
import path from 'path'
import { testRunEvidenceLinks } from './test-run-evidence-links'

export type TestRunEvidenceHealthValue =
  | 'valid'
  | 'invalid_empty_run'
  | 'invalid_missing_test_cases'
  | 'invalid_missing_report'
  | 'invalid_placeholder_binary'
  | 'invalid_unmatched_scenarios'
  | 'invalid_stale_runtime'
  | 'infrastructure_failure'
export type RunEvidenceGrade = 'valid' | 'invalid' | 'infrastructure_failure' | 'pending'

export type RunEvidenceSummary = {
  testRunPageId: string
  executionRunId: string
  status: TestRunStatus
  result: TestRunResult
  humanVerification: HumanVerificationEvent | null
  reportUrl: string
  logsUrl: string
  evidenceHealth: TestRunEvidenceHealthValue
  grade: RunEvidenceGrade
  nextAllowedAction: {
    tool: 'test_run_read' | 'test_run_diagnose' | 'test_run_start'
    reason: string
  }
  counts: {
    expectedTestCases: number
    features: number
    scenarios: number
    steps: number
    hooks: number
    matchedScenarios: number
    unmatchedScenarios: number
    unexecutedExpectedTestCases: number
  }
  blockers: string[]
  missingArtifacts: string[]
  failureSignatures: string[]
  logExcerpt: string[]
  completed: boolean
}
type EvidenceClient = Pick<PrismaClient, 'testRun' | 'testRunLog'>

type TestRunForEvidence = NonNullable<Awaited<ReturnType<typeof loadTestRunForEvidence>>>
type ScenarioForEvidence = ParsedReport['features'][number]['scenarios'][number]

const INFRASTRUCTURE_FAILURE_PATTERN =
  /(browser executable|playwright.*install|browser.*not found|failed to launch|eacces|permission denied|address already in use|connection refused|timed? out|timeout|cannot find module|failed to import|syntaxerror|ts-node|cucumber config|beforeall|beforeeach|world setup|infrastructure)/i

const PLACEHOLDER_BINARY_PATTERN =
  /(npx cucumber-js|could not determine executable|placeholder package|appraise placeholder)/i

function emptyCounts(): RunEvidenceSummary['counts'] {
  return {
    expectedTestCases: 0,
    features: 0,
    scenarios: 0,
    steps: 0,
    hooks: 0,
    matchedScenarios: 0,
    unmatchedScenarios: 0,
    unexecutedExpectedTestCases: 0,
  }
}

function tailExcerpt(logs: string | null | undefined) {
  if (!logs) return []
  return logs
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(-20)
}

function flattenScenarios(report: ParsedReport): ScenarioForEvidence[] {
  return report.features.flatMap(feature => feature.scenarios)
}

function countSteps(scenarios: ScenarioForEvidence[]) {
  return scenarios.reduce((total, scenario) => total + scenario.steps.length, 0)
}

function countHooks(scenarios: ScenarioForEvidence[]) {
  return scenarios.reduce((total, scenario) => total + scenario.hooks.length, 0)
}

function failureSignatures(report: ParsedReport) {
  const signatures = flattenScenarios(report).flatMap(scenario =>
    [...scenario.steps, ...scenario.hooks]
      .filter(item => item.status?.toLowerCase() === 'failed' && item.errorMessage)
      .map(item => item.errorMessage!.trim().split(/\r?\n/, 1)[0]!.slice(0, 256)),
  )
  return [...new Set(signatures)].slice(0, 16)
}

function hasInfrastructureFailure(logExcerpt: string[]) {
  return logExcerpt.some(line => INFRASTRUCTURE_FAILURE_PATTERN.test(line))
}

function hasPlaceholderBinary(logExcerpt: string[]) {
  return logExcerpt.some(line => PLACEHOLDER_BINARY_PATTERN.test(line))
}

function reconcileScenarioMatches(testRun: TestRunForEvidence, scenarios: ScenarioForEvidence[]) {
  const matchedExpectedIds = new Set<string>()
  let unmatchedScenarios = 0

  for (const scenario of scenarios) {
    const match = findMatchingTestRunTestCase(testRun.testCases, {
      scenarioName: scenario.name,
      scenarioTags: scenario.tags.map(tag => tag.name),
    })
    if (match) {
      matchedExpectedIds.add(match.id)
    } else {
      unmatchedScenarios += 1
    }
  }

  return {
    matchedScenarios: matchedExpectedIds.size,
    unmatchedScenarios,
    unexecutedExpectedTestCases: Math.max(testRun.testCases.length - matchedExpectedIds.size, 0),
  }
}

function classifyExpectedCaseEvidence(
  testRun: TestRunForEvidence,
  scenarios: ScenarioForEvidence[],
  counts: RunEvidenceSummary['counts'],
) {
  if (testRun.testCases.length === 0) {
    return null
  }

  const scenarioMatchCounts = reconcileScenarioMatches(testRun, scenarios)

  counts.matchedScenarios = scenarioMatchCounts.matchedScenarios
  counts.unmatchedScenarios = scenarioMatchCounts.unmatchedScenarios
  counts.unexecutedExpectedTestCases = scenarioMatchCounts.unexecutedExpectedTestCases

  return counts.unmatchedScenarios > 0 || counts.unexecutedExpectedTestCases > 0 ? 'invalid_unmatched_scenarios' : null
}

async function loadTestRunForEvidence(runId: string, client: EvidenceClient = prisma) {
  return client.testRun.findUnique({
    where: { runId },
    include: {
      targetProject: true,
      runtimeCapsule: true,
      testCases: {
        include: {
          testCase: {
            include: {
              tags: true,
            },
          },
          testSuite: {
            include: {
              tags: true,
            },
          },
        },
      },
      logs: true,
    },
  })
}

function classifyReportEvidence(testRun: TestRunForEvidence, report: ParsedReport, logExcerpt: string[]) {
  const blockers: string[] = []
  const missingArtifacts: string[] = []
  const scenarios = flattenScenarios(report)
  const counts: RunEvidenceSummary['counts'] = {
    ...emptyCounts(),
    expectedTestCases: testRun.testCases.length,
    features: report.features.length,
    scenarios: scenarios.length,
    steps: countSteps(scenarios),
    hooks: countHooks(scenarios),
  }

  if (hasPlaceholderBinary(logExcerpt)) {
    blockers.push('The run appears to have used a placeholder or fallback Cucumber binary.')
    return { evidenceHealth: 'invalid_placeholder_binary' as const, blockers, missingArtifacts, counts }
  }

  if (report.features.length === 0 || scenarios.length === 0 || counts.steps === 0) {
    blockers.push('The Cucumber report contains no executable feature, scenario, or step evidence.')
    return { evidenceHealth: 'invalid_empty_run' as const, blockers, missingArtifacts, counts }
  }

  if (classifyExpectedCaseEvidence(testRun, scenarios, counts)) {
    blockers.push('The Cucumber report scenarios do not match the expected test cases for this run.')
    return { evidenceHealth: 'invalid_unmatched_scenarios' as const, blockers, missingArtifacts, counts }
  }

  return { evidenceHealth: 'valid' as const, blockers, missingArtifacts, counts }
}

function evidenceGrade(testRun: TestRunForEvidence, evidenceHealth: TestRunEvidenceHealthValue): RunEvidenceGrade {
  const completed = testRun.status === TestRunStatus.COMPLETED || testRun.status === TestRunStatus.CANCELLED
  if (!completed || testRun.result === TestRunResult.PENDING) return 'pending'
  if (evidenceHealth === 'valid') return 'valid'
  return evidenceHealth === 'infrastructure_failure' ? 'infrastructure_failure' : 'invalid'
}

function nextEvidenceAction(grade: RunEvidenceGrade, humanVerification: HumanVerificationEvent | null) {
  if (humanVerification)
    return {
      tool: 'test_run_read' as const,
      reason:
        'Human verification stopped this terminal run. Clear the challenge outside AppraiseJS, then start a fresh TestRun.',
    }
  if (grade === 'valid')
    return { tool: 'test_run_read' as const, reason: 'Valid run evidence is available for its owning assessment.' }
  if (grade === 'pending')
    return { tool: 'test_run_read' as const, reason: 'The run is still in progress or awaiting final reconciliation.' }
  return { tool: 'test_run_diagnose' as const, reason: 'Evidence is invalid or infrastructure failed.' }
}

function summaryFromClassification(
  testRun: TestRunForEvidence,
  classification: {
    evidenceHealth: TestRunEvidenceHealthValue
    blockers: string[]
    missingArtifacts: string[]
    counts: RunEvidenceSummary['counts']
  },
  logExcerpt: string[],
  failures: string[] = [],
): RunEvidenceSummary {
  const completed = testRun.status === TestRunStatus.COMPLETED || testRun.status === TestRunStatus.CANCELLED
  const grade = evidenceGrade(testRun, classification.evidenceHealth)
  if (!testRun.targetProjectId)
    throw new ServiceError('Test run evidence has no target-project ownership.', 'CONFLICT', 409)
  const links = testRunEvidenceLinks(testRun.runId, testRun.targetProjectId)
  const humanVerification = findHumanVerificationEvent(testRun.logs?.logs)

  return {
    testRunPageId: testRun.runId,
    executionRunId: testRun.runId,
    status: testRun.status,
    result: testRun.result,
    humanVerification,
    reportUrl: links.reportUrl,
    logsUrl: links.logsUrl,
    evidenceHealth: classification.evidenceHealth,
    grade,
    nextAllowedAction: nextEvidenceAction(grade, humanVerification),
    counts: classification.counts,
    blockers: classification.blockers,
    missingArtifacts: classification.missingArtifacts,
    failureSignatures: failures,
    logExcerpt,
    completed,
  }
}

export async function summarizeRunEvidence(
  runId: string,
  client: EvidenceClient = prisma,
  appraiseRoot = path.join(process.cwd(), '.appraise'),
): Promise<RunEvidenceSummary> {
  const testRun = await loadTestRunForEvidence(runId, client)
  if (!testRun) {
    throw new ServiceError('Test run not found.', 'NOT_FOUND', 404)
  }

  const logExcerpt = tailExcerpt(testRun.logs?.logs)
  const missingArtifacts: string[] = []
  const blockers: string[] = []

  if (hasPlaceholderBinary(logExcerpt)) {
    blockers.push('The run appears to have used a placeholder or fallback Cucumber binary.')
    return summaryFromClassification(
      testRun,
      { evidenceHealth: 'invalid_placeholder_binary', blockers, missingArtifacts, counts: emptyCounts() },
      logExcerpt,
    )
  }

  if (!testRun.reportPath) {
    const completed = testRun.status === TestRunStatus.COMPLETED || testRun.status === TestRunStatus.CANCELLED
    if (completed) {
      missingArtifacts.push('cucumber.json')
      blockers.push('No Cucumber JSON report path was recorded for this test run.')
    }
    return summaryFromClassification(
      testRun,
      {
        evidenceHealth: hasInfrastructureFailure(logExcerpt) ? 'infrastructure_failure' : 'invalid_missing_report',
        blockers,
        missingArtifacts,
        counts: { ...emptyCounts(), expectedTestCases: testRun.testCases.length },
      },
      logExcerpt,
    )
  }

  try {
    if (!testRun.runtimeCapsule) throw new ServiceError('TestRun has no immutable runtime capsule.', 'CONFLICT', 409)
    const report = parseCucumberReportText(
      await readTestRunArtifactText(
        createTestRunArtifactAccess(createTestRunArtifactContext(appraiseRoot), client as PrismaClient),
        { runId, kind: 'report' },
      ),
    )
    return summaryFromClassification(
      testRun,
      classifyReportEvidence(testRun, report, logExcerpt),
      logExcerpt,
      failureSignatures(report),
    )
  } catch (error) {
    missingArtifacts.push(testRun.reportPath)
    blockers.push(
      `The Cucumber JSON report could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
    )
    return summaryFromClassification(
      testRun,
      {
        evidenceHealth: hasInfrastructureFailure(logExcerpt) ? 'infrastructure_failure' : 'invalid_missing_report',
        blockers,
        missingArtifacts,
        counts: { ...emptyCounts(), expectedTestCases: testRun.testCases.length },
      },
      logExcerpt,
    )
  }
}

export async function persistRunEvidenceHealth(
  runId: string,
  client: EvidenceClient = prisma,
  expectedStatus?: TestRunStatus,
  appraiseRoot?: string,
): Promise<RunEvidenceSummary> {
  const summary = await summarizeRunEvidence(runId, client, appraiseRoot)
  if (expectedStatus && 'updateMany' in client.testRun) {
    await client.testRun.updateMany({
      where: { runId, status: expectedStatus },
      data: { evidenceHealth: summary.evidenceHealth },
    })
  } else {
    await client.testRun.update({
      where: { runId },
      data: { evidenceHealth: summary.evidenceHealth },
    })
  }
  return summary
}
