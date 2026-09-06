'use client'

import { useEffect, useReducer, useRef, useState, useTransition } from 'react'

import { toast } from '@/hooks/use-toast'
import { hashQualityJourneyRequirement } from '@/lib/quality-journey'

import {
  archiveQualityJourneyDraftAction,
  confirmQualityJourneyDraftAction,
  createQualityJourneyDraftAction,
  ensureQualityJourneyIntakeEnvironmentAction,
  restoreQualityJourneyDraftAction,
  saveQualityJourneyDraftAction,
} from './quality-journey-actions'
import {
  actionId,
  buildRequirement,
  focusIntakeField,
  initialIntakeState,
  missingRequiredIntake,
  type DraftSnapshot,
  type EnvironmentOption,
  type IntakeState,
} from './quality-journey-create-form-shared'

type IntakeAction =
  { type: 'patch'; patch: Partial<IntakeState> } | { type: 'environment-registered'; environment: EnvironmentOption }

function intakeReducer(state: IntakeState, action: IntakeAction): IntakeState {
  if (action.type === 'patch') return { ...state, ...action.patch }
  const { environment } = action
  return {
    ...state,
    environments: [...state.environments.filter(item => item.id !== environment.id), environment],
    environmentIds: [...new Set([...state.environmentIds, environment.id])],
    environmentName: '',
    environmentUrl: '',
    showEnvironmentForm: false,
    error: null,
  }
}

function environmentFrom(response: Awaited<ReturnType<typeof ensureQualityJourneyIntakeEnvironmentAction>>) {
  if (!response.success || !isRecord(response.data) || !isRecord(response.data.environment)) return null
  const { environment } = response.data
  const id = stringProperty(environment, 'id')
  const name = stringProperty(environment, 'name')
  const baseUrl = stringProperty(environment, 'baseUrl')
  return id && name && baseUrl ? { id, name, baseUrl } : null
}

function journeyIdFrom(response: Awaited<ReturnType<typeof confirmQualityJourneyDraftAction>>) {
  if (!response.success || !isRecord(response.data)) return null
  return stringProperty(response.data, 'journeyId')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringProperty(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'string' ? value : null
}

function savedDraftFrom(response: Awaited<ReturnType<typeof createQualityJourneyDraftAction>>) {
  if (!response.success || !isRecord(response.data) || !isRecord(response.data.draft)) return null
  const { draft } = response.data
  return typeof draft.id === 'string' && typeof draft.version === 'number' && typeof draft.draftHash === 'string'
    ? (draft as DraftSnapshot)
    : null
}

function draftRequirementForSave(requirement: ReturnType<typeof buildRequirement>) {
  return Object.fromEntries(
    Object.entries(requirement).filter(([, value]) => value !== undefined && value !== ''),
  )
}

export function useQualityJourneyCreateIntake({
  draft,
  initialEnvironments,
  predecessorJourneyId,
  projectId,
  push,
}: {
  draft?: DraftSnapshot
  initialEnvironments: EnvironmentOption[]
  predecessorJourneyId?: string
  projectId: string
  push: (href: string) => void
}) {
  const [state, dispatch] = useReducer(
    intakeReducer,
    { environments: initialEnvironments, draft },
    ({ environments, draft: initialDraft }) => initialIntakeState(environments, initialDraft),
  )
  const idempotencyKey = useRef(actionId('quality-journey-draft'))
  const draftRef = useRef<DraftSnapshot | undefined>(draft)
  const saveQueue = useRef(Promise.resolve())
  const saveTimer = useRef<number | undefined>(undefined)
  const editRevision = useRef(0)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'failed'>(
    draft ? 'saved' : 'idle',
  )
  const [saveConflict, setSaveConflict] = useState(false)
  const [isPending, startTransition] = useTransition()
  const requirement = buildRequirement(state)
  const missing = missingRequiredIntake(requirement)

  const update = (patch: Partial<IntakeState>) => {
    editRevision.current += 1
    setSaveStatus('dirty')
    dispatch({ type: 'patch', patch })
  }

  function enqueueSave(requirementToSave = requirement, stepToSave = state.currentStep) {
    const requestedRevision = editRevision.current
    const draftRequirement = draftRequirementForSave(requirementToSave)
    const operation = saveQueue.current.then(async () => {
      setSaveStatus('saving')
      const activeDraft = draftRef.current
      const response = activeDraft
        ? await saveQualityJourneyDraftAction({
            draftId: activeDraft.id,
            expectedVersion: activeDraft.version,
            requirement: draftRequirement,
            currentStep: stepToSave,
            ...(activeDraft.predecessorJourneyId ? { predecessorJourneyId: activeDraft.predecessorJourneyId } : {}),
          })
        : await createQualityJourneyDraftAction({
            idempotencyKey: idempotencyKey.current,
            requirement: draftRequirement,
            currentStep: stepToSave,
            ...(predecessorJourneyId ? { predecessorJourneyId } : {}),
          })
      const saved = savedDraftFrom(response)
      if (!saved) {
        setSaveStatus('failed')
        setSaveConflict(Boolean(response.error?.includes('newer saved version')))
        return false
      }
      draftRef.current = saved
      const isLatestEdit = editRevision.current === requestedRevision
      setSaveStatus(isLatestEdit ? 'saved' : 'dirty')
      if (isLatestEdit) setSaveConflict(false)
      return isLatestEdit
    })
    saveQueue.current = operation.then(() => undefined)
    return operation
  }

  const draftRequirement = JSON.stringify(requirement)
  const hasMeaningfulEdit = editRevision.current > 0
  useEffect(() => {
    if (!hasMeaningfulEdit) return
    saveTimer.current = window.setTimeout(() => enqueueSave(), 750)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
    // The serialized requirement carries every persisted answer into this autosave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentStep, draftRequirement, hasMeaningfulEdit, predecessorJourneyId])

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (saveStatus === 'saved' || (saveStatus === 'idle' && !hasMeaningfulEdit)) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [hasMeaningfulEdit, saveStatus])

  function registerEnvironment() {
    startTransition(async () => {
      const response = await ensureQualityJourneyIntakeEnvironmentAction({
        allowCreate: true,
        proposal: {
          name: state.environmentName,
          baseUrl: state.environmentUrl,
          expectedPageTitle: '',
          apiBaseUrl: '',
          username: '',
          passwordEnvironmentVariable: '',
        },
      })
      const environment = environmentFrom(response)
      if (!environment) {
        update({ error: response.error ?? 'Unable to register this environment.' })
        return
      }
      dispatch({ type: 'environment-registered', environment })
      toast({ title: 'Environment registered', description: `${environment.name} is included in this intake.` })
    })
  }

  function review() {
    const firstMissing = missing[0]
    if (firstMissing) {
      update({ currentStep: firstMissing.step, error: `Add ${firstMissing.label} before reviewing this brief.` })
      focusIntakeField(firstMissing.focusId)
      return
    }
    startTransition(async () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      const savedLatest = await enqueueSave()
      if (savedLatest && draftRef.current && !saveConflict) dispatch({ type: 'patch', patch: { reviewing: true } })
      else dispatch({ type: 'patch', patch: { error: 'Couldn’t save—Retry before reviewing this brief.' } })
    })
  }

  function editReviewSection(step: number) {
    update({ currentStep: step, reviewing: false, error: null })
    focusIntakeField(`intake-${['requirement', 'scope', 'profile', 'environment'][step]}-heading`)
  }

  function submit() {
    startTransition(async () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      const savedLatest = await enqueueSave()
      const activeDraft = draftRef.current
      if (!activeDraft || !savedLatest || saveConflict) {
        update({ error: 'Your brief has not been saved yet. Retry after it is saved.' })
        return
      }
      const response = await confirmQualityJourneyDraftAction({
        draftId: activeDraft.id,
        expectedVersion: activeDraft.version,
        expectedDraftHash: activeDraft.draftHash,
        requirementHash: hashQualityJourneyRequirement(requirement),
      })
      const journeyId = journeyIdFrom(response)
      if (!journeyId) {
        const message = response.error ?? 'Unable to create this Quality Journey.'
        update({ error: message })
        toast({ title: 'Journey creation failed', description: message, variant: 'destructive' })
        return
      }
      toast({ title: 'Requirement submitted', description: 'Review the Journey, then start analysis with Codex.' })
      push(`/quality-journeys/${journeyId}?project=${encodeURIComponent(projectId)}`)
      idempotencyKey.current = actionId('quality-journey-draft')
    })
  }

  function discard() {
    startTransition(async () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      await saveQueue.current
      const activeDraft = draftRef.current
      if (!activeDraft) return
      const response = await archiveQualityJourneyDraftAction({
        draftId: activeDraft.id,
        expectedVersion: activeDraft.version,
      })
      if (!response.success) {
        update({ error: response.error ?? 'Unable to archive this draft.' })
        return
      }
      push(`/quality-journeys?project=${encodeURIComponent(projectId)}&view=archived`)
    })
  }

  function restore() {
    startTransition(async () => {
      const activeDraft = draftRef.current
      if (!activeDraft) return
      const response = await restoreQualityJourneyDraftAction({
        draftId: activeDraft.id,
        expectedVersion: activeDraft.version,
      })
      if (!response.success) {
        update({ error: response.error ?? 'Unable to restore this draft.' })
        return
      }
      push(`/quality-journeys/drafts/${activeDraft.id}?project=${encodeURIComponent(projectId)}`)
    })
  }

  function saveAsNewDraft() {
    draftRef.current = undefined
    idempotencyKey.current = actionId('quality-journey-draft')
    setSaveConflict(false)
    void enqueueSave()
  }

  return {
    actions: { discard, editReviewSection, enqueueSave, registerEnvironment, restore, review, saveAsNewDraft, submit },
    isPending,
    missing,
    requirement,
    saveConflict,
    saveStatus,
    state,
    update,
  }
}
