import { CheckCircle2, Gauge, XCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

const number = new Intl.NumberFormat('en-US')

export function PlanObservabilityPanel({ detail }: { detail: PlanReviewDetail }) {
  const receipt = detail.lifecycleCertification
  const telemetry = detail.efficiencyTelemetry ?? { retained: 0, phases: [] }
  const passed = receipt?.status === 'passed'
  return (
    <Card aria-labelledby="plan-observability-title">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle id="plan-observability-title" className="flex items-center gap-2 text-base">
            <Gauge className="size-4 text-primary" /> Lifecycle evidence and efficiency
          </CardTitle>
          {receipt ? (
            <Badge variant={passed ? 'default' : 'destructive'} className="gap-1">
              {passed ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
              Certification {receipt.status}
            </Badge>
          ) : (
            <Badge variant="outline">Not yet certified</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {receipt ? (
          <p className="text-muted-foreground">
            Matrix <span className="font-mono text-foreground">{receipt.matrixHash}</span> ·{' '}
            {number.format(receipt.durationMs)} ms · {receipt.recordedAt.toLocaleString()}
          </p>
        ) : null}
        {telemetry.phases.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {telemetry.phases.map(phase => (
              <div key={phase.phase} className="bg-muted/20 rounded-md border p-2.5">
                <p className="font-semibold capitalize">{phase.phase}</p>
                <p className="mt-1 text-muted-foreground">
                  {number.format(phase.durationMs)} ms total · {number.format(phase.waitMs)} ms waiting
                </p>
                <p className="text-muted-foreground">
                  {phase.toolCalls} calls · {phase.retries} retries · {number.format(phase.responseBytes)} response
                  bytes · {number.format(phase.recoveryCost)} recovery cost
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">No retained plan-operation metrics yet.</p>
        )}
        <p className="text-muted-foreground">
          Showing {telemetry.retained} locally retained operation record(s); retention is bounded per plan.
        </p>
      </CardContent>
    </Card>
  )
}
