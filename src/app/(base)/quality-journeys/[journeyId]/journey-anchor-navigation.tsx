import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
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
          <Button
            aria-current={index === currentStageIndex ? 'step' : undefined}
            className={cn(index === currentStageIndex && 'border-info-border bg-info-surface text-info')}
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link href={`${basePath}#${displayStage.destination}`} />}
          >
            {displayStage.label}
          </Button>
          {index <= currentStageIndex ? (
            <span className={cn('text-xs', index === currentStageIndex ? 'text-info' : 'text-success')}>
              {index === currentStageIndex ? 'Current' : 'Completed'}
            </span>
          ) : null}
        </div>
      ))}
    </nav>
  )
}
