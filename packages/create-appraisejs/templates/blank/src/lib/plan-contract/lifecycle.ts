import { PlanContractError } from './errors'

export const PLAN_LIFECYCLE_STATES = [
  'draft',
  'awaiting_plan_review',
  'changes_requested',
  'plan_approved',
  'preparing_validations',
  'awaiting_validation_review',
  'validation_changes_requested',
  'validations_approved',
  'baseline_running',
  'baseline_review',
  'baseline_changes_requested',
  'baseline_accepted',
  'in_progress',
  'paused',
  'ready_for_validation',
  'validating',
  'failed_validation',
  'validation_passed',
  'completed',
  'cancelled',
] as const

export type PlanLifecycleState = (typeof PLAN_LIFECYCLE_STATES)[number]

export const PLAN_LIFECYCLE_TRANSITIONS: Readonly<Record<PlanLifecycleState, readonly PlanLifecycleState[]>> = {
  draft: ['awaiting_plan_review', 'cancelled'],
  awaiting_plan_review: ['changes_requested', 'plan_approved', 'cancelled'],
  changes_requested: ['awaiting_plan_review', 'cancelled'],
  plan_approved: ['preparing_validations', 'changes_requested', 'cancelled'],
  preparing_validations: ['awaiting_validation_review', 'validation_changes_requested', 'cancelled'],
  awaiting_validation_review: ['validation_changes_requested', 'validations_approved', 'cancelled'],
  validation_changes_requested: ['preparing_validations', 'cancelled'],
  validations_approved: ['baseline_running', 'validation_changes_requested', 'cancelled'],
  baseline_running: ['baseline_review', 'baseline_changes_requested', 'cancelled'],
  baseline_review: ['baseline_changes_requested', 'baseline_accepted', 'cancelled'],
  baseline_changes_requested: ['preparing_validations', 'baseline_running', 'cancelled'],
  baseline_accepted: ['in_progress', 'validation_changes_requested', 'cancelled'],
  in_progress: ['paused', 'changes_requested', 'ready_for_validation', 'cancelled'],
  paused: ['in_progress', 'cancelled'],
  ready_for_validation: ['validating', 'changes_requested', 'cancelled'],
  validating: ['failed_validation', 'validation_passed', 'cancelled'],
  failed_validation: ['in_progress', 'ready_for_validation', 'cancelled'],
  validation_passed: ['changes_requested', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export function canTransitionPlan(from: PlanLifecycleState, to: PlanLifecycleState): boolean {
  return PLAN_LIFECYCLE_TRANSITIONS[from].includes(to)
}

export function assertPlanTransition(from: PlanLifecycleState, to: PlanLifecycleState): void {
  if (!canTransitionPlan(from, to)) {
    throw new PlanContractError('invalid-transition', `Cannot transition plan from ${from} to ${to}`)
  }
}

export type ApprovalInvalidationScope = 'none' | 'plan' | 'validation' | 'implementation'

export const APPROVAL_INVALIDATION_RULES = {
  layout: 'none',
  structural_plan: 'plan',
  validation_definition: 'validation',
  implementation: 'implementation',
} as const satisfies Record<string, ApprovalInvalidationScope>
