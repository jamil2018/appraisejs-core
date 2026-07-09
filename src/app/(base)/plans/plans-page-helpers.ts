import { getPlanDisplaySlug } from '@/lib/plans/plan-display'
import { listPlans } from '@/services/plan-review/plan-review-service'

export type ListedPlan = Awaited<ReturnType<typeof listPlans>>[number]

export const reviewStates = new Set([
  'awaiting_plan_review',
  'changes_requested',
  'awaiting_validation_review',
  'validation_changes_requested',
  'baseline_review',
  'baseline_changes_requested',
])

export const approvedStates = new Set([
  'plan_approved',
  'validations_approved',
  'baseline_accepted',
  'completed',
  'validation_passed',
])

export const inProgressStates = new Set(['in_progress', 'preparing_validations', 'baseline_running', 'validating'])

const completedTaskStatuses = new Set(['completed', 'implemented', 'verified'])

type CardVisualStyle = {
  border: string
  dot: string
  badge: string
}

const cardStylesByCategory = {
  attention: {
    border: 'border-l-destructive/70',
    dot: 'bg-destructive animate-pulse',
    badge: 'border-destructive/25 bg-destructive/10 text-red-200 hover:bg-destructive/15',
  },
  approved: {
    border: 'border-l-emerald-300/70',
    dot: 'bg-emerald-300',
    badge: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200 hover:bg-emerald-300/15',
  },
  inProgress: {
    border: 'border-l-sky-300/70',
    dot: 'bg-sky-300 animate-pulse',
    badge: 'border-sky-300/25 bg-sky-300/10 text-sky-200 hover:bg-sky-300/15',
  },
  review: {
    border: 'border-l-amber-300/70',
    dot: 'bg-amber-300',
    badge: 'border-amber-300/25 bg-amber-300/10 text-amber-200 hover:bg-amber-300/15',
  },
  default: {
    border: 'border-l-white/20',
    dot: 'bg-muted-foreground/50',
    badge: 'border-white/15 bg-white/[0.035] text-muted-foreground hover:bg-white/[0.055]',
  },
} satisfies Record<string, CardVisualStyle>

const cardCategoryRules: Array<{
  matches: (lifecycle: string, stale: boolean, conflicted: boolean) => boolean
  category: keyof typeof cardStylesByCategory
}> = [
  {
    matches: (lifecycle, stale, conflicted) => stale || conflicted || lifecycle === 'failed_validation',
    category: 'attention',
  },
  { matches: lifecycle => approvedStates.has(lifecycle), category: 'approved' },
  { matches: lifecycle => inProgressStates.has(lifecycle), category: 'inProgress' },
  { matches: lifecycle => reviewStates.has(lifecycle), category: 'review' },
]

const tabFilters: Record<string, (lifecycle: string) => boolean> = {
  all: () => true,
  draft: lifecycle => lifecycle === 'draft',
  awaiting_review: lifecycle => reviewStates.has(lifecycle),
  approved: lifecycle => approvedStates.has(lifecycle),
  in_progress: lifecycle => inProgressStates.has(lifecycle),
  completed: lifecycle => lifecycle === 'completed' || lifecycle === 'validation_passed',
}

const sortComparators: Record<string, (left: ListedPlan, right: ListedPlan) => number> = {
  revision: (left, right) => {
    if (right.revision !== left.revision) return right.revision - left.revision
    return right.updatedAt.getTime() - left.updatedAt.getTime()
  },
  tasks: (left, right) => right.tasks.length - left.tasks.length,
  goal: (left, right) => left.goal.localeCompare(right.goal),
  recent: (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
}

export function getCardStyles(lifecycle: string, stale: boolean, conflicted: boolean): CardVisualStyle {
  const category = cardCategoryRules.find(rule => rule.matches(lifecycle, stale, conflicted))?.category ?? 'default'
  return cardStylesByCategory[category]
}

export function getLifecycleLabel(lifecycle: string, stale: boolean, conflicted: boolean) {
  if (conflicted) return 'Conflicted'
  if (stale) return 'Stale'
  return lifecycle.replaceAll('_', ' ')
}

function matchesPlanTab(lifecycle: string, tab: string) {
  const matcher = tabFilters[tab]
  return matcher ? matcher(lifecycle) : true
}

function matchesPlanQuery(plan: ListedPlan, query: string) {
  if (!query) return true
  const normalizedQuery = query.toLowerCase()
  const searchableValues = [getPlanDisplaySlug(plan), plan.goal, plan.description, plan.lifecycle.replaceAll('_', ' ')]
  return searchableValues.some(value => value.toLowerCase().includes(normalizedQuery))
}

export function filterPlans(plans: ListedPlan[], tab: string, query: string) {
  return plans.filter(plan => matchesPlanTab(plan.lifecycle, tab) && matchesPlanQuery(plan, query))
}

export function sortPlans(plans: ListedPlan[], sort: string) {
  const compare = sortComparators[sort] ?? sortComparators.recent
  return plans.toSorted(compare)
}

function readTaskStatesFromValidationJson(validationJson: string) {
  const parsed = JSON.parse(validationJson) as {
    implementation?: { taskStates?: Record<string, string> }
  }
  return parsed.implementation?.taskStates ?? {}
}

function parseImplementationTaskStates(validationJson: string | null) {
  if (!validationJson) return {} as Record<string, string>
  try {
    return readTaskStatesFromValidationJson(validationJson)
  } catch {
    return {}
  }
}

export function getPlanTaskProgress(plan: ListedPlan) {
  const taskStates = parseImplementationTaskStates(plan.validationJson)
  const completedCount = plan.tasks.reduce((count, task) => {
    const status = taskStates[task.taskId] ?? 'pending'
    return completedTaskStatuses.has(status) ? count + 1 : count
  }, 0)
  const totalCount = plan.tasks.length
  const completionPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return { completedCount, totalCount, completionPercentage }
}

const inactiveLifecycleStates = new Set(['completed', 'cancelled', 'draft'])

function isActivePlan(lifecycle: string) {
  return !inactiveLifecycleStates.has(lifecycle)
}

export function computePlanStats(plans: ListedPlan[]) {
  return {
    totalActive: plans.filter(plan => isActivePlan(plan.lifecycle)).length,
    totalApproved: plans.filter(plan => approvedStates.has(plan.lifecycle)).length,
    totalAwaitingReview: plans.filter(plan => reviewStates.has(plan.lifecycle)).length,
    totalInProgress: plans.filter(plan => inProgressStates.has(plan.lifecycle)).length,
  }
}

export function parsePlansListSearchParams(params: { query?: string; tab?: string; sort?: string } = {}) {
  return {
    query: params.query ?? '',
    tab: params.tab ?? 'all',
    sort: params.sort ?? 'recent',
  }
}
