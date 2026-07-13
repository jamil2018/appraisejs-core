import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, GitBranch, Network } from 'lucide-react'
import { notFound, redirect } from 'next/navigation'

import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getPlanDisplaySlug, matchesPlanSlug, planCanonicalRoute } from '@/lib/plans/plan-display'
import { PlanRepositoryError } from '@/lib/plans/artifact-repository'
import { getPlanReviewDetail, listPlans } from '@/services/plan-review/plan-review-service'
import { ServiceError } from '@/services/shared/errors'
import { requireActiveProject } from '@/lib/active-project'

import { PlanReviewWorkspace } from './plan-review-workspace'

type PageProps = {
  params: Promise<{ planId: string }>
  searchParams?: Promise<{ review?: string; project?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { planId } = await params
  return { title: `Plan ${planId}` }
}

function hasErrorCode(error: unknown): error is { code: unknown } {
  return Boolean(error && typeof error === 'object' && 'code' in error)
}

function readErrorCode(error: unknown): unknown {
  if (error instanceof ServiceError) return error.code
  if (error instanceof PlanRepositoryError) return error.code
  return hasErrorCode(error) ? error.code : undefined
}

function isPlanDetailNotFound(error: unknown): boolean {
  const code = readErrorCode(error)
  return code === 'NOT_FOUND' || code === 'not-found'
}

async function readExactPlanDetail(routeKey: string, targetProjectId: string) {
  try {
    return await getPlanReviewDetail(routeKey, undefined, { targetProjectId })
  } catch (error) {
    if (isPlanDetailNotFound(error)) return undefined
    throw error
  }
}

async function resolveSlugMatches(routeKey: string, targetProjectId: string) {
  const plans = await listPlans({ targetProjectId })
  return plans.filter(plan => plan.planId !== routeKey && matchesPlanSlug(plan, routeKey))
}

function AmbiguousPlanSlug({ slug, plans }: { slug: string; plans: Awaited<ReturnType<typeof resolveSlugMatches>> }) {
  return (
    <main className="space-y-6 pb-10">
      <header className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div>
          <PageHeader>
            <span className="flex items-center">
              <AlertTriangle className="mr-2 size-8" />
              Multiple Plans Match
            </span>
          </PageHeader>
          <HeaderSubtitle>
            The slug <span className="font-mono">{slug}</span> is not unique. Open a canonical plan link below or refine
            from the plans browser.
          </HeaderSubtitle>
        </div>
        <Button asChild variant="outline">
          <Link href={`/plans?query=${encodeURIComponent(slug)}`}>
            <Network className="mr-2 size-4" />
            Search plans
          </Link>
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {plans.map(plan => (
          <Card
            key={plan.planId}
            className="rounded-lg border-amber-500/35 bg-amber-50/20 shadow-sm dark:bg-amber-950/10"
          >
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardDescription className="truncate font-mono text-xs text-primary">
                    {getPlanDisplaySlug(plan)}
                  </CardDescription>
                  <CardTitle className="mt-2 line-clamp-2 text-lg">{plan.goal}</CardTitle>
                </div>
                <Badge variant="outline">{plan.lifecycle.replaceAll('_', ' ')}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{plan.description}</p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                  <GitBranch className="size-4" />
                  {plan.planId}
                </span>
                <Button asChild size="sm">
                  <Link href={planCanonicalRoute(plan.planId)}>
                    Open canonical plan
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  )
}

// fallow-ignore-next-line complexity
export default async function PlanReviewPage({ params, searchParams }: PageProps) {
  const [{ planId: routeKey }, resolvedSearchParams] = await Promise.all([params, searchParams])
  const reviewMode = resolvedSearchParams?.review
  const project = await requireActiveProject(resolvedSearchParams?.project)
  const detail = await readExactPlanDetail(routeKey, project.id)
  if (detail)
    return <PlanReviewWorkspace detail={detail} initialTab={reviewMode === 'validation' ? 'validations' : undefined} />

  const slugMatches = await resolveSlugMatches(routeKey, project.id)
  if (slugMatches.length === 1) redirect(planCanonicalRoute(slugMatches[0]!.planId))
  if (slugMatches.length > 1) return <AmbiguousPlanSlug slug={routeKey} plans={slugMatches} />

  notFound()
}
