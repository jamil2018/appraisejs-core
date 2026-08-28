import type { JourneyWorkItemStatus, QualityJourneyRole, QualityJourneyStage } from './contracts'
import { stageRoleEligibility, workItemTransitions } from './lifecycle'
import { createHash } from 'node:crypto'

export type JourneyRunnerWorkItem = {
  workItemId: string
  role: QualityJourneyRole
  status: JourneyWorkItemStatus
  leaseExpiresAt?: string
}

type JourneyRunnerNodeState = 'WAITING' | 'RUNNABLE' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'TERMINAL'

const roleStages: Readonly<Record<QualityJourneyRole, QualityJourneyStage>> = {
  REQUIREMENT_ANALYZER: 'ANALYSIS',
  SCOUT: 'DISCOVERY',
  RESOURCE_EXPLORER: 'DISCOVERY',
  TEST_SCENARIO_DESIGNER: 'SCENARIO_DESIGN',
  AUTOMATOR: 'AUTOMATION',
  TRIAGER: 'TRIAGE',
}
const stageOrder: readonly QualityJourneyStage[] = [
  'INTAKE',
  'ANALYSIS',
  'ANALYSIS_REVIEW',
  'DISCOVERY',
  'SCENARIO_DESIGN',
  'SCENARIO_REVIEW',
  'AUTOMATION',
  'EXECUTION',
  'TRIAGE',
  'REPORT_REVIEW',
  'CLOSED',
]

const terminalWorkItemStatuses: readonly JourneyWorkItemStatus[] = ['COMPLETED', 'CANCELLED', 'SUPERSEDED']
const activeRunnerStates: Partial<Record<JourneyWorkItemStatus, JourneyRunnerNodeState>> = {
  WORKER_REQUESTED: 'IN_PROGRESS',
  WORKER_STARTED: 'IN_PROGRESS',
  IN_PROGRESS: 'IN_PROGRESS',
  LEASE_EXPIRED: 'IN_PROGRESS',
  REPLACEMENT_REQUESTED: 'IN_PROGRESS',
  BLOCKED: 'BLOCKED',
  ESCALATED: 'BLOCKED',
  COMPLETED: 'COMPLETED',
}

export function qualityJourneyWorkItemId(journeyId: string, cycleId: string, role: QualityJourneyRole): string {
  return `qjw_${createHash('sha256').update(`${journeyId}:${cycleId}:${role}`).digest('hex').slice(0, 24)}`
}

export function expectedQualityJourneyWorkItemIds(
  journeyId: string,
  cycleId: string,
  stage: QualityJourneyStage,
): readonly string[] {
  return (stageRoleEligibility[stage] ?? []).map(role => qualityJourneyWorkItemId(journeyId, cycleId, role))
}

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

function runnerNodeState(
  role: QualityJourneyRole,
  stage: QualityJourneyStage,
  item: JourneyRunnerWorkItem | undefined,
  hasBlockers: boolean,
): JourneyRunnerNodeState {
  const persistedState = item ? activeRunnerStates[item.status] : undefined
  if (persistedState) return persistedState
  if (stage === 'CLOSED') return 'TERMINAL'
  if (roleStages[role] === stage) return hasBlockers ? 'WAITING' : 'RUNNABLE'
  return stageOrder.indexOf(roleStages[role]) < stageOrder.indexOf(stage) ? 'COMPLETED' : 'WAITING'
}

export function reconstructQualityJourneyRunner(
  stage: QualityJourneyStage,
  workItems: readonly JourneyRunnerWorkItem[],
  blockerIds: readonly string[],
) {
  return (Object.keys(roleStages) as QualityJourneyRole[]).map(role => {
    const item = [...workItems].reverse().find(candidate => candidate.role === role)
    const state = runnerNodeState(role, stage, item, blockerIds.length > 0)
    return { role, stage: roleStages[role], state, workItemId: item?.workItemId ?? null }
  })
}
