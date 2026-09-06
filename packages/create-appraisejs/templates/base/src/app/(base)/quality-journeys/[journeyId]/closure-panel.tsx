'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import type { getQualityJourneyClosure } from '@/services/coordinator/quality-journey-closure-service'
import { closeQualityJourneyAction } from './closure-actions'

type Props = { journeyId: string; stateHash: string; closure: Awaited<ReturnType<typeof getQualityJourneyClosure>> }

export function ClosurePanel({ journeyId, stateHash, closure }: Props) {
  const [rationale, setRationale] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const key = useRef(crypto.randomUUID())
  const { refresh } = useRouter()
  const risk = closure.unresolvedItems.length > 0
  function close() {
    setError(null)
    startTransition(async () => {
      const response = await closeQualityJourneyAction({
        journeyId,
        expectedStateHash: stateHash,
        reportRevisionId: closure.reportRevisionId,
        expectedReportHash: closure.reportHash,
        idempotencyKey: key.current,
        decision: risk ? 'RISK_ACCEPTED' : 'CLOSED',
        ...(risk ? { rationale, acceptedItemIds: closure.unresolvedItems.map(item => item.itemId) } : {}),
      })
      if (!response.success) {
        setError(response.error ?? 'Unable to close this journey.')
        return
      }
      refresh()
    })
  }
  if (!closure.reportRevisionId && !closure.receipt) return null
  return (
    <Card aria-label="Terminal journey review">
      <CardHeader>
        <CardTitle>{closure.receipt ? 'Journey closed' : 'Terminal report review'}</CardTitle>
        <CardDescription>
          {closure.receipt
            ? 'The closure receipt and historical artifacts remain available.'
            : 'Approve this exact report to end the journey. Further work requires a new journey.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <ReportReference closure={closure} />
        {closure.receipt ? <ClosureReceipt closure={closure} /> : null}
        <UnresolvedItems items={closure.unresolvedItems} />
        {!closure.receipt ? (
          <ClosureDecisionForm
            blockers={closure.blockers}
            risk={risk}
            rationale={rationale}
            accepted={accepted}
            pending={pending}
            onRationale={setRationale}
            onAccepted={setAccepted}
            onClose={close}
          />
        ) : null}
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function ReportReference({ closure }: Pick<Props, 'closure'>) {
  return (
    <p className="break-all">
      Report: {closure.reportRevisionId} · {closure.reportHash}
    </p>
  )
}
function ClosureReceipt({ closure }: Pick<Props, 'closure'>) {
  const receipt = closure.receipt!
  return (
    <>
      <p>
        {receipt.decision === 'RISK_ACCEPTED'
          ? 'Closed with explicit risk acceptance'
          : 'Closed without unresolved items'}
      </p>
      <p>
        Recorded by local user possession ({receipt.actorId}) on {receipt.closedAt}.
      </p>
      <p className="break-all">
        Receipt: {receipt.closureId} · {closure.contentHash}
      </p>
      {receipt.riskAcceptance ? <p>Rationale: {receipt.riskAcceptance.rationale}</p> : null}
    </>
  )
}
function UnresolvedItems({ items }: { items: Props['closure']['unresolvedItems'] }) {
  return items.length ? (
    <section aria-label="Known failures and limitations">
      <h3 className="font-medium">Known failures and limitations</h3>
      <ul className="mt-2 list-disc space-y-2 pl-5">
        {items.map(item => (
          <li key={item.itemId}>{item.summary}</li>
        ))}
      </ul>
    </section>
  ) : (
    <p>No unresolved report items.</p>
  )
}
function ClosureDecisionForm({
  blockers,
  risk,
  rationale,
  accepted,
  pending,
  onRationale,
  onAccepted,
  onClose,
}: {
  blockers: string[]
  risk: boolean
  rationale: string
  accepted: boolean
  pending: boolean
  onRationale(value: string): void
  onAccepted(value: boolean): void
  onClose(): void
}) {
  const disabled = pending || blockers.length > 0 || (risk && (!accepted || !rationale.trim()))
  return (
    <>
      <Blockers messages={blockers} />
      {risk ? (
        <>
          <label className="block font-medium" htmlFor="closure-rationale">
            Risk acceptance rationale
          </label>
          <Textarea id="closure-rationale" value={rationale} onChange={event => onRationale(event.target.value)} />
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={accepted} onChange={event => onAccepted(event.target.checked)} />I accept
            every listed failure and limitation for this exact report.
          </label>
        </>
      ) : null}
      <p className="text-xs text-muted-foreground">
        This decision records local user possession; it does not identify an authenticated account.
      </p>
      <Button onClick={onClose} disabled={disabled}>
        {risk ? 'Accept risks and close journey' : 'Approve report and close journey'}
      </Button>
    </>
  )
}
function Blockers({ messages }: { messages: string[] }) {
  return messages.length ? (
    <ul className="space-y-1 text-amber-200">
      {messages.map(message => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  ) : null
}
