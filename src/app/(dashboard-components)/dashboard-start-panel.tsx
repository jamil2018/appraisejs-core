import Link from 'next/link'
import { ArrowRight, CheckCircle2, CircleDashed, Wrench } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { EntityMetrics } from '@/services/dashboard/dashboard-service'
import { withProjectScope } from '@/lib/project-scope'

export type DashboardExperienceState = 'empty' | 'untested' | 'populated'

export function getDashboardExperienceState(metrics: EntityMetrics): DashboardExperienceState {
  if (metrics.testCasesCount === 0 && metrics.testSuitesCount === 0 && metrics.qualityJourneysCount === 0)
    return 'empty'
  return metrics.completedTestRunsCount === 0 ? 'untested' : 'populated'
}

const stateCopy = {
  empty: {
    title: 'Start with a requirement you need to trust',
    description:
      'This workspace has no Journey or authored tests yet. A Quality Journey guides Codex from a brief through evidence and review.',
  },
  untested: {
    title: 'Turn prepared work into evidence',
    description:
      'This workspace contains a Journey or authored tests, but no completed run has demonstrated its current quality yet.',
  },
  populated: {
    title: 'Continue the quality workflow',
    description:
      'Completed-run evidence is available below. Start or resume a Quality Journey for the next requirement.',
  },
} satisfies Record<DashboardExperienceState, { title: string; description: string }>

export function DashboardStartPanel({
  entityMetrics,
  projectId,
  agentReady,
}: {
  entityMetrics: EntityMetrics
  projectId: string
  agentReady: boolean | null
}) {
  const state = getDashboardExperienceState(entityMetrics)
  const copy = stateCopy[state]
  const journeyPath = `/quality-journeys/new?project=${encodeURIComponent(projectId)}`
  const setupPath = `/projects?agentSetup=codex&project=${encodeURIComponent(projectId)}&returnTo=${encodeURIComponent(journeyPath)}`
  const primaryPath = agentReady ? journeyPath : setupPath

  return (
    <Card className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
      <CardHeader className="min-w-0 gap-2 p-0">
        <CardTitle className="text-base">{copy.title}</CardTitle>
        <CardDescription className="max-w-prose">{copy.description}</CardDescription>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Workspace readiness">
          <li className="flex items-center gap-2">
            {agentReady ? (
              <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-success" />
            ) : (
              <CircleDashed
                aria-hidden="true"
                className={agentReady === false ? 'size-4 shrink-0 text-warning' : 'size-4 shrink-0'}
              />
            )}
            {agentReady === true
              ? 'Latest Codex diagnostic was ready'
              : agentReady === false
                ? 'Latest Codex diagnostic found a setup problem'
                : 'Codex readiness has not been observed'}
          </li>
          <li className="flex items-center gap-2">
            {state === 'empty' ? (
              <CircleDashed aria-hidden="true" className="size-4 shrink-0" />
            ) : (
              <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            )}
            {state === 'empty' ? 'No Journey or authored tests yet' : 'Workspace has prepared quality work'}
          </li>
        </ul>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 p-0">
        <Button render={<Link href={primaryPath} />} nativeButton={false}>
          {agentReady ? 'Start a Quality Journey' : 'Set up Codex'}
          <ArrowRight aria-hidden="true" />
        </Button>
        <Button render={<Link href={withProjectScope('/test-cases/create', projectId)} />} nativeButton={false} variant="outline">
          <Wrench aria-hidden="true" /> Manual test design
        </Button>
      </CardContent>
    </Card>
  )
}
