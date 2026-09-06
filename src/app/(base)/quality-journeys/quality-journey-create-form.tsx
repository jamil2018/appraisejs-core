'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'

import { createQualityJourneyAction } from './quality-journey-actions'

function actionId(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`
}

function journeyIdFrom(response: Awaited<ReturnType<typeof createQualityJourneyAction>>) {
  const data = response.success ? response.data : undefined
  if (!data || typeof data !== 'object' || !('journeyId' in data)) return null
  return typeof data.journeyId === 'string' ? data.journeyId : null
}

export function QualityJourneyCreateForm({
  projectId,
  predecessorJourneyId,
}: {
  projectId: string
  predecessorJourneyId?: string
}) {
  const { push } = useRouter()
  const [objective, setObjective] = useState('')
  const [context, setContext] = useState('')
  const idempotencyKey = useRef(actionId('quality-journey'))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    setError(null)
    startTransition(async () => {
      const response = await createQualityJourneyAction({
        objective,
        context,
        idempotencyKey: idempotencyKey.current,
        ...(predecessorJourneyId ? { predecessorJourneyId } : {}),
      })
      const journeyId = journeyIdFrom(response)
      if (!journeyId) {
        const message = response.error ?? 'Unable to create this Quality Journey.'
        setError(message)
        toast({ title: 'Journey creation failed', description: message, variant: 'destructive' })
        return
      }
      toast({ title: 'Requirement submitted', description: 'The Journey is ready for its Requirement Analyzer.' })
      push(`/quality-journeys/${journeyId}?project=${encodeURIComponent(projectId)}`)
      idempotencyKey.current = actionId('quality-journey')
    })
  }

  return (
    <Card className="border-primary/25 bg-primary/[0.04]">
      <CardHeader>
        <CardTitle className="text-base">Start a Quality Journey</CardTitle>
        <CardDescription>
          Submit a requirement in the active project. Appraise records the immutable intake before assigning analysis.
          {predecessorJourneyId ? ` Linked follow-up to ${predecessorJourneyId}.` : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="quality-journey-objective">Requirement</Label>
          <Textarea
            id="quality-journey-objective"
            onChange={event => setObjective(event.target.value)}
            placeholder="Describe the outcome, user need, and important behavior to validate."
            value={objective}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quality-journey-context">
            Context or constraints <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="quality-journey-context"
            onChange={event => setContext(event.target.value)}
            placeholder="Known limitations, timelines, or stakeholder context"
            value={context}
          />
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button disabled={isPending || !objective.trim()} onClick={submit} type="button">
          {isPending ? 'Submitting…' : 'Submit requirement'}
        </Button>
      </CardContent>
    </Card>
  )
}
