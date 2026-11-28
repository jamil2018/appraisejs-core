'use client'

import { Check, CircleAlert, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { journeyStageName, journeyStages } from '@/lib/quality-journey/journey-stages'
import { cn } from '@/lib/utils'
import { useJourneyStatusFreshness, useJourneyStatusObservationContext } from './journey-status-observation'

export function JourneyStages({ stage }: { stage: string }) {
  const { snapshot } = useJourneyStatusObservationContext()
  const current = journeyStages.indexOf(journeyStageName(snapshot?.lifecycle.stage ?? stage))
  return (
    <ol aria-label="Journey stages" className="grid grid-cols-4 gap-1 sm:gap-2">
      {journeyStages.map((label, index) => (
        <li
          aria-current={index === current ? 'step' : undefined}
          aria-label={index < current ? `${label}, complete` : undefined}
          key={label}
          className={cn(
            'flex min-w-0 items-center gap-2 border-t-2 px-0.5 py-2 text-xs leading-4 sm:px-1 sm:text-sm',
            index === current
              ? 'border-info font-semibold text-info'
              : index < current
                ? 'border-success-border text-secondary-foreground'
                : 'border-border text-muted-foreground',
          )}
        >
          {index < current ? (
            <Check aria-hidden="true" className="hidden size-3.5 shrink-0 text-success sm:block" />
          ) : null}
          {label}
        </li>
      ))}
    </ol>
  )
}

type Activity = {
  stage: string
  revision: boolean
  readyToRun: boolean
  analyzingEnabled: boolean
  reviewing: boolean
  status: string
  legacy: boolean
  question: boolean
  discoveryCaptureStatus?: string | null
  awaitingTestPlan?: boolean
  awaitingReportReview?: boolean
  executionActivity?: string
  blocked: boolean
  consent: boolean
  lastEvent?: string
  lastEventAt?: string
}

const agentSetupLabel = 'The selected assistant needs setup'

function activityLabel(state: Activity, runtime?: string | null, role?: string, inspecting?: string) {
  if (state.status === 'CLOSED' || state.stage === 'CLOSED') return 'Journey complete'
  if (state.status === 'PAUSED') return 'Paused by the user'
  if (state.legacy) return 'Ready to continue this journey in Appraise'
  if (state.stage === 'AUTOMATION' && state.awaitingTestPlan) return 'Waiting for a reviewed test plan'
  if (state.stage === 'TRIAGE' && state.awaitingReportReview) return 'Test run complete. Review the results.'
  if (runtime === 'RECOVERY') {
    if (state.stage === 'AUTOMATION') return 'Test preparation stopped before the checks were ready.'
    if (state.stage === 'TRIAGE') return 'The tests finished. The results report couldn’t be saved.'
    return 'Agent stalled. Recovery is needed to continue.'
  }
  if (state.blocked) return 'Action needed to continue'
  if (state.question) return 'Waiting for your answer'
  if (state.stage === 'DISCOVERY') {
    switch (state.discoveryCaptureStatus) {
      case 'INSPECTING':
        return 'Inspecting the approved page'
      case 'MANUAL_REQUIRED':
        return 'Choose a page or complete sign-in to continue inspection'
      case 'RECOVERY_REQUIRED':
        return 'Page inspection was interrupted'
      case 'READY':
        return 'Waiting to inspect the approved page'
    }
  }
  if (state.consent) return 'Waiting for permission to run tests'
  if (state.executionActivity) return state.executionActivity
  if (state.readyToRun) return 'Tests ready to run'
  if (state.stage === 'ANALYSIS_REVIEW' && state.reviewing) return 'Ready to review acceptance criteria'
  if (state.stage === 'SCENARIO_REVIEW') return 'Ready to review scenarios'
  if (state.stage === 'REPORT_REVIEW') return 'Ready to review results'
  if (runtime === 'RUNNING') {
    if (state.stage === 'ANALYSIS' && inspecting) return inspecting
    const work: Record<string, string> = {
      ANALYSIS: state.revision ? 'Revising acceptance criteria' : 'Working on acceptance criteria',
      DISCOVERY:
        role === 'RESOURCE_EXPLORER' ? 'Checking reusable test steps and locators' : 'Reviewing captured page evidence',
      SCENARIO_DESIGN: 'Designing test scenarios',
      AUTOMATION: 'Preparing tests',
      TRIAGE: 'Reviewing test evidence',
    }
    return work[state.stage] ?? 'Agent working'
  }
  if (
    !state.analyzingEnabled &&
    ['ANALYSIS', 'DISCOVERY', 'SCENARIO_DESIGN', 'AUTOMATION', 'TRIAGE'].includes(state.stage)
  )
    return agentSetupLabel
  if (state.stage === 'EXECUTION') return 'Check the test run below'
  if (runtime === 'BLOCKED') return 'Waiting for the agent to become available'
  if (runtime === 'UNOBSERVED') return 'Waiting for a confirmed start'
  return 'Waiting for agent'
}

export function JourneyActivity(props: Activity) {
  const { snapshot, isOutdated } = useJourneyStatusObservationContext()
  const { newerVersionAvailable, loadingNewerVersion, loadNewerVersion } = useJourneyStatusFreshness()
  const activity = snapshot?.activity
  const effectiveStatus = snapshot?.lifecycle.status ?? props.status
  const currentState =
    snapshot && newerVersionAvailable
      ? {
          ...props,
          stage: snapshot.lifecycle.stage,
          status: effectiveStatus,
          legacy: snapshot.runtimeStatus === null && !snapshot.closed,
          blocked: Boolean(snapshot.attention.activeBlockers.length),
          question: snapshot.attention.unresolvedQuestionCount > 0,
          consent: Boolean(snapshot.attention.awaitingExecutionConsent),
          readyToRun: false,
          executionActivity: undefined,
          reviewing: Boolean(snapshot.lifecycle.analysisReviewHash),
          revision: Boolean(snapshot.lifecycle.activeRevisionIds.analysis),
          analyzingEnabled: props.stage === snapshot.lifecycle.stage ? props.analyzingEnabled : true,
        }
      : { ...props, status: effectiveStatus }
  const interrupted = isOutdated || (props.status !== 'PAUSED' && snapshot?.runtimeStatus === 'RECOVERY')
  const inspecting =
    activity?.phase?.kind === 'INSPECTING'
      ? activity.phase.path && activity.phase.path !== '/'
        ? `Inspecting ${activity.phase.path}`
        : 'Inspecting the connected app'
      : undefined
  const lastTime = activity?.completedAt ?? activity?.phase?.at ?? activity?.startedAt ?? props.lastEventAt
  const activityNames: Record<string, string> = {
    REQUIREMENT_ANALYZER: props.revision ? 'criteria revision' : 'requirements analysis',
    SCOUT: 'page inspection review',
    RESOURCE_EXPLORER: 'project resource review',
    TEST_SCENARIO_DESIGNER: 'scenario design',
    AUTOMATOR: 'test preparation',
    TRIAGER: 'test evidence review',
  }
  const lastLabel = activity
    ? (inspecting ?? activityNames[activity.role])
    : props.lastEvent?.replaceAll('_', ' ').toLowerCase()
  const stalled = effectiveStatus === 'ACTIVE' && snapshot?.runtimeStatus === 'RECOVERY' && !isOutdated
  const working =
    effectiveStatus === 'ACTIVE' &&
    !interrupted &&
    !currentState.awaitingReportReview &&
    !currentState.awaitingTestPlan &&
    activity?.running
  const complete = currentState.status === 'CLOSED' || currentState.stage === 'CLOSED'
  const message =
    isOutdated && effectiveStatus !== 'PAUSED'
      ? 'Connection interrupted. Current agent activity is unknown.'
      : stalled && activity?.criteriaSubmissionInterrupted
        ? 'Agent stalled while submitting acceptance criteria'
        : activityLabel(
            currentState,
            snapshot?.runtimeStatus === 'RECOVERY'
              ? 'RECOVERY'
              : activity?.running
                ? 'RUNNING'
                : snapshot?.runtimeStatus,
            activity?.role,
            inspecting,
          )
  const needsAttention =
    isOutdated ||
    message === agentSetupLabel ||
    (!complete &&
      (stalled ||
        currentState.status === 'PAUSED' ||
        currentState.blocked ||
        currentState.question ||
        currentState.consent ||
        ['MANUAL_REQUIRED', 'RECOVERY_REQUIRED'].includes(currentState.discoveryCaptureStatus ?? '')))

  return (
    <div className="space-y-2">
      <div
        role="status"
        className={cn('flex items-center gap-2 text-base font-medium', needsAttention && 'text-warning')}
      >
        {needsAttention ? (
          <CircleAlert aria-hidden="true" className="size-5 shrink-0 text-warning" />
        ) : complete ? (
          <Check aria-hidden="true" className="size-5 shrink-0 text-success" />
        ) : working ? (
          <LoaderCircle aria-hidden="true" className="size-5 shrink-0 text-info motion-safe:animate-spin" />
        ) : (
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-info" />
        )}
        {message}
      </div>
      {stalled && activity?.criteriaSubmissionInterrupted ? (
        <p className="text-sm">
          Appraise couldn’t confirm the revised criteria were saved. Approval is unavailable until the submission is
          recovered.
        </p>
      ) : null}
      {interrupted && lastLabel && lastTime ? (
        <p className="text-sm text-muted-foreground">
          Last recorded: {lastLabel} ·{' '}
          <time suppressHydrationWarning dateTime={lastTime}>
            {new Date(lastTime).toLocaleString()}
          </time>
        </p>
      ) : null}
      {newerVersionAvailable ? (
        <Button
          variant="outline"
          className="border-info-border text-info"
          size="sm"
          disabled={loadingNewerVersion}
          onClick={loadNewerVersion}
        >
          View update
        </Button>
      ) : null}
    </div>
  )
}
