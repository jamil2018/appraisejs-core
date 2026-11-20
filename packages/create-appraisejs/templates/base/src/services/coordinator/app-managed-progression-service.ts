import type { PrismaClient } from '@prisma/client'
import { after } from 'next/server'
import { registerAppManagedRuntimeWake } from './app-managed-runtime-wake'
import prisma from '@/config/db-config'
import { ServiceError } from '@/services/shared/errors'
import { appManagedAnalysisEnabled, startAppManagedAnalysis } from './app-managed-analysis-service'
import { appManagedDiscoveryEnabled, startAppManagedDiscovery } from './app-managed-discovery-service'
import {
  appManagedScenarioAutomationEnabled,
  startAppManagedScenarioAutomation,
} from './app-managed-scenario-automation-service'
import { appManagedTriageEnabled, startAppManagedTriage } from './app-managed-triage-service'
import { readAppManagedDesignerSuccessor } from './app-managed-scenario-automation-task'
import {
  captureAppManagedAnonymousDiscovery,
  readAppManagedAnonymousDiscoveryCapture,
} from './app-managed-discovery-capture'
import { readInternalDiscoveryAssignment } from './quality-journey-discovery-service'
import { observeQualityJourneyAnalysisFollowupInTransaction } from './quality-journey-service'

type Input = { journeyId: string; targetProjectId: string; expectedStateHash: string }
type Role =
  | 'DISCOVERY_CAPTURE'
  | 'REQUIREMENT_ANALYZER'
  | 'SCOUT'
  | 'RESOURCE_EXPLORER'
  | 'TEST_SCENARIO_DESIGNER'
  | 'AUTOMATOR'
  | 'TRIAGER'

/** Observe eligibility only. Canonical role services recheck all authority before reserving a native send. */
export async function readAppManagedJourneyContinuation(input: Input, client: PrismaClient = prisma) {
  return client.$transaction(async tx => {
    const journey = await tx.qualityJourney.findFirst({
      where: { id: input.journeyId, targetProjectId: input.targetProjectId },
      include: { workItems: true, activeDiscoveryRevision: true, currentCoordinatorSession: true },
    })
    if (!journey) throw new ServiceError('Quality Journey was not found in the active project.', 'NOT_FOUND')
    if (
      journey.hostingMode !== 'APP_SERVER_LOCAL_V1' ||
      journey.status !== 'ACTIVE' ||
      journey.stateHash !== input.expectedStateHash ||
      JSON.parse(journey.blockerIdsJson).length ||
      JSON.parse(journey.unresolvedQuestionIdsJson).length
    )
      return null
    const session = journey.currentCoordinatorSession
    if (
      session &&
      (session.status !== 'ACTIVE' || session.ownerPrincipalId !== `appraise-local:${input.targetProjectId}`)
    )
      return null
    const activeIds = JSON.parse(journey.activeWorkItemIdsJson) as string[]
    const work = journey.workItems.filter(item => item.cycleId === journey.activeCycleId && activeIds.includes(item.id))
    // Neither an interrupted request nor reconnect authorizes replaying an already claimed assignment.
    const eligible = (role: Role) =>
      work.find(item => item.role === role && item.status === 'ELIGIBLE' && item.currentAttempt === 0)
    let role: Role | null = null
    if (journey.stage === 'ANALYSIS' && appManagedAnalysisEnabled()) {
      if (eligible('REQUIREMENT_ANALYZER')) role = 'REQUIREMENT_ANALYZER'
      else {
        const followup = await observeQualityJourneyAnalysisFollowupInTransaction(input, tx)
        if (
          followup.expected &&
          work.some(item => item.id === followup.expected!.workItemId && item.status === 'ELIGIBLE')
        )
          role = 'REQUIREMENT_ANALYZER'
      }
    } else if (journey.stage === 'DISCOVERY' && session) {
      const discovery = journey.activeDiscoveryRevision
      if (discovery?.status === 'COMPLETED' && appManagedScenarioAutomationEnabled()) role = 'TEST_SCENARIO_DESIGNER'
      else if (appManagedDiscoveryEnabled()) {
        const capture = await readAppManagedAnonymousDiscoveryCapture(input, tx)
        if (capture.status === 'READY') role = 'DISCOVERY_CAPTURE'
        // Authenticated access and ambiguous targets still wait for human input.
        for (const candidate of ['SCOUT', 'RESOURCE_EXPLORER'] as const) {
          if (role || ['RECOVERY_REQUIRED', 'INSPECTING'].includes(capture.status)) break
          const item = eligible(candidate)
          if (!item) continue
          try {
            await readInternalDiscoveryAssignment(journey, { ...item, role: candidate }, tx)
            role = candidate
            break
          } catch (error) {
            if (!(error instanceof ServiceError && error.code === 'CONFLICT')) throw error
          }
        }
      }
    } else if (
      journey.stage === 'SCENARIO_DESIGN' &&
      session &&
      appManagedScenarioAutomationEnabled() &&
      work.some(item => item.role === 'TEST_SCENARIO_DESIGNER')
    ) {
      if (eligible('TEST_SCENARIO_DESIGNER')) role = 'TEST_SCENARIO_DESIGNER'
      else {
        const item = work.find(item => item.role === 'TEST_SCENARIO_DESIGNER')!
        try {
          if (await readAppManagedDesignerSuccessor(journey, item, tx)) role = 'TEST_SCENARIO_DESIGNER'
        } catch (error) {
          if (!(error instanceof ServiceError && error.code === 'CONFLICT')) throw error
        }
      }
    } else if (
      journey.stage === 'AUTOMATION' &&
      session &&
      appManagedScenarioAutomationEnabled() &&
      eligible('AUTOMATOR')
    )
      role = 'AUTOMATOR'
    else if (
      journey.stage === 'TRIAGE' &&
      session &&
      appManagedTriageEnabled() &&
      !work.some(item => item.role === 'TRIAGER' && item.currentAttempt > 0)
    )
      role = 'TRIAGER'
    return role ? { ...input, expectedStateHash: journey.stateHash, role } : null
  })
}

/** Bounded local continuation. Review, authenticated access, consent and recovery remain explicit human gates. */
export async function continueAppManagedJourney(input: Input, client: PrismaClient = prisma) {
  let current = input
  const completed: Role[] = []
  for (let remaining = 6; remaining > 0; remaining--) {
    const next = await readAppManagedJourneyContinuation(current, client)
    if (!next) break
    if (next.role === 'DISCOVERY_CAPTURE') await captureAppManagedAnonymousDiscovery(next, client)
    else if (next.role === 'REQUIREMENT_ANALYZER') await startAppManagedAnalysis(next, client)
    else if (next.role === 'SCOUT' || next.role === 'RESOURCE_EXPLORER')
      await startAppManagedDiscovery({ ...next, role: next.role }, client)
    else if (next.role === 'TEST_SCENARIO_DESIGNER' || next.role === 'AUTOMATOR')
      await startAppManagedScenarioAutomation({ ...next, role: next.role }, client)
    else {
      const triage = await startAppManagedTriage(next, client)
      if (triage && 'awaitingOperator' in triage && triage.awaitingOperator) break
    }
    completed.push(next.role)
    const journey = await client.qualityJourney.findFirstOrThrow({
      where: { id: input.journeyId, targetProjectId: input.targetProjectId },
      select: { stateHash: true },
    })
    current = { ...input, expectedStateHash: journey.stateHash }
  }
  return { completed }
}

/** Process-owned completion callbacks have no Next request context. Their wake still uses durable eligibility. */
function wakeAppManagedJourneyContinuation(input: Input, client: PrismaClient = prisma) {
  void continueAppManagedJourney(input, client).catch(error => {
    console.error('Managed Journey terminal continuation stopped', {
      journeyId: input.journeyId,
      code: error instanceof ServiceError ? error.code : 'UNEXPECTED',
    })
  })
}

export function registerAppManagedJourneyRuntimeWake() {
  registerAppManagedRuntimeWake(wakeAppManagedJourneyContinuation)
}

// Managed actions load this module as well as the Node boot hook; registration remains a single callback.
registerAppManagedJourneyRuntimeWake()

/** The issued work and consumed markers are durable; this callback is an opportunistic wake, not a durable queue. */
export function scheduleAppManagedJourneyContinuation(input: Input) {
  after(async () => {
    try {
      await continueAppManagedJourney(input)
    } catch (error) {
      console.error('Managed Journey continuation stopped', {
        journeyId: input.journeyId,
        code: error instanceof ServiceError ? error.code : 'UNEXPECTED',
      })
    }
  })
}
