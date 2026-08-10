// fallow-ignore-file code-duplication
'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'

import {
  reconcileQualityAssessmentAction,
  runQualityAssessmentAction,
  stopQualityAssessmentAction,
} from '../../quality-plans/quality-design-actions'

type AssessmentExecutionControlsProps = {
  assessmentId: string
  status: string
  ready: boolean
  blockers: string[]
  runtimeCells: Array<{
    validationVersionId: string
    resultMatrixCell: string
    environmentId: string
    browserEngine: 'CHROMIUM' | 'FIREFOX' | 'WEBKIT'
  }>
}

function idempotencyKey() {
  return `assessment-run-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`
}

export function AssessmentExecutionControls({
  assessmentId,
  status,
  ready,
  blockers,
  runtimeCells,
}: AssessmentExecutionControlsProps) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()
  const canRun = status === 'READY' && ready
  const canStop = status === 'RUNNING'

  const execute = (title: string, operation: () => Promise<{ success?: boolean; error?: string }>) =>
    startTransition(async () => {
      const response = await operation()
      if (response.success) {
        toast({ title })
        router.refresh()
      } else {
        toast({
          title: `${title} failed`,
          description: response.error ?? 'The Assessment state did not change.',
          variant: 'destructive',
        })
      }
    })

  return (
    <Card className="border-primary/25 bg-primary/[0.04]">
      <CardHeader>
        <CardTitle className="text-base">Managed Assessment execution</CardTitle>
        <CardDescription>
          Run the complete published matrix, stop owned work safely, and reconcile terminal runs into sealed evidence.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {runtimeCells.length} immutable published matrix {runtimeCells.length === 1 ? 'cell' : 'cells'} will run with
          their exact browser and environment bindings.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!canRun || !runtimeCells.length || isPending}
            onClick={() =>
              execute('Assessment execution started', () =>
                runQualityAssessmentAction({
                  assessmentId,
                  idempotencyKey: idempotencyKey(),
                  runtime: { cells: runtimeCells },
                }),
              )
            }
            type="button"
          >
            Run complete matrix
          </Button>
          <Button
            disabled={isPending}
            onClick={() => execute('Assessment reconciled', () => reconcileQualityAssessmentAction({ assessmentId }))}
            type="button"
            variant="outline"
          >
            Reconcile evidence
          </Button>
        </div>
        {canStop ? (
          <div className="flex flex-col gap-2 border-t border-white/[0.08] pt-4 sm:flex-row">
            <Textarea
              aria-label="Stop reason"
              className="min-h-10 flex-1"
              onChange={event => setReason(event.target.value)}
              placeholder="Reason for stopping this Assessment"
              value={reason}
            />
            <Button
              disabled={isPending || !reason.trim()}
              onClick={() =>
                execute('Assessment stop requested', () => stopQualityAssessmentAction({ assessmentId, reason }))
              }
              type="button"
              variant="destructive"
            >
              Stop Assessment
            </Button>
          </div>
        ) : null}
        {!canRun && blockers.length ? (
          <p className="text-sm text-amber-200">Execution is unavailable: {blockers.join(' ')}</p>
        ) : null}
        {status === 'CANCELLED' || status === 'RUNNING' ? (
          <p className="text-sm text-muted-foreground">
            Reconcile again after owned runs reach a terminal state; partial sealed evidence remains visible.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
