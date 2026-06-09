import type { Metadata } from 'next'
import Link from 'next/link'
import { GitBranch, Network } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { listPlans } from '@/services/plan-review/plan-review-service'

export const metadata: Metadata = {
  title: 'Plans',
  description: 'Review agent-authored implementation plans',
}

type PlanListItem = Awaited<ReturnType<typeof listPlans>>[number]

// fallow-ignore-next-line complexity
function PlanCard({ plan }: { plan: PlanListItem }) {
  return (
    <Link href={`/plans/${plan.planId}`} className="group">
      <Card className="group-hover:border-primary/50 h-full transition-colors">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">{plan.goal}</CardTitle>
              <CardDescription className="mt-2 font-mono text-xs">{plan.planId}</CardDescription>
            </div>
            <Badge variant={plan.conflicted || plan.stale ? 'destructive' : 'secondary'}>
              {plan.conflicted ? 'Conflict' : plan.stale ? 'Stale' : plan.lifecycle.replaceAll('_', ' ')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{plan.tasks.length} tasks</span>
          <span className="flex items-center gap-1.5">
            <GitBranch className="size-4" />
            Revision {plan.revision}
          </span>
        </CardContent>
      </Card>
    </Link>
  )
}

export default async function PlansPage() {
  const plans = await listPlans()

  return (
    <main className="space-y-6 pb-10">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-medium text-primary">Plan review</p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Implementation plans</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Inspect canonical plan structure, leave remarks, and approve an exact revision.
          </p>
        </div>
        <Badge variant="outline">{plans.length} plans</Badge>
      </header>

      {plans.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            <Network className="mb-4 size-9 text-muted-foreground" />
            <h2 className="text-lg font-semibold">No plans projected</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Add a canonical plan under appraise/plans and run plan sync to make it available here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {plans.map(plan => (
            <PlanCard key={plan.planId} plan={plan} />
          ))}
        </div>
      )}
    </main>
  )
}
