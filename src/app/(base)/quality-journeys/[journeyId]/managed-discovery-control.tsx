'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  requestQualityJourneyExplorerCorrectionAction,
  requestQualityJourneyScoutCorrectionAction,
  createQualityJourneyDiscoveryCorrectionAction,
} from '../quality-journey-managed-discovery-actions'

export function ManagedDiscoveryControl(props: {
  journeyId: string
  stateHash: string
  enabled: boolean
  provider?: 'CODEX' | 'CLAUDE_CODE'
  scoutAccepted?: boolean
  resourceAccepted?: boolean
  correctionReady?: boolean
}) {
  return (
    <div className="space-y-3">
      {props.correctionReady ? (
        <DiscoveryCorrectionControl {...props} />
      ) : (
        <>
          {!props.scoutAccepted ? <DiscoveryCorrectionControl {...props} role="SCOUT" /> : null}
          {!props.resourceAccepted ? <DiscoveryCorrectionControl {...props} role="RESOURCE_EXPLORER" /> : null}
        </>
      )}
      {!props.enabled ? (
        <p className="text-sm text-muted-foreground">
          {props.provider === 'CLAUDE_CODE' ? 'Claude Code' : 'Codex'} is unavailable for this step. Check assistant
          setup on the Journey page.
        </p>
      ) : null}
    </div>
  )
}

function DiscoveryCorrectionControl({
  journeyId,
  stateHash,
  enabled,
  correctionReady,
  role = 'RESOURCE_EXPLORER',
}: {
  journeyId: string
  stateHash: string
  enabled: boolean
  correctionReady?: boolean
  role?: 'SCOUT' | 'RESOURCE_EXPLORER'
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        disabled={!enabled || pending}
        onClick={() =>
          startTransition(async () => {
            try {
              const action = correctionReady
                ? createQualityJourneyDiscoveryCorrectionAction
                : role === 'SCOUT'
                  ? requestQualityJourneyScoutCorrectionAction
                  : requestQualityJourneyExplorerCorrectionAction
              const result = await action({
                journeyId,
                expectedStateHash: stateHash,
              })
              setMessage(
                result.success
                  ? correctionReady
                    ? 'A new Discovery revision is ready. Capture fresh browser evidence, then start the new Discovery work.'
                    : 'The original failed attempt and Scout evidence are preserved. Update the required environment and locator setup, then create a fresh Discovery revision.'
                  : (result.error ?? 'The original attempt still requires reconciliation.'),
              )
            } catch {
              setMessage('The correction response was interrupted. Reload to inspect the assignment before continuing.')
            }
            router.refresh()
          })
        }
      >
        {pending
          ? 'Checking Discovery state…'
          : correctionReady
            ? 'Create fresh Discovery revision'
            : role === 'SCOUT'
              ? 'Reconcile rejected Scout attempt'
              : 'Reconcile rejected Explorer attempt'}
      </Button>
      <p className="text-sm text-muted-foreground">
        For a rejected Discovery attempt. Appraise verifies that the worker finished cleanup or never started, and that
        no output was accepted, before issuing separate work.
      </p>
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </div>
  )
}
