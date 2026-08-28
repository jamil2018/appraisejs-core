import type { JourneyWorkItemStatus, QualityJourneyRole, QualityJourneyStage } from './contracts'
import { stageRoleEligibility, workItemTransitions } from './lifecycle'

export type JourneyRunnerWorkItem = {
  workItemId: string
  role: QualityJourneyRole
  status: JourneyWorkItemStatus
  leaseExpiresAt?: string
}

const terminalWorkItemStatuses: readonly JourneyWorkItemStatus[] = ['COMPLETED', 'CANCELLED', 'SUPERSEDED']

export function runnableQualityJourneyRoles(
  stage: QualityJourneyStage,
  workItems: readonly JourneyRunnerWorkItem[],
): readonly QualityJourneyRole[] {
  const eligible = stageRoleEligibility[stage] ?? []
  return eligible.filter(
    role => !workItems.some(item => item.role === role && !terminalWorkItemStatuses.includes(item.status)),
  )
}

export function expireQualityJourneyLeases(
  workItems: readonly JourneyRunnerWorkItem[],
  now: Date,
): readonly JourneyRunnerWorkItem[] {
  return workItems.map(item => {
    const leaseExpiry = item.leaseExpiresAt ? Date.parse(item.leaseExpiresAt) : Number.NaN
    if (
      !item.leaseExpiresAt ||
      !Number.isFinite(leaseExpiry) ||
      !['WORKER_STARTED', 'IN_PROGRESS'].includes(item.status) ||
      leaseExpiry > now.getTime()
    )
      return item
    if (!workItemTransitions[item.status].includes('LEASE_EXPIRED')) return item
    return { ...item, status: 'LEASE_EXPIRED' }
  })
}
