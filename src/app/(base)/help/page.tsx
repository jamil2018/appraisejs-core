import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, CircleHelp, KeyRound, Route, Wrench } from 'lucide-react'

import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { readActiveProjectCookie } from '@/lib/active-project'
import { withProjectScope } from '@/lib/project-scope'
import { resolveActiveProject } from '@/services/target-project/target-project-service'

export const metadata: Metadata = {
  title: 'Help | AppraiseJS',
  description: 'Understand Quality Journeys, manual test design, approvals, setup, and recovery.',
}

export default async function HelpPage({ searchParams }: { searchParams?: Promise<{ project?: string }> }) {
  const [params, cookieProjectId] = await Promise.all([searchParams, readActiveProjectCookie()])
  const project = await resolveActiveProject({ urlProjectId: params?.project, cookieProjectId })
  const scoped = (href: string) => (project ? withProjectScope(href, project.id) : href)
  return (
    <div className="space-y-4">
      <div>
        <PageHeader>
          <span className="flex items-center gap-2">
            <CircleHelp aria-hidden="true" className="size-8" /> Help
          </span>
        </PageHeader>
        <HeaderSubtitle>Get started with Journeys, manual authoring, and agent setup.</HeaderSubtitle>
      </div>

      <Card className="border-primary/25 bg-primary/[0.035]">
        <CardHeader className="p-4 pb-3">
          <CardTitle>A worked example: checkout confidence</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 pt-0 text-sm leading-6 md:grid-cols-2 [&>p]:max-w-prose">
          <p>
            <strong>1. Brief:</strong> describe the outcome, “a shopper can submit an order,” plus scope and observable
            success.
          </p>
          <p>
            <strong>2. Analyze:</strong> Appraise analyzes the brief and shows required questions and acceptance
            criteria on the Journey page.
          </p>
          <p>
            <strong>3. Decide:</strong> you answer gaps and explicitly approve the exact revision. Viewing a page never
            grants approval.
          </p>
          <p>
            <strong>4. Execute and review:</strong> approved intent becomes scenarios, evidence, triage, and a closure
            decision.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0">
          <CardHeader className="p-4 pb-3">
            <Route aria-hidden="true" className="size-5 text-primary" />
            <CardTitle>Quality Journey</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0 text-sm text-muted-foreground">
            <p>The guided path from requirement intake through analysis, approvals, execution evidence, and closure.</p>
            <Button size="sm" render={<Link href={scoped('/quality-journeys/new')} />} nativeButton={false}>
              Start a Journey <ArrowRight aria-hidden="true" className="ml-2 size-4" />
            </Button>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader className="p-4 pb-3">
            <Wrench aria-hidden="true" className="size-5 text-primary" />
            <CardTitle>Manual authoring</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0 text-sm text-muted-foreground">
            <p>
              Expert tools for reusable steps, Case Templates, test cases, suites, and independent runs. They do not
              bypass Journey approvals.
            </p>
            <Button size="sm" variant="outline" render={<Link href={scoped('/test-cases')} />} nativeButton={false}>
              Open test design
            </Button>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader className="p-4 pb-3">
            <KeyRound aria-hidden="true" className="size-5 text-primary" />
            <CardTitle>Setup and recovery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0 text-sm text-muted-foreground">
            <p>
              A diagnostic receipt records the last check. Open the Journey for recovery controls when managed work is
              interrupted.
            </p>
            <Button
              size="sm"
              variant="outline"
              render={<Link href={scoped('/projects?agentSetup=codex')} />}
              nativeButton={false}
            >
              Open Codex setup
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-4 pb-3">
          <CardTitle>Glossary</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <dl className="grid gap-3 text-sm md:grid-cols-2 [&>div]:max-w-prose">
            <div>
              <dt className="font-semibold">Observed</dt>
              <dd className="text-muted-foreground">
                Recorded evidence from a specific time; present availability may still be unknown.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Approval</dt>
              <dd className="text-muted-foreground">
                An explicit decision bound to an exact version, never agreement inferred from chat or page views.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Case Template</dt>
              <dd className="text-muted-foreground">
                A reusable structure for authoring test cases; it is not an executed result.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Independent run</dt>
              <dd className="text-muted-foreground">A manually configured run outside Journey-managed execution.</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
