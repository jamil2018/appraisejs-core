import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PlanReviewDetail } from '@/services/plan-review/plan-review-service'

export function ExactExecutionPreview({
  preview,
}: {
  preview: NonNullable<PlanReviewDetail['exactExecutionPreview']>
}) {
  return (
    <Card aria-labelledby="exact-execution-preview-title">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle id="exact-execution-preview-title" className="text-base">
            Exact validation and execution preview
          </CardTitle>
          <Badge variant="outline">{preview.phase.replaceAll('_', ' ')}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        <dl className="grid gap-2 md:grid-cols-2">
          {Object.entries(preview.hashes).map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-md border p-2">
              <dt className="font-medium capitalize text-muted-foreground">{label.replaceAll(/([A-Z])/g, ' $1')}</dt>
              <dd className="mt-1 break-all font-mono">{value ?? 'Not available'}</dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-3 lg:grid-cols-2">
          <PreviewList
            title="Selected actions"
            values={preview.actions.map(action => `${action.id}@${action.version}`)}
          />
          <PreviewList
            title="Selected locators"
            values={preview.locators.map(locator => `${locator.id}@${locator.version}`)}
          />
          <PreviewList
            title="Scenarios"
            values={preview.scenarios.map(scenario => `${scenario.scenarioId} (${scenario.stepIds.length} steps)`)}
          />
          <PreviewList
            title="Runtime matrix"
            values={preview.matrix.map(entry => `${entry.browser} / ${entry.environment}`)}
          />
        </div>
        <div>
          <p className="font-medium">Canonical Gherkin projection</p>
          <pre className="bg-muted/30 mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border p-3 font-mono text-[11px]">
            {preview.gherkin.join('\n\n')}
          </pre>
        </div>
      </CardContent>
    </Card>
  )
}

function PreviewList({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="rounded-md border p-3">
      <p className="font-medium">{title}</p>
      {values.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-4 font-mono text-muted-foreground">
          {values.map(value => (
            <li key={value}>{value}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-muted-foreground">None selected.</p>
      )}
    </div>
  )
}
