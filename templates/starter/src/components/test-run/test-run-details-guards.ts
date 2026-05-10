import type { Environment, Report, Tag } from '@prisma/client'

import type { ActionResponseData } from '@/types/form/actionHandler'

import type { TestRunDetailsData, TestRunDetailsTestCase } from './test-run-details-types'

function isTagRow(value: unknown): value is Tag {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value
}

function isEnvironmentRow(value: unknown): value is Environment {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value
}

function isReportRow(value: unknown): value is Report {
  return typeof value === 'object' && value !== null && 'id' in value && 'testRunId' in value
}

function isTestCaseInfo(value: unknown): value is TestRunDetailsTestCase['testCase'] {
  return typeof value === 'object' && value !== null && 'title' in value && 'description' in value
}

function isTestSuiteInfo(value: unknown): value is TestRunDetailsTestCase['testSuite'] {
  return value === null || (typeof value === 'object' && value !== null && 'id' in value && 'name' in value)
}

function isTestRunDetailsTestCase(value: unknown): value is TestRunDetailsTestCase {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'status' in value &&
    'result' in value &&
    'tracePath' in value &&
    'testCase' in value &&
    isTestCaseInfo(value.testCase) &&
    'testSuite' in value &&
    isTestSuiteInfo(value.testSuite)
  )
}

function isTestRunDetailsData(value: unknown): value is TestRunDetailsData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'runId' in value &&
    'status' in value &&
    'result' in value &&
    'startedAt' in value &&
    value.startedAt instanceof Date &&
    'completedAt' in value &&
    (value.completedAt instanceof Date || value.completedAt === null) &&
    'browserEngine' in value &&
    'testWorkersCount' in value &&
    'testCases' in value &&
    Array.isArray(value.testCases) &&
    value.testCases.every(isTestRunDetailsTestCase) &&
    'tags' in value &&
    Array.isArray(value.tags) &&
    value.tags.every(isTagRow) &&
    'environment' in value &&
    isEnvironmentRow(value.environment) &&
    'reports' in value &&
    Array.isArray(value.reports) &&
    value.reports.every(isReportRow)
  )
}

function isTraceViewerStatusData(value: unknown): value is { isRunning: boolean } {
  return typeof value === 'object' && value !== null && 'isRunning' in value && typeof value.isRunning === 'boolean'
}

export function getTestRunDetailsData(data: ActionResponseData | undefined) {
  return isTestRunDetailsData(data) ? data : null
}

export function getTraceViewerStatusData(data: ActionResponseData | undefined) {
  return isTraceViewerStatusData(data) ? data : null
}
