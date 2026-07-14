import prisma from '@/config/db-config'
import { resolveStoredPath } from '@/lib/automation/automation-path-roots'
import { findMatchingTestRunTestCase } from '@/lib/test-run/matching'
import { parseCucumberReport, parseCucumberReportText, type ParsedReport } from '@/lib/test-run/report-parser'
import { ServiceError } from '@/services/shared/errors'
import {
  createTestRunArtifactAccess,
  createTestRunArtifactContext,
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
  planId: string | null
  validationId?: string | null
  reportUrl: string
  logsUrl: string
  evidenceHealth: TestRunEvidenceHealthValue
  grade: RunEvidenceGrade
  nextAllowedAction: {
    tool: 'test_run_read' | 'test_run_diagnose' | 'test_run_preflight' | 'implementation_validation_reconcile'
    reason: string
  }
  counts: {
    expectedTestCases: number
    features: number
    scenarios: number
    steps: number
    matchedScenarios: number
    unmatchedScenarios: number
    unexecutedExpectedTestCases: number
  }
  blockers: string[]
  missingArtifacts: string[]
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
  return scenarios.reduce((total, scenario) => total + scenario.steps.length + scenario.hooks.length, 0)
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
  }

  if (hasPlaceholderBinary(logExcerpt)) {
    blockers.push('The run appears to have used a placeholder or fallback Cucumber binary.')
    return { evidenceHealth: 'invalid_placeholder_binary' as const, blockers, missingArtifacts, counts }
  }

  if (report.features.length === 0 || scenarios.length === 0 || counts.steps === 0) {
    blockers.push('The Cucumber report contains no executable feature, scenario, or step evidence.')
    return { evidenceHealth: 'invalid_empty_run' as const, blockers, missingArtifacts, counts }
  }

  if (testRun.planId && testRun.testCases.length === 0) {
    blockers.push('The plan-bound run has no expected TestRunTestCase rows to reconcile.')
    return { evidenceHealth: 'invalid_missing_test_cases' as const, blockers, missingArtifacts, counts }
  }

  if (classifyExpectedCaseEvidence(testRun, scenarios, counts)) {
    blockers.push('The Cucumber report scenarios do not match the expected test cases for this run.')
    return { evidenceHealth: 'invalid_unmatched_scenarios' as const, blockers, missingArtifacts, counts }
  }

  return { evidenceHealth: 'valid' as const, blockers, missingArtifacts, counts }
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
): RunEvidenceSummary {
  const completed = testRun.status === TestRunStatus.COMPLETED || testRun.status === TestRunStatus.CANCELLED
  const grade: RunEvidenceGrade =
    !completed || testRun.result === TestRunResult.PENDING
      ? 'pending'
      : classification.evidenceHealth === 'valid'
        ? 'valid'
        : classification.evidenceHealth === 'infrastructure_failure'
          ? 'infrastructure_failure'
          : 'invalid'
  if (!testRun.targetProjectId)
    throw new ServiceError('Test run evidence has no target-project ownership.', 'CONFLICT', 409)
  const links = testRunEvidenceLinks(testRun.runId, testRun.targetProjectId)

  return {
    testRunPageId: testRun.runId,
    executionRunId: testRun.runId,
    planId: testRun.planId,
    reportUrl: links.reportUrl,
    logsUrl: links.logsUrl,
    evidenceHealth: classification.evidenceHealth,
    grade,
    nextAllowedAction:
      grade === 'valid'
        ? { tool: 'implementation_validation_reconcile', reason: 'Valid managed evidence can be reconciled.' }
        : grade === 'pending'
          ? { tool: 'test_run_read', reason: 'The run is still in progress or awaiting final reconciliation.' }
          : { tool: 'test_run_diagnose', reason: 'Evidence is invalid or infrastructure failed.' },
    counts: classification.counts,
    blockers: classification.blockers,
    missingArtifacts: classification.missingArtifacts,
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
    missingArtifacts.push('cucumber.json')
    blockers.push('No Cucumber JSON report path was recorded for this test run.')
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
    const report = testRun.runtimeCapsule
      ? parseCucumberReportText(
          await createTestRunArtifactAccess(
            createTestRunArtifactContext(appraiseRoot),
            client as PrismaClient,
          ).readText({ runId, kind: 'report' }),
        )
      : await parseCucumberReport(resolveStoredPath(testRun.reportPath, testRun.targetProject?.canonicalPath))
    return summaryFromClassification(testRun, classifyReportEvidence(testRun, report, logExcerpt), logExcerpt)
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

export async function diagnoseRunEvidence(
  runId: string,
  client: EvidenceClient = prisma,
  appraiseRoot = path.join(process.cwd(), '.appraise'),
) {
  const summary = await summarizeRunEvidence(runId, client, appraiseRoot)
  return {
    ...summary,
    rootCause: summary.blockers[0] ?? 'No evidence-health blockers were detected.',
    missingArtifacts: summary.missingArtifacts,
    nextAction: summary.nextAllowedAction,
  }
}

export async function preflightTestRun(input: {
  target?: string
  environmentId?: string
  planId?: string
  validationId?: string
  featurePaths?: string[]
  importPaths?: string[]
  supportPaths?: string[]
}) {
  const blockers: string[] = []
  const warnings: string[] = []

  if (input.planId && !input.validationId) {
    blockers.push(
      'Plan-bound test runs must include validationId so evidence can be reconciled to the approved validation.',
    )
  }

  if (!input.environmentId) {
    blockers.push('environmentId is required before Appraise can create a managed test run.')
  }

  if (!input.target) {
    blockers.push('target is required so Appraise can resolve the target project root.')
  }

  if (input.planId && (!input.featurePaths?.length || !input.importPaths?.length)) {
    blockers.push('Plan-bound runs should use featurePaths and importPaths from the approved runtime projection.')
  }

  if (!input.supportPaths?.length) {
    warnings.push(
      'No supportPaths were provided. This is allowed only when the runtime projection does not require support imports.',
    )
  }

  return {
    status: blockers.length ? 'blocked' : 'ready',
    evidenceHealth: blockers.length ? ('invalid_stale_runtime' as const) : ('valid' as const),
    blockers,
    warnings,
    nextAllowedAction: blockers.length
      ? { tool: 'test_run_preflight' as const, reason: 'Resolve blockers before creating the run.' }
      : { tool: 'test_run' as const, reason: 'Preflight blockers are clear.' },
  }
}
