import { AlertTriangle, CheckCircle2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

export function ValidationAstPreview({ preview }: { preview: NonNullable<PlanReviewDetail['validationAstPreview']> }) {
  const issues = [...preview.blockers, ...preview.warnings]
  return (
    <Card aria-labelledby="validation-ast-preview-title">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="validation-ast-preview-title" className="text-base font-semibold tracking-tight">
              Validation AST review preview
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Proposed scenarios and assertions captured before compilation.
            </p>
          </div>
          <Badge variant={preview.valid ? 'default' : 'destructive'}>
            {preview.valid ? 'Ready to compile' : 'Blocked'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="font-medium">{preview.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{preview.purpose}</p>
          <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">Receipt {preview.receiptHash}</p>
        </div>
        {issues.length > 0 ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3" role="alert">
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="size-4" /> Semantic review notes
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {issues.map(issue => (
                <li key={`${issue.code}:${issue.scenarioId ?? ''}:${issue.stepId ?? ''}`}>{issue.message}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-4" /> No compiler or semantic warnings.
          </div>
        )}
        <div className="space-y-3">
          {preview.scenarios.map(scenario => (
            <details key={scenario.id} className="rounded-md border p-3" open={preview.scenarios.length === 1}>
              <summary className="cursor-pointer text-sm font-medium">
                {scenario.title} <span className="text-muted-foreground">({scenario.steps.length} steps)</span>
              </summary>
              <ol className="mt-3 space-y-2">
                {scenario.steps.map(step => (
                  <li key={step.id} className="grid gap-1 text-xs md:grid-cols-[4rem_minmax(0,1fr)]">
                    <span className="font-mono font-medium">{step.keyword}</span>
                    <div className="min-w-0">
                      <p>{step.description}</p>
                      <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">
                        {step.actionId} · {step.id}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </details>
          ))}
        </div>
        {preview.coverage.length > 0 ? (
          <div>
            <p className="text-sm font-medium">Coverage claims</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {preview.coverage.map(mapping => (
                <li key={`${mapping.kind}:${mapping.targetId}`}>
                  <Badge variant={mapping.state === 'covered' ? 'secondary' : 'outline'}>
                    {mapping.targetId}: {mapping.state}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
