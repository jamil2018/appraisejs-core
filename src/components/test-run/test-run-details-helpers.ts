import type {
  Environment,
  Report,
  Tag,
  TestRun,
  TestRunResult,
  TestRunStatus,
  TestRunTestCase,
  TestRunTestCaseResult,
  TestRunTestCaseStatus,
} from '@prisma/client'
import {
  CheckCircle,
  ClipboardCheck,
  ClipboardX,
  Clock,
  ListEnd,
  LoaderCircle,
  type LucideIcon,
  XCircle,
} from 'lucide-react'

import type { ActionResponseData } from '@/types/form/actionHandler'

export type TestRunDetailsTestCase = TestRunTestCase & {
  testCase: { title: string; description: string }
  testSuite: { id: string; name: string } | null
}

export type TestRunDetailsData = TestRun & {
  testCases: TestRunDetailsTestCase[]
  tags: Tag[]
  environment: Environment
  reports: Report[]
}

export type StatusMeta = {
  label: string
  icon: LucideIcon
  badgeClassName?: string
  iconClassName?: string
}

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

export function isTerminalTestRunStatus(status: TestRunStatus) {
  return status === 'COMPLETED' || status === 'CANCELLED'
}

export function getTestRunStatusMeta(status: TestRunStatus, result: TestRunResult): StatusMeta {
  switch (status) {
    case 'QUEUED':
      return { label: 'Queued', icon: ListEnd, badgeClassName: 'bg-gray-500' }
    case 'RUNNING':
      return { label: 'Running', icon: LoaderCircle, badgeClassName: 'bg-blue-500' }
    case 'COMPLETED':
      return {
        label: 'Completed',
        icon: result === 'PASSED' ? CheckCircle : XCircle,
        badgeClassName: result === 'PASSED' ? 'bg-green-700' : 'bg-red-500',
      }
    case 'CANCELLED':
      return { label: 'Cancelled', icon: XCircle, badgeClassName: 'bg-red-500' }
    default:
      return { label: 'Unknown', icon: Clock, badgeClassName: 'bg-gray-500' }
  }
}

export function getTestRunResultText(result: TestRunResult) {
  switch (result) {
    case 'PENDING':
      return 'Pending'
    case 'PASSED':
      return 'Passed'
    case 'FAILED':
      return 'Failed'
    case 'CANCELLED':
      return 'Cancelled'
    default:
      return 'Unknown'
  }
}

export function getTestCaseStatusMeta(status: TestRunTestCaseStatus): StatusMeta {
  switch (status) {
    case 'PENDING':
      return { label: 'Pending', icon: LoaderCircle }
    case 'RUNNING':
      return { label: 'Running', icon: LoaderCircle }
    case 'COMPLETED':
      return { label: 'Completed', icon: CheckCircle, iconClassName: 'text-green-500' }
    case 'CANCELLED':
      return { label: 'Cancelled', icon: XCircle }
    default:
      return { label: 'Unknown', icon: Clock }
  }
}

export function getTestCaseResultMeta(result: TestRunTestCaseResult): StatusMeta {
  switch (result) {
    case 'PASSED':
      return { label: 'Passed', icon: ClipboardCheck, iconClassName: 'text-green-500' }
    case 'FAILED':
      return { label: 'Failed', icon: ClipboardX, iconClassName: 'text-red-500' }
    case 'UNTESTED':
      return { label: 'Untested', icon: Clock }
    default:
      return { label: 'Unknown', icon: Clock }
  }
}

export function getProgressStats(testCases: TestRunDetailsTestCase[]) {
  const total = testCases.length
  const completed = testCases.filter(
    testCase => testCase.status === 'COMPLETED' || testCase.status === 'CANCELLED',
  ).length

  return {
    total,
    completed,
    percentage: total > 0 ? (completed / total) * 100 : 0,
  }
}

export function getDurationSeconds(startedAt: Date, completedAt: Date | null) {
  if (!completedAt) {
    return null
  }

  return Math.round((completedAt.getTime() - startedAt.getTime()) / 1000)
}

export function getTraceViewerEligibleTestCases(testCases: TestRunDetailsTestCase[]) {
  return testCases.filter(testCase => testCase.result === 'FAILED' && Boolean(testCase.tracePath))
}
