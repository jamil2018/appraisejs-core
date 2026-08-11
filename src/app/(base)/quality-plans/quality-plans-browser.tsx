'use client'

import Link from 'next/link'
import { ArrowRight, ClipboardCheck, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type QualityPlanPacket = {
  qualityPlan: { id: string; title: string; description: string | null }
  revision: { id: string; revision: number; status: string; contentHash: string }
  requirements: unknown[]
  obligations: unknown[]
  validationVersions: Array<{ status: string }>
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ').toLocaleLowerCase()
}

export function QualityPlansBrowser({ plans }: { plans: QualityPlanPacket[] }) {
  const [query, setQuery] = useState('')
  const visiblePlans = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return plans
    return plans.filter(plan =>
      [
        plan.qualityPlan.title,
        plan.qualityPlan.description ?? '',
        plan.revision.status,
        plan.revision.contentHash,
      ].some(value => value.toLocaleLowerCase().includes(normalized)),
    )
  }, [plans, query])

  return (
    <section className="space-y-4" aria-label="Quality Plans">
      <div className="relative max-w-md">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label="Search Quality Plans"
          className="pl-9"
          onChange={event => setQuery(event.target.value)}
          placeholder="Search Quality Plans..."
          type="search"
          value={query}
        />
      </div>
      {plans.length === 0 ? (
        <EmptyQualityPlans />
      ) : visiblePlans.length === 0 ? (
        <p
          className="rounded-lg border border-dashed border-white/[0.1] p-8 text-center text-sm text-muted-foreground"
          role="status"
        >
          No Quality Plans match “{query}”.
        </p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visiblePlans.map(plan => (
            <Card className="border-l-primary/70 group relative overflow-hidden border-l-4" key={plan.qualityPlan.id}>
              <Link
                aria-label={`Review Quality Plan ${plan.qualityPlan.title}`}
                className="absolute inset-0 z-10 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={`/quality-plans/${plan.qualityPlan.id}`}
              />
              <CardHeader className="pr-16">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardDescription className="font-mono text-xs text-primary">
                      Revision {plan.revision.revision}
                    </CardDescription>
                    <CardTitle className="mt-2 line-clamp-2 text-lg">{plan.qualityPlan.title}</CardTitle>
                  </div>
                  <Badge className="shrink-0 capitalize" variant="outline">
                    {statusLabel(plan.revision.status)}
                  </Badge>
                </div>
                {plan.qualityPlan.description ? (
                  <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{plan.qualityPlan.description}</p>
                ) : null}
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 pr-14 text-xs text-muted-foreground">
                <span className="bg-background/60 rounded-md border px-2 py-1">
                  {plan.requirements.length} requirements
                </span>
                <span className="bg-background/60 rounded-md border px-2 py-1">
                  {plan.obligations.length} obligations
                </span>
                <span className="bg-background/60 rounded-md border px-2 py-1">
                  {plan.validationVersions.length} validations
                </span>
              </CardContent>
              <span className="border-primary/30 pointer-events-none absolute bottom-5 right-5 z-20 flex size-9 items-center justify-center rounded-md border bg-primary text-primary-foreground">
                <ArrowRight aria-hidden="true" className="size-4" />
              </span>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}

function EmptyQualityPlans() {
  return (
    <Card className="border-dashed border-white/[0.1] bg-[rgba(18,37,64,0.42)] shadow-none">
      <CardContent className="flex min-h-64 flex-col items-center justify-center p-6 text-center">
        <ClipboardCheck aria-hidden="true" className="size-8 text-muted-foreground" />
        <h2 className="mt-4 text-base font-semibold">No Quality Plans yet</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Submit a requirement source through the Quality Design lifecycle to create an immutable revision.
        </p>
      </CardContent>
    </Card>
  )
}
