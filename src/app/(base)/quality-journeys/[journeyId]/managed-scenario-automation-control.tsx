'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  startQualityJourneyManagedScenarioAutomationAction,
  recoverQualityJourneyManagedScenarioAutomationAction,
  requestQualityJourneyManagedScenarioCorrectionAction,
} from '../quality-journey-managed-scenario-automation-actions'

function ManagedScenarioAutomationControlContent({
  journeyId,
  stateHash,
  enabled,
  provider = 'CODEX',
  role,
  recovery,
  correction,
}: {
  journeyId: string
  stateHash: string
  enabled: boolean
  provider?: 'CODEX' | 'CLAUDE_CODE'
  role: 'TEST_SCENARIO_DESIGNER' | 'AUTOMATOR'
  recovery?: { attemptId: string; candidateHash: string; detail: string } | null
  correction?: { attemptId: string; failureHash: string; detail: string } | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const consumed = useRef(false)
  const [submitted, setSubmitted] = useState(false)
  return (
    <div className="space-y-2">
      <Button
        disabled={!enabled || pending || submitted}
        onClick={() => {
          if (consumed.current) return
          consumed.current = true
          setSubmitted(true)
          startTransition(async () => {
            try {
              const result = correction
                ? await requestQualityJourneyManagedScenarioCorrectionAction({
                    journeyId,
                    expectedStateHash: stateHash,
                    attemptId: correction.attemptId,
                    expectedFailureHash: correction.failureHash,
                  })
                : recovery
                  ? await recoverQualityJourneyManagedScenarioAutomationAction({
                      journeyId,
                      role,
                      expectedStateHash: stateHash,
                      attemptId: recovery.attemptId,
                      candidateHash: recovery.candidateHash,
                    })
                  : await startQualityJourneyManagedScenarioAutomationAction({
                      journeyId,
                      role,
                      expectedStateHash: stateHash,
                    })
              setMessage(
                result.success && correction
                  ? `A distinct design assignment is ready. Start it with local ${provider === 'CLAUDE_CODE' ? 'Claude Code' : 'Codex'}; the rejected attempt remains preserved.`
                  : result.success
                    ? role === 'TEST_SCENARIO_DESIGNER'
                      ? 'Scenarios received. Review and approve the exact scenarios below.'
                      : 'Tests prepared. Review preparation and execution consent below.'
                    : (result.error ?? 'Preparation needs recovery. Reload to inspect its current state.'),
              )
            } catch {
              setMessage(
                'The preparation response was interrupted. Reload to inspect its current state before taking further action.',
              )
            }
            router.refresh()
          })
        }}
      >
        {pending
          ? 'Preparing…'
          : correction
            ? 'Create corrected design assignment'
            : recovery
              ? 'Recover retained proposal'
              : role === 'TEST_SCENARIO_DESIGNER'
                ? `Design scenarios with local ${provider === 'CLAUDE_CODE' ? 'Claude Code' : 'Codex'}`
                : `Prepare approved tests with local ${provider === 'CLAUDE_CODE' ? 'Claude Code' : 'Codex'}`}
      </Button>
      {correction ? (
        <p className="text-sm text-muted-foreground">
          {correction.detail} This issues a new assignment using the same accepted Discovery. It does not restart the
          rejected attempt.
        </p>
      ) : null}
      {recovery ? (
        <p className="text-sm text-muted-foreground">
          {recovery.detail} Recovery uses the retained proposal without another{' '}
          {provider === 'CLAUDE_CODE' ? 'Claude Code' : 'Codex'} request.
        </p>
      ) : null}
      {!enabled ? (
        <p className="text-sm text-muted-foreground">
          This assistant is unavailable for this step. Check assistant setup on the Journey page.
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Scenarios require your approval. Prepared tests still require execution consent.
      </p>
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </div>
  )
}

export function ManagedScenarioAutomationControl(props: Parameters<typeof ManagedScenarioAutomationControlContent>[0]) {
  return (
    <ManagedScenarioAutomationControlContent
      key={`${props.journeyId}:${props.role}:${props.correction?.failureHash ?? props.recovery?.candidateHash ?? 'start'}`}
      {...props}
    />
  )
}
