import type { ReactNode } from 'react'

export type EnvironmentOption = { id: string; name: string; baseUrl: string }

export type Dimension =
  | 'FUNCTIONAL'
  | 'END_TO_END'
  | 'API'
  | 'INTEGRATION'
  | 'ACCESSIBILITY'
  | 'PERFORMANCE'
  | 'SECURITY'
  | 'VISUAL'
  | 'COMPATIBILITY'
  | 'EXPLORATORY'
  | 'CUSTOM'

export const rigorDescriptions = {
  FOCUSED: 'Concentrate evidence on the named behavior and its closest failure paths.',
  STANDARD: 'Cover primary behavior, important alternatives, and representative risks.',
  COMPREHENSIVE: 'Seek broad coverage, edge conditions, and cross-feature regression evidence.',
} as const

export type CoverageRigor = keyof typeof rigorDescriptions

export type IntakeValues = {
  objective: string
  context: string
  coverageRigor: CoverageRigor | ''
  includedScope: string
  excludedScope: string
  environmentIds: string[]
  actors: string
  testDataNeeds: string
  constraints: string
  risks: string
  desiredEvidenceSignals: string
}

export type IntakeState = IntakeValues & {
  currentStep: number
  reviewing: boolean
  environments: EnvironmentOption[]
  environmentName: string
  environmentUrl: string
  showEnvironmentForm: boolean
  error: string | null
}

export type DraftSnapshot = {
  id: string
  status?: 'ACTIVE' | 'ARCHIVED' | 'CONFIRMED'
  version: number
  draftHash: string
  currentStep: number
  requirement: Partial<{
    objective: string
    context: string
    coverageRigor: CoverageRigor
    testDimensions: Dimension[]
    includedScope: string[]
    excludedScope: string[]
    environmentIds: string[]
    actors: string[]
    testDataNeeds: string[]
    constraints: string[]
    risks: string[]
    desiredEvidenceSignals: string[]
  }>
  predecessorJourneyId?: string
}

export type Requirement = ReturnType<typeof buildRequirement>
export type UpdateIntake = (patch: Partial<IntakeState>) => void

export function actionId(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`
}

export function lines(value: string) {
  return value.split('\n').flatMap(item => {
    const trimmed = item.trim()
    return trimmed ? [trimmed] : []
  })
}

export function buildRequirement(values: IntakeValues) {
  const optionalList = (value: string) => {
    const items = lines(value)
    return items.length ? items : undefined
  }
  return {
    schemaVersion: 'appraise.quality-journey-requirement/v1' as const,
    objective: values.objective.trim(),
    context: values.context.trim() || undefined,
    coverageRigor: values.coverageRigor || undefined,
    testDimensions: ['END_TO_END' as const],
    includedScope: lines(values.includedScope),
    excludedScope: optionalList(values.excludedScope),
    environmentIds: values.environmentIds.toSorted(),
    actors: optionalList(values.actors),
    testDataNeeds: optionalList(values.testDataNeeds),
    constraints: optionalList(values.constraints),
    risks: optionalList(values.risks),
    desiredEvidenceSignals: lines(values.desiredEvidenceSignals),
  }
}

export function missingRequiredIntake(requirement: Requirement) {
  const missing: Array<{ label: string; step: number; focusId: string }> = []
  if (!requirement.objective)
    missing.push({ label: 'a requirement objective', step: 0, focusId: 'quality-journey-objective' })
  if (!requirement.includedScope.length)
    missing.push({ label: 'at least one included scope item', step: 1, focusId: 'quality-journey-included' })
  if (!requirement.desiredEvidenceSignals.length)
    missing.push({ label: 'at least one desired evidence signal', step: 1, focusId: 'quality-journey-evidence' })
  if (!requirement.coverageRigor)
    missing.push({ label: 'a coverage depth', step: 2, focusId: 'quality-journey-rigor-FOCUSED' })
  if (!requirement.environmentIds.length)
    missing.push({ label: 'at least one registered environment', step: 3, focusId: 'intake-environment-heading' })
  return missing
}

export function intakeSteps(requirement: Requirement) {
  return [
    { label: 'Goal', complete: Boolean(requirement.objective) },
    {
      label: 'Scope and success',
      complete: Boolean(requirement.includedScope.length && requirement.desiredEvidenceSignals.length),
    },
    { label: 'Coverage', complete: Boolean(requirement.coverageRigor) },
    { label: 'Test location', complete: Boolean(requirement.environmentIds.length) },
  ]
}

export function intakeValuesFromDraft(requirement: DraftSnapshot['requirement'] | undefined): IntakeValues {
  const saved = requirement ?? {}
  const join = (value?: string[]) => value?.join('\n') ?? ''
  return {
    objective: saved.objective ?? '',
    context: saved.context ?? '',
    coverageRigor: saved.coverageRigor ?? '',
    includedScope: join(saved.includedScope),
    excludedScope: join(saved.excludedScope),
    desiredEvidenceSignals: join(saved.desiredEvidenceSignals),
    actors: join(saved.actors),
    testDataNeeds: join(saved.testDataNeeds),
    constraints: join(saved.constraints),
    risks: join(saved.risks),
    environmentIds: saved.environmentIds ?? [],
  }
}

export function initialIntakeState(environments: EnvironmentOption[], draft?: DraftSnapshot): IntakeState {
  return {
    ...intakeValuesFromDraft(draft?.requirement),
    currentStep: Math.min(draft?.currentStep ?? 0, 3),
    reviewing: false,
    environments,
    environmentName: '',
    environmentUrl: '',
    showEnvironmentForm: false,
    error: null,
  }
}

export function focusIntakeField(id: string) {
  requestAnimationFrame(() => document.getElementById(id)?.focus())
}

export function StepVisibility({ children, current, when }: { children: ReactNode; current: number; when: number }) {
  return current === when ? children : null
}
