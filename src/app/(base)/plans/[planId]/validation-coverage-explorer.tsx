import { CircleAlert, CircleCheck, Network } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

function mappingStepIds(mapping: { observationStepIds: string[]; stimulusStepIds?: string[] }) {
  return [...(Array.isArray(mapping.stimulusStepIds) ? mapping.stimulusStepIds : []), ...mapping.observationStepIds]
}

function validationCoverageRow(detail: PlanReviewDetail, task: PlanReviewDetail['plan']['tasks'][number]) {
  const validations = (detail.validation?.validations ?? []).filter(validation => validation.taskIds.includes(task.id))
  const mappings = validations.flatMap(validation =>
    (validation.coverageArgument?.mappings ?? []).filter(mapping => mapping.targetId === task.id),
  )
  const previewMappings = (detail.validationAstPreview?.coverage ?? []).filter(
    mapping => mapping.kind === 'task' && mapping.targetId === task.id,
  )
  const effectiveMappings = mappings.length ? mappings : previewMappings
  const covered = effectiveMappings.some(mapping => mapping.state === 'covered')
  const state = covered
    ? ('covered' as const)
    : effectiveMappings.length
      ? ('partial' as const)
      : ('uncovered' as const)
  const validationIds = validations.length
    ? validations.map(validation => validation.id)
    : previewMappings.map(() => detail.validationAstPreview!.astId).slice(0, 1)
  return {
    taskId: task.id,
    title: task.title,
    intent: task.validationIntent,
    state,
    validationIds,
    scenarioIds: [...new Set(effectiveMappings.flatMap(mapping => mapping.scenarioIds))],
    stepIds: [...new Set(effectiveMappings.flatMap(mappingStepIds))],
  }
}

export function validationCoverageRows(detail: PlanReviewDetail) {
  return detail.plan.tasks.map(task => validationCoverageRow(detail, task))
}

export function ValidationCoverageExplorer({ detail }: { detail: PlanReviewDetail }) {
  const rows = validationCoverageRows(detail)
  const preview = detail.exactExecutionPreview
  const uncoveredCount = rows.filter(row => row.state !== 'covered').length
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
          Reviewed runtime selection: {preview?.operations.length ?? 0} operations, {preview?.locators.length ?? 0}{' '}
          locators, {preview?.scenarios.length ?? detail.validationAstPreview?.scenarios.length ?? 0} scenarios.{' '}
          {uncoveredCount
            ? 'Uncovered intent blocks readiness until the agent authors an explicit mapping and Appraise validates it.'
            : detail.validation?.validations.length
              ? 'Every task is covered by the published validation mapping.'
              : 'Every task is covered by the validated AST preview; publish it to create the managed validation.'}
        </p>
      </CardContent>
    </Card>
  )
}
