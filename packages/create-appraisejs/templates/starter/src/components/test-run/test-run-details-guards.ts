import type { Environment, Report, Tag } from '@prisma/client'

import type { ActionResponseData } from '@/types/form/actionHandler'

import type { TestRunDetailsData, TestRunDetailsTestCase } from './test-run-details-types'

type UnknownRecord = Record<string, unknown>

function isObjectRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null
}

function hasFields(value: UnknownRecord, fields: string[]) {
  return fields.every(field => field in value)
}

function isTagRow(value: unknown): value is Tag {
  return isObjectRecord(value) && hasFields(value, ['id', 'name'])
}

function isEnvironmentRow(value: unknown): value is Environment {
  return isObjectRecord(value) && hasFields(value, ['id', 'name'])
}

function isReportRow(value: unknown): value is Report {
  return isObjectRecord(value) && hasFields(value, ['id', 'testRunId'])
}

function isTestCaseInfo(value: unknown): value is TestRunDetailsTestCase['testCase'] {
  return isObjectRecord(value) && hasFields(value, ['title', 'description'])
}

function isTestSuiteInfo(value: unknown): value is TestRunDetailsTestCase['testSuite'] {
  return value === null || (isObjectRecord(value) && hasFields(value, ['id', 'name']))
}

function isTestRunDetailsTestCase(value: unknown): value is TestRunDetailsTestCase {
  if (!isObjectRecord(value) || !hasFields(value, ['id', 'status', 'result', 'tracePath', 'testCase', 'testSuite'])) {
    return false
  }

  return isTestCaseInfo(value.testCase) && isTestSuiteInfo(value.testSuite)
}

function hasTestRunScalarFields(value: UnknownRecord) {
  return (
    hasFields(value, ['id', 'runId', 'status', 'result', 'startedAt', 'completedAt', 'browserEngine', 'testWorkersCount']) &&
    value.startedAt instanceof Date &&
    (value.completedAt instanceof Date || value.completedAt === null)
  )
}

function hasTestRunCollections(value: UnknownRecord) {
  return (
    hasFields(value, ['testCases', 'tags', 'reports']) &&
    Array.isArray(value.testCases) &&
    value.testCases.every(isTestRunDetailsTestCase) &&
    Array.isArray(value.tags) &&
    value.tags.every(isTagRow) &&
    Array.isArray(value.reports) &&
    value.reports.every(isReportRow)
  )
}

function isTestRunDetailsData(value: unknown): value is TestRunDetailsData {
  return (
    isObjectRecord(value) &&
    hasTestRunScalarFields(value) &&
    hasTestRunCollections(value) &&
    hasFields(value, ['environment']) &&
    isEnvironmentRow(value.environment)
  )
}

function isTraceViewerStatusData(value: unknown): value is { isRunning: boolean } {
  return isObjectRecord(value) && hasFields(value, ['isRunning']) && typeof value.isRunning === 'boolean'
}

export function getTestRunDetailsData(data: ActionResponseData | undefined) {
  return isTestRunDetailsData(data) ? data : null
}

export function getTraceViewerStatusData(data: ActionResponseData | undefined) {
  return isTraceViewerStatusData(data) ? data : null
}
