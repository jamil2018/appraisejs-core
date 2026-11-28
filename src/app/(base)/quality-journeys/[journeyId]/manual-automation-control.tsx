'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  requestManualAutomationRecoveryAction,
  submitManualAutomationAction,
} from '../quality-journey-operator-actions'

type Props = {
  journeyId: string
  stateHash: string
  recovery: { attemptId: string; failureHash: string; availableAt?: string } | null
  issued: { eventId: string } | null
  choices: unknown
}

const example = JSON.stringify(
  {
    scenarios: [
      {
        scenarioKey: 'scenario-1',
        steps: [{ sourceStepIndex: 0, bindingId: 'binding-1', parameters: [], testData: [], locatorRequirements: [] }],
      },
    ],
  },
  null,
  2,
)

export function ManualAutomationControl({ journeyId, stateHash, recovery, issued, choices }: Props) {
  const { refresh } = useRouter()
  const [pending, startTransition] = useTransition()
  const [eventId, setEventId] = useState(issued?.eventId ?? '')
  const [proposal, setProposal] = useState({ draft: '', reviewed: false })
  const { draft, reviewed } = proposal
  const [message, setMessage] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const currentEventId = issued?.eventId ?? eventId
  function changeDraft(text: string) {
    setProposal({ draft: text, reviewed: false })
  }
  if (recovery?.availableAt && !issued) {
    return (
      <section
        className="flex flex-col items-start gap-3 rounded-lg border p-4"
        aria-labelledby="manual-preparation-title"
      >
        <h2 id="manual-preparation-title" className="font-semibold">
          Manual preparation
        </h2>
        <p className="text-sm text-muted-foreground">
          The approved checks are saved. Manual preparation becomes available when the previous attempt expires.
        </p>
        <Button variant="outline" onClick={() => refresh()}>
          Check availability
        </Button>
      </section>
    )
  }
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4" aria-labelledby="manual-preparation-title">
      <h2 id="manual-preparation-title" className="font-semibold">
        Recover test preparation manually
      </h2>
      <p className="text-sm text-muted-foreground">
        The previous preparation request did not finish. Continue with reviewed mappings below. Execution still requires
        your consent.
      </p>
      {!currentEventId && recovery ? (
        <Button
          disabled={pending || uncertain}
          onClick={() =>
            startTransition(async () => {
              try {
                const result = await requestManualAutomationRecoveryAction({
                  journeyId,
                  expectedStateHash: stateHash,
                  attemptId: recovery.attemptId,
                  expectedFailureHash: recovery.failureHash,
                })
                if (result.success) {
                  setEventId((result.data as { eventId: string }).eventId)
                  setMessage(
                    'Manual recovery is ready. Open Operator preparation below to review and submit your mappings.',
                  )
                } else {
                  setMessage(result.error ?? 'Recovery could not be issued. Reload to inspect its state.')
                  setUncertain(result.status >= 500)
                }
              } catch {
                setMessage('The response was interrupted. Reload to inspect issued recovery before continuing.')
                setUncertain(true)
              }
              refresh()
            })
          }
        >
          {pending ? 'Creating manual recovery…' : 'Create manual preparation recovery'}
        </Button>
      ) : null}
      <details>
        <summary className="cursor-pointer text-sm font-medium">Operator preparation</summary>
        <div className="mt-3 flex flex-col gap-3">
          <details>
            <summary className="cursor-pointer text-sm font-medium">Approved scenarios and available mappings</summary>
            <p className="mt-2 text-sm">
              Use the displayed scenarioKey and bindingId values. Cover every approved step in source order; an action
              may use several operations with the same sourceStepIndex. Supply inputs required by each mapping.
            </p>
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs">
              {JSON.stringify(choices, null, 2)}
            </pre>
          </details>
          {currentEventId ? (
            <form
              className="flex flex-col gap-3"
              action={() => {
                if (!reviewed || pending || uncertain) return
                startTransition(async () => {
                  try {
                    const result = await submitManualAutomationAction({
                      journeyId,
                      recoveryEventId: currentEventId,
                      draftJson: draft,
                    })
                    setMessage(
                      result.success
                        ? 'Tests prepared. Review execution consent before running them.'
                        : (result.error ?? 'Preparation was not accepted. Review the JSON and current state.'),
                    )
                    setUncertain(Boolean(result.success) || result.status >= 500)
                  } catch {
                    setMessage(
                      'The submission response was interrupted. Reload to inspect accepted preparation before submitting again.',
                    )
                    setUncertain(true)
                  }
                  refresh()
                })
              }}
            >
              <Label htmlFor="preparation-file">Load a preparation JSON file (maximum 1 MB)</Label>
              <Input
                id="preparation-file"
                type="file"
                accept=".json,application/json"
                disabled={pending || uncertain}
                onChange={async event => {
                  const file = event.currentTarget.files?.[0]
                  if (!file) return
                  if (file.size > 1_000_000) {
                    setMessage('The JSON file exceeds 1 MB.')
                    return
                  }
                  try {
                    changeDraft(await file.text())
                    setMessage('File loaded. Review the JSON before submission.')
                  } catch {
                    setMessage('The file could not be read. Paste its JSON below.')
                  }
                }}
              />
              <Label htmlFor="preparation-json">Preparation JSON</Label>
              <Textarea
                id="preparation-json"
                rows={14}
                value={draft}
                maxLength={1_000_000}
                disabled={pending || uncertain}
                onChange={event => changeDraft(event.target.value)}
                placeholder={example}
              />
              <details>
                <summary className="cursor-pointer text-sm">JSON format example</summary>
                <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">{example}</pre>
                <p className="text-sm">
                  Replace the example mappings and input arrays with reviewed values from the available mappings.
                </p>
              </details>
              <Label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={reviewed}
                  disabled={!draft.trim() || pending || uncertain}
                  onChange={event => setProposal(current => ({ ...current, reviewed: event.target.checked }))}
                />
                I reviewed these mappings against the approved scenarios.
              </Label>
              <Button type="submit" disabled={!draft.trim() || !reviewed || pending || uncertain}>
                {pending ? 'Submitting preparation…' : 'Submit reviewed preparation'}
              </Button>
            </form>
          ) : null}
        </div>
      </details>
      <details>
        <summary className="cursor-pointer text-sm">Original request evidence</summary>
        <p className="mt-2 text-sm">
          The earlier managed worker request remains UNKNOWN and its evidence is preserved. Manual recovery uses a
          distinct assignment and makes no further AI request.
        </p>
      </details>
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </section>
  )
}
