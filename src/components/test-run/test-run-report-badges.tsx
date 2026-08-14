import { StatusBadge } from '@/components/ui/status-badge'
import { TestRunResult, TestRunStatus } from '@prisma/client'
import { AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react'

export const testRunResultPresentation = {
  [TestRunResult.PASSED]: { label: 'Passed', tone: 'success', icon: <CheckCircle /> },
  [TestRunResult.FAILED]: { label: 'Failed', tone: 'danger', icon: <XCircle /> },
  [TestRunResult.BLOCKED]: { label: 'Blocked', tone: 'warning', icon: <AlertTriangle /> },
  [TestRunResult.CANCELLED]: { label: 'Cancelled', tone: 'neutral', icon: <XCircle /> },
  [TestRunResult.PENDING]: { label: 'Pending', tone: 'neutral', icon: <Clock /> },
} as const

export const testRunStatusPresentation = {
  [TestRunStatus.QUEUED]: { label: 'Queued', tone: 'neutral', icon: <Clock /> },
  [TestRunStatus.RUNNING]: { label: 'Running', tone: 'info', icon: <Clock /> },
  [TestRunStatus.CANCELLING]: { label: 'Cancelling', tone: 'warning', icon: <Clock /> },
  [TestRunStatus.COMPLETED]: { label: 'Completed', tone: 'success', icon: <CheckCircle /> },
  [TestRunStatus.CANCELLED]: { label: 'Cancelled', tone: 'neutral', icon: <XCircle /> },
} as const

export function TestRunResultBadge({ result, className }: { result: TestRunResult; className?: string }) {
  return <StatusBadge {...testRunResultPresentation[result]} className={className} />
}

export function TestRunStatusBadge({ status }: { status: TestRunStatus }) {
  return <StatusBadge {...testRunStatusPresentation[status]} />
}
