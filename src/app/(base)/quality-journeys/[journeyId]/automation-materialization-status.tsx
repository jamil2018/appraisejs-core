import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type AutomationContext = {
  inputHash: string
  inputHashes: string[]
  scopeHash: string | null
  portfolioRevisionId: string | null
  scenarioRevisionIds: string[]
  materializations: Array<{
    scenarioRevisionId: string
    status: string
    suiteId: string | null
    testCaseId: string | null
    preparedCapsule: { id: string; status: string } | null
    failureKind?: string | null
    failureJson?: string | null
  }>
}

/** Read-only Phase 6 projection. Materialization is worker-authorized and is
 * deliberately performed through the leased MCP/HTTP ingress, never a browser
 * button that could manufacture an owner token. */
export function AutomationMaterializationStatus({ context }: { context: AutomationContext | null }) {
  if (!context)
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Test preparation</CardTitle>
          <CardDescription>Waiting for approved test scenarios before preparation can begin.</CardDescription>
        </CardHeader>
      </Card>
    )
  const successful = context.materializations.filter(
    item => item.status === 'MATERIALIZED' && item.preparedCapsule?.status === 'PREPARED',
  )
  const materialized = new Set(successful.map(item => item.scenarioRevisionId))
  const failures = context.materializations.filter(item => item.status === 'FAILED')
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Test preparation</CardTitle>
        <CardDescription>
          This shows what is ready to run and what still needs attention. Starting tests remains a separate action.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <details className="text-muted-foreground">
          <summary className="cursor-pointer text-xs">Technical details</summary>
          {context.inputHashes.length <= 1 ? (
            <p className="mt-1 break-all font-mono text-[11px]">Input: {context.inputHash}</p>
          ) : (
            <p className="mt-1 break-all font-mono text-[11px]">Historical inputs: {context.inputHashes.join(', ')}</p>
          )}
        </details>
        {context.scenarioRevisionIds.map(scenarioRevisionId => {
          const item = context.materializations.find(candidate => candidate.scenarioRevisionId === scenarioRevisionId)
          return (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              key={scenarioRevisionId}
            >
              <span className="text-sm">Scenario {context.scenarioRevisionIds.indexOf(scenarioRevisionId) + 1}</span>
              <Badge variant={item ? 'default' : 'outline'}>{item ? item.status : 'Awaiting Automator'}</Badge>
              {item?.preparedCapsule ? (
                <span className="text-xs text-muted-foreground">Prepared capsule only</span>
              ) : null}
              {item?.status === 'FAILED' ? (
                <span className="text-xs text-destructive">
                  {item.failureKind ?? 'AUTOMATION_ERROR'}: repair and retry
                </span>
              ) : null}
            </div>
          )
        })}
        <p className="text-xs text-muted-foreground">
          {materialized.size}/{context.scenarioRevisionIds.length} approved scenarios materialized. No TestRun has been
          created.
        </p>
        {failures.length ? (
          <p className="text-xs text-destructive">
            {failures.length} failed materialization{failures.length === 1 ? '' : 's'}{' '}
            {failures.length === 1 ? 'remains' : 'remain'} visible and {failures.length === 1 ? 'is' : 'are'} not
            counted as prepared.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
