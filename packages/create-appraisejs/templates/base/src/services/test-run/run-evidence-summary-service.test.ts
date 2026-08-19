import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TagType, TestRunResult, TestRunStatus, TestRunTestCaseStatus } from '@prisma/client'

const { mockTestRunFindUnique, mockTestRunUpdate, mockParseCucumberReport, mockReadTestRunArtifactText } = vi.hoisted(
  () => ({
    mockTestRunFindUnique: vi.fn(),
    mockTestRunUpdate: vi.fn(),
    mockParseCucumberReport: vi.fn(),
    mockReadTestRunArtifactText: vi.fn(),
  }),
)

vi.mock('@/config/db-config', () => ({
  default: {
    testRun: {
      findUnique: mockTestRunFindUnique,
      update: mockTestRunUpdate,
    },
  },
}))

vi.mock('@/lib/test-run/report-parser', () => ({
  parseCucumberReportText: mockParseCucumberReport,
}))

vi.mock('@/services/test-run/test-run-artifact-context', () => ({
  createTestRunArtifactAccess: vi.fn(),
  createTestRunArtifactContext: vi.fn(),
  readTestRunArtifactText: mockReadTestRunArtifactText,
}))

import { persistRunEvidenceHealth, summarizeRunEvidence } from './run-evidence-summary-service'

function baseRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-db-id',
    runId: '11111111-1111-4111-8111-111111111111',
    status: TestRunStatus.COMPLETED,
    result: TestRunResult.PASSED,
    reportPath: 'reports/cucumber.json',
    runtimeCapsule: { id: 'capsule-1' },
    targetProjectId: 'project one',
    targetProject: {},
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
    mockReadTestRunArtifactText.mockReset()
    mockReadTestRunArtifactText.mockResolvedValue('{}')
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

  it('treats an in-progress report as pending instead of a missing-artifact blocker', async () => {
    mockTestRunFindUnique.mockResolvedValue(
      baseRun({ status: TestRunStatus.RUNNING, result: TestRunResult.PENDING, reportPath: null }),
    )

    const summary = await summarizeRunEvidence('11111111-1111-4111-8111-111111111111')

    expect(summary).toMatchObject({ grade: 'pending', blockers: [], missingArtifacts: [] })
  })

  it('classifies empty Cucumber reports as invalid empty run', async () => {
    mockTestRunFindUnique.mockResolvedValue(baseRun())
    mockParseCucumberReport.mockReturnValue({ features: [] })

    const summary = await summarizeRunEvidence('11111111-1111-4111-8111-111111111111')

    expect(summary.evidenceHealth).toBe('invalid_empty_run')
    expect(summary.counts.scenarios).toBe(0)
  })

  it('detects unmatched scenarios against expected test cases', async () => {
    mockTestRunFindUnique.mockResolvedValue(baseRun({ testCases: [expectedTestCase()] }))
    mockParseCucumberReport.mockReturnValue(reportWithScenario('Unexpected scenario', []))

    const summary = await summarizeRunEvidence('11111111-1111-4111-8111-111111111111')

    expect(summary.evidenceHealth).toBe('invalid_unmatched_scenarios')
    expect(summary.counts.unmatchedScenarios).toBe(1)
  })

  it('persists valid health only after report and expected cases reconcile', async () => {
    mockTestRunFindUnique.mockResolvedValue(baseRun({ testCases: [expectedTestCase()] }))
    mockParseCucumberReport.mockReturnValue(reportWithScenario())

    const summary = await persistRunEvidenceHealth('11111111-1111-4111-8111-111111111111')

    expect(summary.evidenceHealth).toBe('valid')
    expect(mockTestRunUpdate).toHaveBeenCalledWith({
      where: { runId: '11111111-1111-4111-8111-111111111111' },
      data: { evidenceHealth: 'valid' },
    })
  })

  it('projects only sanitized human-verification facts for a blocked run', async () => {
    mockTestRunFindUnique.mockResolvedValue(
      baseRun({
        result: TestRunResult.BLOCKED,
        logs: {
          logs: '[2026-08-14T00:00:00.000Z] [STDOUT] {"event":"appraise.runtime.blocked/v1","data":{"reason":"human_verification_required","detectorVersion":"captcha-structural/v1","provider":"recaptcha","pageOrigin":"https://example.test","frameOrigin":"https://www.google.com","signatureId":"iframe:recaptcha","checkpoint":"before_operation","step":{"id":"step.open","version":"1"},"operation":"browser.navigation.goto@1","observedAt":"2026-08-14T00:00:00.000Z","token":"never-project-this"}}',
        },
      }),
    )
    mockParseCucumberReport.mockReturnValue(reportWithScenario())

    const summary = await summarizeRunEvidence('11111111-1111-4111-8111-111111111111')

    expect(summary).toMatchObject({
      status: TestRunStatus.COMPLETED,
      result: TestRunResult.BLOCKED,
      humanVerification: {
        reason: 'human_verification_required',
        provider: 'recaptcha',
        pageOrigin: 'https://example.test',
        frameOrigin: 'https://www.google.com',
        signatureId: 'iframe:recaptcha',
        checkpoint: 'before_operation',
        step: { id: 'step.open', version: '1' },
        operation: 'browser.navigation.goto@1',
        observedAt: '2026-08-14T00:00:00.000Z',
      },
      nextAllowedAction: { tool: 'test_run_read' },
    })
    expect(JSON.stringify(summary.humanVerification)).not.toContain('never-project-this')
  })

  it('reports authored steps separately from runtime hooks', async () => {
    mockTestRunFindUnique.mockResolvedValue(baseRun({ testCases: [expectedTestCase()] }))
    mockParseCucumberReport.mockReturnValue(
      reportWithScenario('Login succeeds', [{ name: '@tc_login', line: 1 }], [{ name: 'Before' }, { name: 'After' }]),
    )

    const summary = await summarizeRunEvidence('11111111-1111-4111-8111-111111111111')

    expect(summary.counts).toMatchObject({ steps: 1, hooks: 2 })
  })

  it('returns bounded first-line failure signatures from the report', async () => {
    mockTestRunFindUnique.mockResolvedValue(baseRun({ testCases: [expectedTestCase()] }))
    const report = reportWithScenario()
    report.features[0]!.scenarios[0]!.steps = [
      {
        name: 'open app',
        status: 'failed',
        errorMessage: `Expected HomeChores but found SecondWife\n${'stack detail '.repeat(40)}`,
      },
    ] as never
    mockParseCucumberReport.mockReturnValue(report)

    const summary = await summarizeRunEvidence('11111111-1111-4111-8111-111111111111')

    expect(summary.failureSignatures).toEqual(['Expected HomeChores but found SecondWife'])
  })
})
