import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, CircleHelp, KeyRound, Route, Wrench } from 'lucide-react'

import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = {
  title: 'Help | AppraiseJS',
  description: 'Understand Quality Journeys, manual test design, approvals, setup, and recovery.',
}

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <div>
        <PageHeader>
          <span className="flex items-center gap-2">
            <CircleHelp aria-hidden="true" className="size-8" /> Help
          </span>
        </PageHeader>
        <HeaderSubtitle>Find the next action without learning AppraiseJS&apos;s internal architecture.</HeaderSubtitle>
      </div>

      <Card className="border-primary/25 bg-primary/[0.035]">
        <CardHeader>
          <CardTitle>A worked example: checkout confidence</CardTitle>
          <CardDescription>
            This example is illustrative. Reading it creates no records and starts no agent work.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm leading-6 md:grid-cols-2">
          <p>
            <strong>1. Brief:</strong> describe the outcome, “a shopper can submit an order,” plus scope and observable
            success.
          </p>
          <p>
            <strong>2. Analyze:</strong> Codex receives the one-time handoff prompt and submits questions or a versioned
            analysis.
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
        <Card>
          <CardHeader>
            <Route aria-hidden="true" className="size-5 text-primary" />
            <CardTitle>Quality Journey</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>The guided path from requirement intake through analysis, approvals, execution evidence, and closure.</p>
            <Button asChild size="sm">
              <Link href="/quality-journeys/new">
                Start a Journey <ArrowRight aria-hidden="true" className="ml-2 size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Wrench aria-hidden="true" className="size-5 text-primary" />
            <CardTitle>Manual authoring</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Expert tools for reusable steps, Case Templates, test cases, suites, and independent runs. They do not
              bypass Journey approvals.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href="/test-cases">Open test design</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <KeyRound aria-hidden="true" className="size-5 text-primary" />
            <CardTitle>Setup and recovery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              A diagnostic receipt is the last observation, not proof of a live connection. Failed or expired handoffs
              must be retried from their Journey.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href="/projects?agentSetup=codex">Open Codex setup</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Glossary</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm md:grid-cols-2">
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
