import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { displayStageForQualityJourney, qualityJourneyDisplayStages } from '@/lib/quality-journey/presentation'

export function JourneyAnchorNavigation({
  journeyId,
  projectId,
  stage,
}: {
  journeyId: string
  projectId: string
  stage: string
}) {
  const basePath = `/quality-journeys/${encodeURIComponent(journeyId)}?project=${encodeURIComponent(projectId)}`
  const currentStageIndex = qualityJourneyDisplayStages.findIndex(
    item => item.id === displayStageForQualityJourney(stage).id,
  )
  return (
    <nav aria-label="Journey sections" className="flex min-w-0 flex-wrap gap-2">
      {qualityJourneyDisplayStages.map((displayStage, index) => (
        <div className="flex items-center gap-1" key={displayStage.id}>
          <Button asChild size="sm" variant="outline">
            <Link href={`${basePath}#${displayStage.destination}`}>{displayStage.label}</Link>
          </Button>
          {index <= currentStageIndex ? (
            <span className="text-xs text-muted-foreground">
              {index === currentStageIndex ? 'Current' : 'Completed'}
            </span>
          ) : null}
        </div>
      ))}
    </nav>
  )
}
