'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { operatorTriage } from '@/services/coordinator/app-managed-triage-service'
import type { OperatorFinding } from '@/services/coordinator/app-managed-operator-triage'
import { previewOperatorTriageAction, saveOperatorTriageAction } from '../quality-journey-operator-actions'

type Preview = Awaited<ReturnType<typeof operatorTriage>>
const kinds: Array<[OperatorFinding['kind'], string]> = [
  ['INCONCLUSIVE', 'Inconclusive'],
  ['TARGET_DEFECT', 'Target defect'],
  ['VALIDATION_REALIZATION_DEFECT', 'Test preparation defect'],
  ['APPRAISE_RUNTIME_DEFECT', 'Appraise runtime defect'],
  ['ENVIRONMENT_OR_DATA_DEFECT', 'Environment or data defect'],
]

function RunReview({
  run,
  finding,
  onChange,
}: {
  run: Preview['runs'][number]
  finding?: OperatorFinding
  onChange: (value: OperatorFinding) => void
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">
        {run.title}: {run.passed ? 'Passed' : 'Needs review'}
      </legend>
      <details>
        <summary className="cursor-pointer text-sm">Sealed evidence and test steps</summary>
        <dl className="mt-2 break-words text-xs">
          <dt>Run</dt>
          <dd>{run.testRunId}</dd>
          <dt>Evidence receipt</dt>
          <dd>{run.evidenceReceiptId}</dd>
        </dl>
        <ol className="mt-2 list-decimal pl-5 text-sm">
          {run.steps.map((step, index) => (
            // Frozen report steps never reorder; repeated step names require their original source position.
            <li key={`${index}:${step.name}`}>
              <p>
                {step.name}: {step.status}
              </p>
              {step.error ? <pre className="whitespace-pre-wrap break-words text-xs">{step.error}</pre> : null}
            </li>
          ))}
        </ol>
      </details>
      {finding ? (
        <>
          <Label htmlFor={`finding-kind-${run.testRunId}`}>Attribution</Label>
          <Select
            value={finding.kind}
            onValueChange={kind => onChange({ ...finding, kind: kind as OperatorFinding['kind'] })}
          >
            <SelectTrigger id={`finding-kind-${run.testRunId}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {kinds.map(([value, label]) => (
                  <SelectItem
                    key={value}
                    value={value}
                    disabled={value === 'TARGET_DEFECT' && !run.canAttributeTargetFailure}
                  >
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {!run.canAttributeTargetFailure ? (
            <p className="text-sm text-muted-foreground">
              This evidence cannot establish a target defect. Record the uncertainty or the relevant preparation,
              runtime, or environment issue.
            </p>
          ) : null}
          {(['observation', 'expectation', 'nextAction'] as const).map(key => (
            <div key={key} className="flex flex-col gap-2">
              <Label htmlFor={`${key}-${run.testRunId}`}>
                {key === 'observation' ? 'What happened' : key === 'expectation' ? 'Expected behavior' : 'Next action'}
              </Label>
              <Textarea
                id={`${key}-${run.testRunId}`}
                value={finding[key]}
                required
                maxLength={2000}
                onChange={event => onChange({ ...finding, [key]: event.target.value })}
              />
            </div>
          ))}
        </>
      ) : null}
    </fieldset>
  )
}

export function OperatorTriageControl({ journeyId, stateHash }: { journeyId: string; stateHash: string }) {
  const { refresh } = useRouter()
  const [pending, startTransition] = useTransition()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [findings, setFindings] = useState<OperatorFinding[]>([])
  const [message, setMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4" aria-labelledby="operator-report-title">
      <h2 id="operator-report-title" className="font-semibold">
        Review results and prepare the report
      </h2>
      <p className="text-sm text-muted-foreground">
        Review sealed test evidence and describe each result that needs attention. Saving creates a report for your
        separate approval; it does not close the Journey.
      </p>
      {!preview ? (
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                const result = await previewOperatorTriageAction({ journeyId, expectedStateHash: stateHash })
                if (result.success) {
                  const data = result.data as Preview
                  setPreview(data)
                  setFindings(
                    data.runs.flatMap(run =>
                      run.passed
                        ? []
                        : [
                            {
                              testRunId: run.testRunId,
                              kind: 'INCONCLUSIVE',
                              observation: '',
                              expectation: '',
                              nextAction: '',
                            },
                          ],
                    ),
                  )
                  setMessage('Evidence loaded. Review every result before saving the report.')
                } else setMessage(result.error ?? 'Evidence could not be loaded. Reload to inspect its state.')
              } catch {
                setMessage('The evidence response was interrupted. Reload before continuing.')
              }
            })
          }
        >
          {pending ? 'Loading sealed evidence…' : 'Review sealed run evidence'}
        </Button>
      ) : (
        <form
          className="flex flex-col gap-3"
          action={() => {
            if (pending || submitted) return
            startTransition(async () => {
              try {
                const result = await saveOperatorTriageAction({
                  journeyId,
                  expectedStateHash: preview.expectedStateHash,
                  inputHash: preview.inputHash,
                  findings,
                })
                setMessage(
                  result.success
                    ? 'Report saved. Review the exact report below before approving or closing the Journey.'
                    : (result.error ?? 'Report was not saved. Review your findings and current evidence.'),
                )
                setSubmitted(Boolean(result.success) || result.status >= 500)
              } catch {
                setMessage('The save response was interrupted. Reload to inspect accepted reports before saving again.')
                setSubmitted(true)
              }
              refresh()
            })
          }}
        >
          <fieldset disabled={pending || submitted} className="flex min-w-0 flex-col gap-3">
            {preview.runs.map(run => (
              <RunReview
                key={run.testRunId}
                run={run}
                finding={findings.find(finding => finding.testRunId === run.testRunId)}
                onChange={value =>
                  setFindings(current => current.map(row => (row.testRunId === value.testRunId ? value : row)))
                }
              />
            ))}
            {!findings.length ? (
              <p className="text-sm">
                All assigned runs passed with sealed evidence. The report will retain their requirement coverage.
              </p>
            ) : null}
            <Button
              type="submit"
              disabled={
                pending ||
                submitted ||
                findings.some(
                  finding => !finding.observation.trim() || !finding.expectation.trim() || !finding.nextAction.trim(),
                )
              }
            >
              {pending ? 'Saving report…' : 'Save reviewed report'}
            </Button>
          </fieldset>
        </form>
      )}
      {message ? (
        <p role="status" className="text-sm">
          {message}
        </p>
      ) : null}
    </section>
  )
}
