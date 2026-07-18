import { CircleAlert, CircleCheck, Network } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

export function validationCoverageRows(detail: PlanReviewDetail) {
  return detail.plan.tasks.map(task => {
    const validations = (detail.validation?.validations ?? []).filter(validation =>
      validation.taskIds.includes(task.id),
    )
    const mappings = validations.flatMap(validation =>
      (validation.coverageArgument?.mappings ?? []).filter(mapping => mapping.targetId === task.id),
    )
    const covered = mappings.some(mapping => mapping.state === 'covered')
    return {
      taskId: task.id,
      title: task.title,
      intent: task.validationIntent,
      state: covered ? ('covered' as const) : mappings.length ? ('partial' as const) : ('uncovered' as const),
      validationIds: validations.map(validation => validation.id),
      scenarioIds: [...new Set(mappings.flatMap(mapping => mapping.scenarioIds))],
      stepIds: [...new Set(mappings.flatMap(mapping => [...mapping.stimulusStepIds, ...mapping.observationStepIds]))],
    }
  })
}

export function ValidationCoverageExplorer({ detail }: { detail: PlanReviewDetail }) {
  const rows = validationCoverageRows(detail)
  const preview = detail.exactExecutionPreview
  return (
    <Card aria-labelledby="validation-coverage-title">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle id="validation-coverage-title" className="flex items-center gap-2 text-base">
            <Network className="size-4 text-primary" /> Validation coverage explorer
          </CardTitle>
          <Badge variant="outline">
            {rows.filter(row => row.state === 'covered').length}/{rows.length} tasks covered
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="grid gap-2 md:grid-cols-2">
          {rows.map(row => (
            <div key={row.taskId} className="bg-muted/20 rounded-md border p-2.5">
              <div className="flex items-center gap-2 font-semibold">
                {row.state === 'covered' ? (
                  <CircleCheck className="size-3.5 text-emerald-600" />
                ) : (
                  <CircleAlert className="size-3.5 text-amber-600" />
                )}
                {row.title} <Badge variant="outline">{row.state}</Badge>
              </div>
              <p className="mt-1 text-muted-foreground">{row.intent}</p>
              <p className="mt-1 text-muted-foreground">
                Validations: {row.validationIds.join(', ') || 'none'} · scenarios:{' '}
                {row.scenarioIds.join(', ') || 'none'}
                {' · '}steps: {row.stepIds.join(', ') || 'none'}
              </p>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground">
          Reviewed runtime selection: {preview?.actions.length ?? 0} actions, {preview?.locators.length ?? 0} locators,
          {preview?.scenarios.length ?? 0} scenarios. Uncovered intent blocks readiness until the agent authors an
          explicit mapping and Appraise validates it.
        </p>
      </CardContent>
    </Card>
  )
}
