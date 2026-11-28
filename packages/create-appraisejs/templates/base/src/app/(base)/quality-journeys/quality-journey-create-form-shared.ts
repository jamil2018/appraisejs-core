import type { QualityJourneyRequirement } from '@/lib/quality-journey/requirement-values'
import type { ManagedWorkerEffort, ManagedWorkerModel } from '@/lib/quality-journey/managed-worker-preferences'
import {
  getBriefFileContext,
  withBriefFileContext,
  withoutBriefFileContext,
  type BriefFile,
  type JourneyRecordContext,
} from '@/lib/quality-journey/record-context'

export type IntakeState = {
  objective: string
  managedWorkerProvider: 'CODEX' | 'CLAUDE_CODE'
  managedWorkerModel?: ManagedWorkerModel | null
  managedWorkerEffort?: ManagedWorkerEffort | null
  attachedFile: BriefFile | null
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
  managedWorkerProvider?: 'CODEX' | 'CLAUDE_CODE'
  managedWorkerModel?: ManagedWorkerModel
  managedWorkerEffort?: ManagedWorkerEffort
}

export function actionId(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`
}

/** Retain earlier structured intent while editing only the free-text brief. */
export function buildBriefRequirement(
  values: IntakeState,
  saved?: DraftSnapshot['requirement'],
  recordContext?: JourneyRecordContext,
): QualityJourneyRequirement {
  const sourceContext = saved?.context ?? (recordContext ? JSON.stringify(recordContext) : undefined)
  const context = withBriefFileContext(withoutBriefFileContext(sourceContext), values.attachedFile)
  const savedWithoutContext = { ...saved }
  delete savedWithoutContext.context
  return { ...savedWithoutContext, ...(context ? { context } : {}), objective: values.objective.trim() }
}

export function initialIntakeState(draft?: DraftSnapshot): IntakeState {
  return {
    objective: draft?.requirement.objective ?? '',
    managedWorkerProvider: draft?.managedWorkerProvider ?? 'CODEX',
    managedWorkerModel: draft?.managedWorkerModel,
    managedWorkerEffort: draft?.managedWorkerEffort,
    attachedFile: getBriefFileContext(draft?.requirement.context)?.file ?? null,
    currentStep: Math.min(draft?.currentStep ?? 0, 3),
    error: null,
  }
}

export function focusIntakeField(id: string) {
  requestAnimationFrame(() => document.getElementById(id)?.focus())
}
