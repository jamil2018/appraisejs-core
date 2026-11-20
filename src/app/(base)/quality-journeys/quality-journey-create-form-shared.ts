import type { QualityJourneyRequirement } from '@/lib/quality-journey/requirement-values'

export type EnvironmentOption = { id: string; name: string; baseUrl: string }

export type IntakeState = {
  objective: string
  currentStep: number
  error: string | null
}

export type DraftSnapshot = {
  id: string
  status?: 'ACTIVE' | 'ARCHIVED' | 'CONFIRMED'
  version: number
  draftHash: string
  currentStep: number
  requirement: Partial<QualityJourneyRequirement>
  predecessorJourneyId?: string
}

export function actionId(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`
}

/** Retain earlier structured intent while editing only the free-text brief. */
export function buildBriefRequirement(
  values: IntakeState,
  saved?: DraftSnapshot['requirement'],
): QualityJourneyRequirement {
  return { ...saved, objective: values.objective.trim() }
}

export function initialIntakeState(draft?: DraftSnapshot): IntakeState {
  return {
    objective: draft?.requirement.objective ?? '',
    currentStep: Math.min(draft?.currentStep ?? 0, 3),
    error: null,
  }
}

export function focusIntakeField(id: string) {
  requestAnimationFrame(() => document.getElementById(id)?.focus())
}
