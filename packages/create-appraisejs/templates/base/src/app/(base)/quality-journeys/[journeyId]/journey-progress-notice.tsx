'use client'

import { Button } from '@/components/ui/button'
import { useJourneyStatusFreshness, useJourneyStatusObservationContext } from './journey-status-observation'

function observedStatusMessage({
  currentStage,
  eventCount,
  isChecking,
  isOutdated,
  lastCheckedAt,
  newerVersionAvailable,
}: {
  currentStage: string
  eventCount: number
  isChecking: boolean
  isOutdated: boolean
  lastCheckedAt: string | null
  newerVersionAvailable: boolean
}) {
  if (isChecking) return 'Checking observed lifecycle state.'
  const checkedLabel = lastCheckedAt
    ? `Last checked: ${new Date(lastCheckedAt).toLocaleTimeString()}.`
    : 'Not checked yet.'
  return [
    `Observed ${currentStage.replaceAll('_', ' ').toLocaleLowerCase()} state with ${eventCount} durable lifecycle event${eventCount === 1 ? '' : 's'}. ${checkedLabel}`,
    isOutdated ? 'The observed status may be outdated; the last known state is still shown.' : '',
    newerVersionAvailable
      ? 'A newer version is available. Reviewed content remains unchanged until you explicitly load it.'
      : '',
  ]
    .filter(Boolean)
    .join(' ')
}

function JourneyProgressActions({
  automaticPollingStopped,
  checkForUpdates,
  isChecking,
  loadNewerVersion,
  loadingNewerVersion,
  newerVersionAvailable,
}: {
  automaticPollingStopped: boolean
  checkForUpdates(manual?: boolean): Promise<void>
  isChecking: boolean
  loadNewerVersion(): void
  loadingNewerVersion: boolean
  newerVersionAvailable: boolean
}) {
  const statusLabel = isChecking ? 'Checking…' : automaticPollingStopped ? 'Updates complete' : 'Check for updates'
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      <Button
        disabled={isChecking || automaticPollingStopped}
        onClick={() => void checkForUpdates(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        {statusLabel}
      </Button>
      {newerVersionAvailable ? (
        <Button disabled={loadingNewerVersion} onClick={loadNewerVersion} size="sm" type="button">
          {loadingNewerVersion ? 'Loading…' : 'Load newer version'}
        </Button>
      ) : null}
    </div>
  )
}

export function JourneyProgressNotice({
  eventCount,
  stateHash,
  stage,
}: {
  eventCount: number
  stateHash: string
  stage: string
}) {
  const observation = useJourneyStatusObservationContext()
  const freshness = useJourneyStatusFreshness()

  const currentStage = observation.snapshot?.lifecycle.stage ?? stage

  return (
    <section
      aria-label="Observed journey progress"
      className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border p-3"
    >
      <p aria-live="polite" className="min-w-0 flex-1 text-sm text-muted-foreground" role="status">
        {observedStatusMessage({
          currentStage,
          eventCount,
          isChecking: observation.isChecking,
          isOutdated: observation.isOutdated,
          lastCheckedAt: observation.lastCheckedAt,
          newerVersionAvailable: freshness.newerVersionAvailable,
        })}
      </p>
      <JourneyProgressActions {...observation} {...freshness} />
      <span className="sr-only">Current state hash: {stateHash}</span>
    </section>
  )
}
