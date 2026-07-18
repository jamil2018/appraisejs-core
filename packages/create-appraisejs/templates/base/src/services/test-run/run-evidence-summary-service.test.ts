import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TagType, TestRunResult, TestRunStatus, TestRunTestCaseStatus } from '@prisma/client'

const { mockTestRunFindUnique, mockTestRunUpdate, mockParseCucumberReport } = vi.hoisted(() => ({
  mockTestRunFindUnique: vi.fn(),
  mockTestRunUpdate: vi.fn(),
  mockParseCucumberReport: vi.fn(),
}))

vi.mock('@/config/db-config', () => ({
  default: {
    testRun: {
      findUnique: mockTestRunFindUnique,
      update: mockTestRunUpdate,
    },
  },
}))

vi.mock('@/lib/automation/automation-path-roots', () => ({
  resolveStoredPath: vi.fn((storedPath: string) => `/resolved/${storedPath}`),
}))

vi.mock('@/lib/test-run/report-parser', () => ({
  parseCucumberReport: mockParseCucumberReport,
}))

import { persistRunEvidenceHealth, preflightTestRun, summarizeRunEvidence } from './run-evidence-summary-service'

function baseRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-db-id',
    runId: '11111111-1111-4111-8111-111111111111',
    planId: null,
    status: TestRunStatus.COMPLETED,
    result: TestRunResult.PASSED,
    reportPath: 'reports/cucumber.json',
    targetProjectId: 'project one',
    targetProject: { canonicalPath: '/workspace/app' },
    logs: { logs: 'status: Process exited with code 0' },
    testCases: [],
    ...overrides,
  }
}

function reportWithScenario(
  name = 'Login succeeds',
  tags = [{ name: '@tc_login', line: 1 }],
  hooks: Array<{ name: string }> = [],
) {
  return {
    features: [
      {
        name: 'Authentication',
        scenarios: [
          {
            name,
            tags,
            steps: [{ name: 'open app' }],
            hooks,
          },
        ],
      },
    ],
  }
}

function expectedTestCase() {
  return {
    id: 'run-case-1',
    status: TestRunTestCaseStatus.PENDING,
    testCaseId: 'case-1',
    testSuiteId: 'suite-1',
    testCase: {
      id: 'case-1',
      title: 'Login succeeds',
      tags: [{ name: 'tc_login', tagExpression: '@tc_login', type: TagType.IDENTIFIER }],
    },
    testSuite: {
      id: 'suite-1',
      name: 'Authentication',
      tags: [{ name: 'ts_auth', tagExpression: '@ts_auth', type: TagType.IDENTIFIER }],
    },
  }
}

describe('run evidence summary service', () => {
  beforeEach(() => {
    mockTestRunFindUnique.mockReset()
    mockTestRunUpdate.mockReset()
    mockParseCucumberReport.mockReset()
  })

  it('classifies completed runs without a report as invalid missing report', async () => {
    mockTestRunFindUnique.mockResolvedValue(baseRun({ reportPath: null }))

    const summary = await summarizeRunEvidence('11111111-1111-4111-8111-111111111111')

    expect(summary.evidenceHealth).toBe('invalid_missing_report')
    expect(summary.grade).toBe('invalid')
    expect(summary.nextAllowedAction.tool).toBe('test_run_diagnose')
    expect(summary).toMatchObject({
      testRunPageId: '11111111-1111-4111-8111-111111111111',
      executionRunId: '11111111-1111-4111-8111-111111111111',
      reportUrl: '/test-runs/11111111-1111-4111-8111-111111111111?project=project%20one',
      logsUrl: '/api/test-runs/11111111-1111-4111-8111-111111111111/logs?targetProjectId=project%20one',
    })
  })

  it('classifies empty Cucumber reports as invalid empty run', async () => {
    mockTestRunFindUnique.mockResolvedValue(baseRun())
    mockParseCucumberReport.mockResolvedValue({ features: [] })

    const summary = await summarizeRunEvidence('11111111-1111-4111-8111-111111111111')

    expect(summary.evidenceHealth).toBe('invalid_empty_run')
    expect(summary.counts.scenarios).toBe(0)
  })

  it('requires expected cases for plan-bound runs', async () => {
    mockTestRunFindUnique.mockResolvedValue(baseRun({ planId: 'plan-1' }))
    mockParseCucumberReport.mockResolvedValue(reportWithScenario())

    const summary = await summarizeRunEvidence('11111111-1111-4111-8111-111111111111')

    expect(summary.evidenceHealth).toBe('invalid_missing_test_cases')
  })

  it('detects unmatched scenarios against expected test cases', async () => {
    mockTestRunFindUnique.mockResolvedValue(baseRun({ planId: 'plan-1', testCases: [expectedTestCase()] }))
    mockParseCucumberReport.mockResolvedValue(reportWithScenario('Unexpected scenario', []))

    const summary = await summarizeRunEvidence('11111111-1111-4111-8111-111111111111')

    expect(summary.evidenceHealth).toBe('invalid_unmatched_scenarios')
    expect(summary.counts.unmatchedScenarios).toBe(1)
  })

  it('persists valid health only after report and expected cases reconcile', async () => {
    mockTestRunFindUnique.mockResolvedValue(baseRun({ planId: 'plan-1', testCases: [expectedTestCase()] }))
    mockParseCucumberReport.mockResolvedValue(reportWithScenario())

    const summary = await persistRunEvidenceHealth('11111111-1111-4111-8111-111111111111')

    expect(summary.evidenceHealth).toBe('valid')
    expect(mockTestRunUpdate).toHaveBeenCalledWith({
      where: { runId: '11111111-1111-4111-8111-111111111111' },
      data: { evidenceHealth: 'valid' },
    })
  })

  it('reports authored steps separately from runtime hooks', async () => {
    mockTestRunFindUnique.mockResolvedValue(baseRun({ planId: 'plan-1', testCases: [expectedTestCase()] }))
    mockParseCucumberReport.mockResolvedValue(
      reportWithScenario('Login succeeds', [{ name: '@tc_login', line: 1 }], [{ name: 'Before' }, { name: 'After' }]),
    )

    const summary = await summarizeRunEvidence('11111111-1111-4111-8111-111111111111')

    expect(summary.counts).toMatchObject({ steps: 1, hooks: 2 })
  })

  it('preflights plan-bound run inputs before creation', async () => {
    await expect(preflightTestRun({ planId: 'plan-1', target: '/app', environmentId: 'env-1' })).resolves.toMatchObject(
      {
        status: 'blocked',
        evidenceHealth: 'invalid_stale_runtime',
        nextAllowedAction: { tool: 'test_run_preflight' },
      },
    )
  })
})
