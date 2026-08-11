'use client'

import { CheckCircle2 } from 'lucide-react'
import { useState, useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'

import { decideQualityAssessmentAction } from '../../quality-plans/quality-design-actions'

type Decision = { decision: string; rationale: string; decidedBy: string; decidedAt: Date; decisionHash: string }

export function AssessmentDecisionReview({
  assessmentId,
  evidenceSetHash,
  canDecide,
  decisions,
}: {
  assessmentId: string
  evidenceSetHash: string
  canDecide: boolean
  decisions: Decision[]
}) {
  const [decision, setDecision] = useState<'accepted' | 'rejected' | 'accepted_with_limitations'>('accepted')
  const [decidedBy, setDecidedBy] = useState('AppraiseJS reviewer')
  const [rationale, setRationale] = useState('')
  const [isPending, startTransition] = useTransition()
  const existing = decisions[0]
  return (
    <Card className="border-primary/25 bg-primary/[0.04]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckCircle2 aria-hidden="true" className="size-4 text-primary" />
          Quality decision
        </CardTitle>
        <CardDescription>
          A decision is hash-bound to the sealed evidence set and can only be recorded once.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {existing ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
            <Badge className="capitalize" variant="outline">
              {existing.decision.toLocaleLowerCase()}
            </Badge>
            <p className="mt-2 text-sm">{existing.rationale}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Recorded by {existing.decidedBy} on {new Date(existing.decidedAt).toLocaleString()}
            </p>
            <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">{existing.decisionHash}</p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="assessment-decision">Decision</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  id="assessment-decision"
                  onChange={event => setDecision(event.target.value as typeof decision)}
                  value={decision}
                >
                  <option value="accepted">Accepted</option>
                  <option value="accepted_with_limitations">Accepted with limitations</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assessment-decided-by">Decided by</Label>
                <Input
                  id="assessment-decided-by"
                  onChange={event => setDecidedBy(event.target.value)}
                  value={decidedBy}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assessment-rationale">Rationale</Label>
              <Textarea
                id="assessment-rationale"
                onChange={event => setRationale(event.target.value)}
                placeholder="Summarize the evidence-based decision..."
                value={rationale}
              />
            </div>
            <p className="break-all font-mono text-[11px] text-muted-foreground">Evidence set: {evidenceSetHash}</p>
            <Button
              disabled={!canDecide || !rationale.trim() || isPending}
              onClick={() =>
                startTransition(async () => {
                  const response = await decideQualityAssessmentAction({
                    assessmentId,
                    expectedEvidenceSetHash: evidenceSetHash,
                    decision,
                    decidedBy,
                    rationale,
                  })
                  if (response.success) toast({ title: 'Quality decision recorded' })
                  else
                    toast({
                      title: 'Decision failed',
                      description: response.error ?? 'Unable to record the decision.',
                      variant: 'destructive',
                    })
                })
              }
            >
              {isPending ? 'Recording…' : 'Record quality decision'}
            </Button>
            {!canDecide ? (
              <p className="text-sm text-amber-200">
                A decision requires current alignment, complete readiness, sealed evidence, and evidence review.
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
