import type { TestRunResult, TestRunStatus, TestRunTestCaseResult, TestRunTestCaseStatus } from '@prisma/client'
import { CheckCircle, ClipboardCheck, ClipboardX, Clock, ListEnd, LoaderCircle, XCircle } from 'lucide-react'

import type { StatusMeta } from './test-run-details-types'

export function isTerminalTestRunStatus(status: TestRunStatus) {
  return status === 'COMPLETED' || status === 'CANCELLED'
}

export function getTestRunStatusMeta(status: TestRunStatus, result: TestRunResult): StatusMeta {
  switch (status) {
    case 'QUEUED':
      return { label: 'Queued', icon: ListEnd, badgeClassName: 'bg-zinc-500' }
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
