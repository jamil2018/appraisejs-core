import { getQualityJourneyAnalysis } from '@/services/coordinator/quality-journey-analysis-service'
import { getQualityJourneyExecution } from '@/services/coordinator/quality-journey-execution-service'
import { getQualityJourneyScenarioPortfolio } from '@/services/coordinator/quality-journey-scenario-service'
import { getQualityJourney } from '@/services/coordinator/quality-journey-service'
import { getQualityJourneyTriage } from '@/services/coordinator/quality-journey-triage-service'
import { ServiceError } from '@/services/shared/errors'

import { JourneyFocusCard } from './journey-focus-card'
import { currentJourneyAnalysis, currentJourneyFocus } from './journey-focus-data'

export async function JourneyChatFocus({ projectId, journeyId }: { projectId: string; journeyId: string }) {
  const scope = { journeyId, targetProjectId: projectId }
  const journey = await getQualityJourney(scope).catch(error => {
    if (error instanceof ServiceError && error.code === 'NOT_FOUND') return null
    throw error
  })
  if (!journey) return null
  if (
    journey.blockers.length ||
    journey.journey.status === 'PAUSED' ||
    journey.journey.hostingMode === 'EXTERNAL_LEGACY'
  )
    return null

  const stage = journey.journey.stage
  const [analysis, execution, triage, scenarios] = await Promise.all([
    getQualityJourneyAnalysis(scope),
    getQualityJourneyExecution(scope),
    getQualityJourneyTriage(scope),
    stage === 'SCENARIO_REVIEW'
      ? getQualityJourneyScenarioPortfolio(scope).catch(error => {
          if (error instanceof ServiceError && error.code === 'NOT_FOUND') return null
          throw error
        })
      : null,
  ])
  const focus = currentJourneyFocus({
    journey,
    activeAnalysis: currentJourneyAnalysis(journey, analysis).view,
    execution,
    triage,
    scenarios,
  })
  const href = `/quality-journeys/${encodeURIComponent(journeyId)}?project=${encodeURIComponent(projectId)}#${focus.destination}`
  return <JourneyFocusCard focus={focus} href={href} />
}
