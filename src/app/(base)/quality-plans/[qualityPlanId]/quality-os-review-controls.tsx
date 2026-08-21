'use client'

import { useState, useTransition } from 'react'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ActionResponse } from '@/types/form/actionHandler'
import { decideRequirementAnalysisAction, decideValidationDesignAction } from '../quality-design-actions'

type ReviewArtifact = {
  id: string
  decision: string
  contentHash: string
  proposal: unknown
  critique: unknown
}

// fallow-ignore-next-line complexity -- this card owns its bounded review submission state machine.
function ReviewCard({
  artifact,
  kind,
  qualityPlanId,
}: {
  artifact: ReviewArtifact | null
  kind: 'requirement analysis' | 'validation design'
  qualityPlanId: string
}) {
  const [reviewer, setReviewer] = useState('AppraiseJS reviewer')
  const [rationale, setRationale] = useState('Reviewed against the displayed immutable artifact and critique.')
  const [isPending, startTransition] = useTransition()
  const decide = kind === 'requirement analysis' ? decideRequirementAnalysisAction : decideValidationDesignAction

  function submit(decision: 'APPROVED' | 'NEEDS_REVISION' | 'REJECTED') {
    if (!artifact) return
    startTransition(async () => {
      const response: ActionResponse = await decide({
        qualityPlanId,
        artifactId: artifact.id,
        expectedContentHash: artifact.contentHash,
        decision,
        decidedBy: reviewer,
        rationale,
      })
      toast({
        title: response.success ? `${kind} decision recorded` : `${kind} decision failed`,
        description: response.success ? undefined : response.error,
        variant: response.success ? 'default' : 'destructive',
      })
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="capitalize">{kind} review</CardTitle>
        <CardDescription>
          Review the agent-authored artifact, provenance, and deterministic critique before recording an exact-hash
          decision.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!artifact ? (
          <p className="text-sm text-muted-foreground">No {kind} has been proposed yet.</p>
        ) : (
          <>
            <pre className="bg-muted/30 max-h-96 overflow-auto rounded-md border p-3 text-xs">
              {JSON.stringify({ proposal: artifact.proposal, critique: artifact.critique }, null, 2)}
            </pre>
            <p className="break-all font-mono text-[11px] text-muted-foreground">{artifact.contentHash}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`${kind}-reviewer`}>Reviewer</Label>
                <Input id={`${kind}-reviewer`} onChange={event => setReviewer(event.target.value)} value={reviewer} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${kind}-rationale`}>Decision rationale</Label>
                <Textarea
                  id={`${kind}-rationale`}
                  onChange={event => setRationale(event.target.value)}
                  value={rationale}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={isPending || artifact.decision !== 'PENDING'} onClick={() => submit('APPROVED')}>
                Approve exact artifact
              </Button>
              <Button
                disabled={isPending || artifact.decision !== 'PENDING'}
                onClick={() => submit('NEEDS_REVISION')}
                variant="outline"
              >
                Request revision
              </Button>
              <Button
                disabled={isPending || artifact.decision !== 'PENDING'}
                onClick={() => submit('REJECTED')}
                variant="destructive"
              >
                Reject
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function QualityOsReviewControls({
  analysis,
  design,
  qualityPlanId,
}: {
  analysis: ReviewArtifact | null
  design: ReviewArtifact | null
  qualityPlanId: string
}) {
  return (
    <section className="grid gap-6 xl:grid-cols-2" aria-label="Quality operating system reviews">
      <ReviewCard artifact={analysis} kind="requirement analysis" qualityPlanId={qualityPlanId} />
      <ReviewCard artifact={design} kind="validation design" qualityPlanId={qualityPlanId} />
    </section>
  )
}
