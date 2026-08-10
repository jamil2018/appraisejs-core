'use client'

import { CheckCircle2 } from 'lucide-react'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'

import { approveQualityRequirementsAction } from '../quality-design-actions'

// fallow-ignore-next-line complexity
export function QualityRequirementsReview({
  qualityPlanId,
  revisionId,
  revisionHash,
  revisionStatus,
  approvalBlocked,
}: {
  qualityPlanId: string
  revisionId: string
  revisionHash: string
  revisionStatus: string
  approvalBlocked: boolean
}) {
  const [approvedBy, setApprovedBy] = useState('AppraiseJS reviewer')
  const [isPending, startTransition] = useTransition()
  const canApprove = revisionStatus === 'DRAFT' && !approvalBlocked && !isPending

  return (
    <Card className="border-primary/25 bg-primary/[0.04]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckCircle2 aria-hidden="true" className="size-4 text-primary" />
          Requirements review
        </CardTitle>
        <CardDescription>Approval is bound to the exact immutable revision hash shown below.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-2">
          <Label htmlFor="requirements-approved-by">Approved by</Label>
          <Input
            id="requirements-approved-by"
            onChange={event => setApprovedBy(event.target.value)}
            value={approvedBy}
          />
          <p className="break-all font-mono text-[11px] text-muted-foreground">{revisionHash}</p>
        </div>
        <Button
          disabled={!canApprove}
          onClick={() =>
            startTransition(async () => {
              const response = await approveQualityRequirementsAction({
                qualityPlanId,
                revisionId,
                expectedRevisionHash: revisionHash,
                approvedBy,
              })
              if (response.success)
                toast({
                  title: 'Requirements approved',
                  description: 'The immutable Quality Plan revision is now approved.',
                })
              else
                toast({
                  title: 'Approval failed',
                  description: response.error ?? 'Unable to approve this revision.',
                  variant: 'destructive',
                })
            })
          }
        >
          {isPending ? 'Approving…' : 'Approve requirements'}
        </Button>
      </CardContent>
      {approvalBlocked ? (
        <p className="px-6 pb-6 text-sm text-amber-200">
          Resolve blocking requirement queries before this revision can be approved.
        </p>
      ) : null}
    </Card>
  )
}
