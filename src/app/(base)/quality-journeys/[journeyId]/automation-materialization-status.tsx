import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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
    <section aria-label="Test preparation" className="space-y-2">
      <p className="text-sm">
        {materialized.size} of {context.scenarioRevisionIds.length} approved scenarios ready to run.
      </p>
      {failures.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-sm">
            {failures.length} preparation {failures.length === 1 ? 'issue' : 'issues'}
          </summary>
          <ul className="mt-2 space-y-2 text-sm">
            {failures.map((item, index) => (
              <li key={index}>
                {item.failureKind}: {item.failureJson}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}
