export type PlanDisplayFields = {
  planId: string
  goal?: string | null
  slug?: string | null
  legacyPlanId?: string | null
  deletedAt?: Date | null
}

const OPAQUE_PLAN_ID_PATTERN = /^pln_[0-9a-hjkmnp-tv-z]{26}$/i

function slugifyPlanLabel(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizePlanSlug(value: string): string {
  return slugifyPlanLabel(decodeURIComponent(value))
}

export function getPlanDisplaySlug(plan: PlanDisplayFields): string {
  const storedSlug = plan.slug?.trim()
  if (storedSlug) return storedSlug

  const legacyPlanId = plan.legacyPlanId?.trim()
  if (legacyPlanId) return legacyPlanId

  if (!OPAQUE_PLAN_ID_PATTERN.test(plan.planId)) return plan.planId

  const goalSlug = plan.goal ? slugifyPlanLabel(plan.goal) : ''
  return goalSlug || plan.planId
}

export function matchesPlanSlug(plan: PlanDisplayFields, routeKey: string): boolean {
  if (plan.deletedAt) return false
  return normalizePlanSlug(getPlanDisplaySlug(plan)) === normalizePlanSlug(routeKey)
}

export function planCanonicalRoute(planId: string): string {
  return `/plans/${encodeURIComponent(planId)}`
}
