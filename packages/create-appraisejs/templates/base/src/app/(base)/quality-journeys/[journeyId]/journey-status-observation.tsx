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
  isChecking: boolean
  isOutdated: boolean
}

type ObservationControl = {
  inFlight: boolean
  pollDelay: number
  nextAutomaticCheck: number
}

type JourneyStatusFreshness = {
  newerVersionAvailable: boolean
  loadingNewerVersion: boolean
  loadNewerVersion(): void
}

const JourneyStatusFreshnessContext = createContext<JourneyStatusFreshness | null>(null)

function initialState(): ObservationState {
  return {
    snapshot: null,
    isChecking: false,
    isOutdated: false,
  }
}

function initialControl(): ObservationControl {
  return {
    inFlight: false,
    pollDelay: INITIAL_POLL_DELAY_MS,
    nextAutomaticCheck: 0,
  }
}

function mayCheck(control: ObservationControl, manual: boolean): boolean {
  return !control.inFlight && (manual || document.visibilityState === 'visible')
}

function automaticCheckIsDue(control: ObservationControl, manual: boolean): boolean {
  return manual || Date.now() >= control.nextAutomaticCheck
}

async function readSnapshot(journeyId: string, projectId: string): Promise<QualityJourneyStatusSnapshot | null> {
  try {
    const result = await readQualityJourneyStatusAction({ journeyId, projectId })
    const snapshot = result.success ? (result.data as QualityJourneyStatusSnapshot | undefined) : null
    return snapshot?.journeyId === journeyId && snapshot.targetProjectId === projectId ? snapshot : null
  } catch {
    return null
  }
}

function nextPollDelay(control: ObservationControl, snapshot: QualityJourneyStatusSnapshot | null): number {
  return snapshot ? INITIAL_POLL_DELAY_MS : Math.min(control.pollDelay * 2, MAX_POLL_DELAY_MS)
}

function nextState(current: ObservationState, snapshot: QualityJourneyStatusSnapshot | null): ObservationState {
  if (!snapshot || (current.snapshot && snapshot.lifecycle.version < current.snapshot.lifecycle.version))
    return { ...current, isChecking: false, isOutdated: true }
  return {
    snapshot,
    isChecking: false,
    isOutdated: false,
  }
}

type ObservationScope = { journeyId: string; projectId: string; stage: string; version: number }

function useJourneyStatusObservation({ journeyId, projectId, stage, version }: ObservationScope) {
  const [state, setState] = useState(initialState)
  const control = useRef(initialControl())
  const snapshot = state.snapshot && state.snapshot.lifecycle.version >= version ? state.snapshot : null
  const stopped = stage === 'CLOSED' || Boolean(snapshot?.closed)

  const checkForUpdates = useCallback(
    async (manual = false) => {
      if (stopped || !mayCheck(control.current, manual) || !automaticCheckIsDue(control.current, manual)) return

      control.current.inFlight = true
      setState(current => ({ ...current, isChecking: true }))
      const response = await readSnapshot(journeyId, projectId)
      const snapshot = response && response.lifecycle.version >= version ? response : null
      control.current.inFlight = false
      control.current.pollDelay = nextPollDelay(control.current, snapshot)
      control.current.nextAutomaticCheck = Date.now() + control.current.pollDelay
      setState(current => nextState(current, snapshot))
    },
    [journeyId, projectId, stopped, version],
  )

  return {
    ...state,
    snapshot,
    lastCheckedAt: snapshot?.observedAt ?? null,
    automaticPollingStopped: stopped,
    checkForUpdates,
  }
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

type ProviderProps = ObservationScope & { stateHash: string; children: ReactNode }

export function JourneyStatusObservationProvider(props: ProviderProps) {
  return <ScopedJourneyStatusObservation key={JSON.stringify([props.projectId, props.journeyId])} {...props} />
}

function ScopedJourneyStatusObservation({ stateHash, children, ...scope }: ProviderProps) {
  const observation = useJourneyStatusObservation(scope)
  useVisibleJourneyStatusPolling({
    stopped: observation.automaticPollingStopped,
    checkForUpdates: observation.checkForUpdates,
  })
  const router = useRouter()
  const [loadingNewerVersion, startTransition] = useTransition()
  const newerVersionAvailable = Boolean(
    observation.snapshot &&
    (observation.snapshot.lifecycle.version > scope.version || observation.snapshot.lifecycle.stateHash !== stateHash),
  )
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
