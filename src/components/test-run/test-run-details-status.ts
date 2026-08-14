import type { TestRunResult, TestRunStatus, TestRunTestCaseResult, TestRunTestCaseStatus } from '@prisma/client'
import {
  AlertTriangle,
  CheckCircle,
  ClipboardCheck,
  ClipboardX,
  Clock,
  ListEnd,
  LoaderCircle,
  XCircle,
} from 'lucide-react'

import type { StatusMeta, TestRunEvidenceHealth } from './test-run-details-types'

export function isTerminalTestRunStatus(status: TestRunStatus) {
  return status === 'COMPLETED' || status === 'CANCELLED'
}

export function getTestRunStatusMeta(status: TestRunStatus, result: TestRunResult): StatusMeta {
  switch (status) {
    case 'QUEUED':
      return { label: 'Queued', icon: ListEnd, badgeClassName: 'bg-zinc-500' }
    case 'RUNNING':
      return { label: 'Running', icon: LoaderCircle, badgeClassName: 'bg-blue-500' }
    case 'CANCELLING':
      return { label: 'Cancelling', icon: LoaderCircle, badgeClassName: 'bg-orange-500' }
    case 'COMPLETED':
      return {
        label: result === 'BLOCKED' ? 'Blocked' : 'Completed',
        icon: result === 'PASSED' ? CheckCircle : result === 'BLOCKED' ? AlertTriangle : XCircle,
        badgeClassName: result === 'PASSED' ? 'bg-green-700' : result === 'BLOCKED' ? 'bg-amber-600' : 'bg-red-500',
      }
    case 'CANCELLED':
      return { label: 'Cancelled', icon: XCircle, badgeClassName: 'bg-red-500' }
    default:
      return { label: 'Unknown', icon: Clock, badgeClassName: 'bg-zinc-500' }
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
    case 'BLOCKED':
      return 'Blocked by human verification'
    case 'CANCELLED':
      return 'Cancelled'
    default:
      return 'Unknown'
  }
}

export function getEvidenceHealthMeta(evidenceHealth: TestRunEvidenceHealth): StatusMeta {
  switch (evidenceHealth) {
    case 'valid':
      return { label: 'Valid evidence', icon: CheckCircle, badgeClassName: 'bg-emerald-700 text-white' }
    case 'infrastructure_failure':
      return { label: 'Infrastructure failure', icon: AlertTriangle, badgeClassName: 'bg-orange-600 text-white' }
    case 'invalid_empty_run':
      return { label: 'Empty run evidence', icon: AlertTriangle, badgeClassName: 'bg-red-600 text-white' }
    case 'invalid_missing_test_cases':
      return { label: 'Missing expected cases', icon: AlertTriangle, badgeClassName: 'bg-red-600 text-white' }
    case 'invalid_missing_report':
      return { label: 'Missing report', icon: AlertTriangle, badgeClassName: 'bg-red-600 text-white' }
    case 'invalid_placeholder_binary':
      return { label: 'Placeholder binary', icon: AlertTriangle, badgeClassName: 'bg-red-600 text-white' }
    case 'invalid_unmatched_scenarios':
      return { label: 'Unmatched scenarios', icon: AlertTriangle, badgeClassName: 'bg-red-600 text-white' }
    case 'invalid_stale_runtime':
      return { label: 'Stale runtime', icon: AlertTriangle, badgeClassName: 'bg-red-600 text-white' }
    default:
      return { label: 'Unknown evidence', icon: AlertTriangle, badgeClassName: 'bg-zinc-600 text-white' }
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
