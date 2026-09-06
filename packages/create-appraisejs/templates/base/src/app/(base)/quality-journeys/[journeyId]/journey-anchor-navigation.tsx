import Link from 'next/link'

import { Button } from '@/components/ui/button'

const anchors = [
  ['overview', 'Overview'],
  ['progress', 'Progress'],
  ['analysis', 'Analysis'],
  ['scenarios', 'Scenarios'],
  ['automation', 'Automation'],
  ['execution', 'Execution'],
  ['triage', 'Report'],
  ['gates', 'Gates'],
  ['activity', 'Activity'],
] as const

export function JourneyAnchorNavigation({ journeyId, projectId }: { journeyId: string; projectId: string }) {
  const basePath = `/quality-journeys/${encodeURIComponent(journeyId)}?project=${encodeURIComponent(projectId)}`
  return (
    <nav aria-label="Journey sections" className="flex min-w-0 flex-wrap gap-2">
      {anchors.map(([anchor, label]) => (
        <Button asChild key={anchor} size="sm" variant="outline">
          <Link href={`${basePath}#${anchor}`}>{label}</Link>
        </Button>
      ))}
    </nav>
  )
}
