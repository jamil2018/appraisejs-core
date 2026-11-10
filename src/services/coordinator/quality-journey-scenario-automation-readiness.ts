import type { Prisma, QualityJourney, QualityJourneyWorkItem } from '@prisma/client'
import { ServiceError } from '@/services/shared/errors'

type InternalScenarioAutomationRole = 'TEST_SCENARIO_DESIGNER' | 'AUTOMATOR'
type Readiness = (
  journey: QualityJourney,
  item: QualityJourneyWorkItem,
  tx: Prisma.TransactionClient,
) => Promise<unknown>

const readers = new Map<InternalScenarioAutomationRole, Readiness>()

export function registerInternalScenarioAutomationReadiness(role: InternalScenarioAutomationRole, reader: Readiness) {
  readers.set(role, reader)
}

export function getInternalScenarioAutomationReadiness(role: InternalScenarioAutomationRole) {
  return readers.get(role)
}

export function assertInternalScenarioAutomationAssignment(
  journey: QualityJourney,
  item: QualityJourneyWorkItem,
  role: InternalScenarioAutomationRole,
  stage: 'SCENARIO_DESIGN' | 'AUTOMATION',
) {
  if (
    journey.hostingMode !== 'APP_SERVER_LOCAL_V1' ||
    journey.stage !== stage ||
    item.role !== role ||
    item.journeyId !== journey.id ||
    item.targetProjectId !== journey.targetProjectId ||
    item.cycleId !== journey.activeCycleId ||
    !(JSON.parse(journey.activeWorkItemIdsJson) as string[]).includes(item.id)
  )
    throw new ServiceError('Internal Scenario Designer or Automator assignment is stale.', 'CONFLICT')
}
