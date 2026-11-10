'use client'

import { journeyRuntimeStatusCopy } from '@/lib/quality-journey/runtime-status'
import { useJourneyStatusObservationContext } from './journey-status-observation'

export function JourneyRuntimeStatus() {
  const { snapshot, isOutdated } = useJourneyStatusObservationContext()
  const status = snapshot?.runtimeStatus
  return (
    <div aria-live="polite" aria-atomic="true">
      {status ? (
        <p className="text-sm text-muted-foreground">
          {journeyRuntimeStatusCopy[status]}
          {isOutdated ? ' Last observed status may be outdated.' : ''}
        </p>
      ) : null}
    </div>
  )
}
