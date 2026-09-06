'use client'

import { useRouter } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react'

import { readQualityJourneyStatusAction } from '../quality-journey-status-actions'
import type { QualityJourneyStatusSnapshot } from '@/services/coordinator/quality-journey-query-service'

const INITIAL_POLL_DELAY_MS = 10_000
const MAX_POLL_DELAY_MS = 60_000

type ObservationState = {
  snapshot: QualityJourneyStatusSnapshot | null
  lastCheckedAt: string | null
  isChecking: boolean
  isOutdated: boolean
  automaticPollingStopped: boolean
}

type ObservationControl = {
  inFlight: boolean
  stopped: boolean
  pollDelay: number
  nextAutomaticCheck: number
}

type JourneyStatusFreshness = {
  newerVersionAvailable: boolean
  loadingNewerVersion: boolean
  loadNewerVersion(): void
}

const JourneyStatusFreshnessContext = createContext<JourneyStatusFreshness | null>(null)

function initialState(stage: string): ObservationState {
  return {
    snapshot: null,
    lastCheckedAt: null,
    isChecking: false,
    isOutdated: false,
    automaticPollingStopped: stage === 'CLOSED',
  }
}

function initialControl(stage: string): ObservationControl {
  return {
    inFlight: false,
    stopped: stage === 'CLOSED',
    pollDelay: INITIAL_POLL_DELAY_MS,
    nextAutomaticCheck: 0,
  }
}

function mayCheck(control: ObservationControl, manual: boolean): boolean {
  return !control.inFlight && !control.stopped && (manual || document.visibilityState === 'visible')
}

function automaticCheckIsDue(control: ObservationControl, manual: boolean): boolean {
  return manual || Date.now() >= control.nextAutomaticCheck
}

async function readSnapshot(journeyId: string): Promise<QualityJourneyStatusSnapshot | null> {
  try {
    const result = await readQualityJourneyStatusAction({ journeyId })
    return result.success && result.data ? (result.data as QualityJourneyStatusSnapshot) : null
  } catch {
    return null
  }
}

function nextPollDelay(control: ObservationControl, snapshot: QualityJourneyStatusSnapshot | null): number {
  return snapshot ? INITIAL_POLL_DELAY_MS : Math.min(control.pollDelay * 2, MAX_POLL_DELAY_MS)
}

function nextState(current: ObservationState, snapshot: QualityJourneyStatusSnapshot | null): ObservationState {
  if (!snapshot) return { ...current, isChecking: false, isOutdated: true }
  return {
    snapshot,
    lastCheckedAt: snapshot.observedAt,
    isChecking: false,
    isOutdated: false,
    automaticPollingStopped: snapshot.closed,
  }
}

function useJourneyStatusObservation({ journeyId, stage }: { journeyId: string; stage: string }) {
  const [state, setState] = useState(() => initialState(stage))
  const control = useRef(initialControl(stage))

  const checkForUpdates = useCallback(
    async (manual = false) => {
      if (!mayCheck(control.current, manual) || !automaticCheckIsDue(control.current, manual)) return

      control.current.inFlight = true
      setState(current => ({ ...current, isChecking: true }))
      const snapshot = await readSnapshot(journeyId)
      control.current.inFlight = false
      control.current.pollDelay = nextPollDelay(control.current, snapshot)
      control.current.nextAutomaticCheck = Date.now() + control.current.pollDelay
      if (snapshot?.closed) control.current.stopped = true
      setState(current => nextState(current, snapshot))
    },
    [journeyId],
  )

  return { ...state, checkForUpdates }
}

function useVisibleJourneyStatusPolling({
  stopped,
  checkForUpdates,
}: {
  stopped: boolean
  checkForUpdates: (manual?: boolean) => Promise<void>
}) {
  useEffect(() => {
    if (stopped) return
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') void checkForUpdates()
    }
    const timer = window.setInterval(() => void checkForUpdates(), INITIAL_POLL_DELAY_MS)
    document.addEventListener('visibilitychange', checkWhenVisible)
    checkWhenVisible()
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', checkWhenVisible)
    }
  }, [checkForUpdates, stopped])
}

export function JourneyStatusObservationProvider({
  journeyId,
  stage,
  stateHash,
  children,
}: {
  journeyId: string
  stage: string
  stateHash: string
  children: ReactNode
}) {
  const observation = useJourneyStatusObservation({ journeyId, stage })
  useVisibleJourneyStatusPolling({
    stopped: observation.automaticPollingStopped,
    checkForUpdates: observation.checkForUpdates,
  })
  const router = useRouter()
  const [loadingNewerVersion, startTransition] = useTransition()
  const newerVersionAvailable = Boolean(observation.snapshot && observation.snapshot.lifecycle.stateHash !== stateHash)
  const loadNewerVersion = useCallback(() => startTransition(() => router.refresh()), [router, startTransition])

  return (
    <JourneyStatusFreshnessContext.Provider value={{ newerVersionAvailable, loadingNewerVersion, loadNewerVersion }}>
      <JourneyStatusObservationContext.Provider value={observation}>
        {children}
      </JourneyStatusObservationContext.Provider>
    </JourneyStatusFreshnessContext.Provider>
  )
}

const JourneyStatusObservationContext = createContext<ReturnType<typeof useJourneyStatusObservation> | null>(null)

export function useJourneyStatusObservationContext() {
  const observation = useContext(JourneyStatusObservationContext)
  if (!observation) throw new Error('Journey status observation is unavailable.')
  return observation
}

export function useJourneyStatusFreshness(): JourneyStatusFreshness {
  return (
    useContext(JourneyStatusFreshnessContext) ?? {
      newerVersionAvailable: false,
      loadingNewerVersion: false,
      loadNewerVersion: () => undefined,
    }
  )
}
