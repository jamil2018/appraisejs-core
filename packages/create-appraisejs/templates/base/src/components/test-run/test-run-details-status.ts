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
      return { label: 'Queued', icon: ListEnd, badgeClassName: 'border-border bg-secondary text-muted-foreground' }
    case 'RUNNING':
      return { label: 'Running', icon: LoaderCircle, badgeClassName: 'border-info-border bg-info-surface text-info' }
    case 'CANCELLING':
      return {
        label: 'Cancelling',
        icon: LoaderCircle,
        badgeClassName: 'border-warning-border bg-warning-surface text-warning',
      }
    case 'COMPLETED':
      return {
        label: result === 'BLOCKED' ? 'Blocked' : 'Completed',
        icon: result === 'PASSED' ? CheckCircle : result === 'BLOCKED' ? AlertTriangle : XCircle,
        badgeClassName:
          result === 'PASSED'
            ? 'border-success-border bg-success-surface text-success'
            : result === 'BLOCKED'
              ? 'border-warning-border bg-warning-surface text-warning'
              : 'border-danger-border bg-danger-surface text-danger',
      }
    case 'CANCELLED':
      return { label: 'Cancelled', icon: XCircle, badgeClassName: 'border-danger-border bg-danger-surface text-danger' }
    default:
      return { label: 'Unknown', icon: Clock, badgeClassName: 'border-border bg-secondary text-muted-foreground' }
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
      return {
        label: 'Valid evidence',
        icon: CheckCircle,
        badgeClassName: 'border-success-border bg-success-surface text-success',
      }
    case 'infrastructure_failure':
      return {
        label: 'Infrastructure failure',
        icon: AlertTriangle,
        badgeClassName: 'border-warning-border bg-warning-surface text-warning',
      }
    case 'invalid_empty_run':
      return {
        label: 'Empty run evidence',
        icon: AlertTriangle,
        badgeClassName: 'border-danger-border bg-danger-surface text-danger',
      }
    case 'invalid_missing_test_cases':
      return {
        label: 'Missing expected cases',
        icon: AlertTriangle,
        badgeClassName: 'border-danger-border bg-danger-surface text-danger',
      }
    case 'invalid_missing_report':
      return {
        label: 'Missing report',
        icon: AlertTriangle,
        badgeClassName: 'border-danger-border bg-danger-surface text-danger',
      }
    case 'invalid_placeholder_binary':
      return {
        label: 'Placeholder binary',
        icon: AlertTriangle,
        badgeClassName: 'border-danger-border bg-danger-surface text-danger',
      }
    case 'invalid_unmatched_scenarios':
      return {
        label: 'Unmatched scenarios',
        icon: AlertTriangle,
        badgeClassName: 'border-danger-border bg-danger-surface text-danger',
      }
    case 'invalid_stale_runtime':
      return {
        label: 'Stale runtime',
        icon: AlertTriangle,
        badgeClassName: 'border-danger-border bg-danger-surface text-danger',
      }
    default:
      return {
        label: 'Unknown evidence',
        icon: AlertTriangle,
        badgeClassName: 'border-border bg-secondary text-muted-foreground',
      }
  }
}

export function getTestCaseStatusMeta(status: TestRunTestCaseStatus): StatusMeta {
  switch (status) {
    case 'PENDING':
      return { label: 'Pending', icon: LoaderCircle }
    case 'RUNNING':
      return { label: 'Running', icon: LoaderCircle }
    case 'COMPLETED':
      return { label: 'Completed', icon: CheckCircle, iconClassName: 'text-success' }
    case 'CANCELLED':
      return { label: 'Cancelled', icon: XCircle }
    default:
      return { label: 'Unknown', icon: Clock }
  }
}

export function getTestCaseResultMeta(result: TestRunTestCaseResult): StatusMeta {
  switch (result) {
    case 'PASSED':
      return { label: 'Passed', icon: ClipboardCheck, iconClassName: 'text-success' }
    case 'FAILED':
      return { label: 'Failed', icon: ClipboardX, iconClassName: 'text-danger' }
    case 'UNTESTED':
      return { label: 'Untested', icon: Clock }
    default:
      return { label: 'Unknown', icon: Clock }
  }
}
