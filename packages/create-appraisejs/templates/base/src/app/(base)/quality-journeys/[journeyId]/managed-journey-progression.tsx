'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { continueQualityJourneyManagedAction } from '../quality-journey-managed-progression-actions'

/** Reconnect wakes only durable eligible work. Native dispatch remains guarded by the server. */
export function ManagedJourneyProgression({
  journeyId,
  stateHash,
  discoveryCaptureStatus,
}: {
  journeyId: string
  stateHash: string
  discoveryCaptureStatus?: string | null
}) {
  const { refresh } = useRouter()
  const captureStatus = useRef(discoveryCaptureStatus ?? null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    const wake = async () => {
      if (document.visibilityState === 'hidden') return
      try {
        const result = await continueQualityJourneyManagedAction({ journeyId, expectedStateHash: stateHash })
        if (active) {
          setError(result.success ? null : (result.error ?? 'Journey continuation needs attention.'))
          const status = (result.data as { discoveryCaptureStatus?: string } | undefined)?.discoveryCaptureStatus
          if (
            result.success &&
            status &&
            status !== captureStatus.current &&
            (status !== 'INACTIVE' || captureStatus.current)
          ) {
            captureStatus.current = status
            refresh()
          }
        }
      } catch {
        if (active) setError('Journey connection interrupted. Reconnect to inspect current work.')
      }
    }
    void wake()
    // Browser evidence and completed roles can change without changing the lifecycle hash.
    const timer = window.setInterval(() => void wake(), 10_000)
    const onVisible = () => void wake()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [journeyId, stateHash, refresh])
  return error ? (
    <p role="status" className="text-sm text-muted-foreground">
      {error}
    </p>
  ) : null
}
