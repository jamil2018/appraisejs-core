import Link from 'next/link'
import { ArrowRight, CheckCircle2, CircleDashed, Route, Wrench } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { EntityMetrics } from '@/services/dashboard/dashboard-service'

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
    <Card className="border-primary/25 bg-primary/[0.035]">
      <CardHeader className="gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Route aria-hidden="true" className="size-4" /> Guided starting point
        </div>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription className="max-w-3xl">{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-5">
        <ul className="grid gap-2 text-sm" aria-label="Workspace readiness">
          <li className="flex items-center gap-2">
            {agentReady ? (
              <CheckCircle2 aria-hidden="true" className="size-4 text-primary" />
            ) : (
              <CircleDashed aria-hidden="true" className="size-4" />
            )}
            {agentReady === true
              ? 'Latest Codex diagnostic was ready'
              : agentReady === false
                ? 'Latest Codex diagnostic found a setup problem'
                : 'Codex readiness has not been observed'}
          </li>
          <li className="flex items-center gap-2">
            {state === 'empty' ? (
              <CircleDashed aria-hidden="true" className="size-4" />
            ) : (
              <CheckCircle2 aria-hidden="true" className="size-4 text-primary" />
            )}
            {state === 'empty' ? 'No Journey or authored tests yet' : 'Workspace has prepared quality work'}
          </li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={primaryPath}>
              {agentReady ? 'Start a Quality Journey' : 'Set up Codex'}
              <ArrowRight aria-hidden="true" className="ml-2 size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/test-cases/create">
              <Wrench aria-hidden="true" className="mr-2 size-4" /> Manual test design
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
