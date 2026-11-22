'use client'

import { useCallback, useEffect, useReducer, useRef, useState, useTransition } from 'react'

import { toast } from '@/hooks/use-toast'
import { hashQualityJourneyRequirementForBrowser } from '@/lib/quality-journey/requirement-browser'

import {
  confirmQualityJourneyDraftAction,
  createQualityJourneyDraftAction,
  restoreQualityJourneyDraftAction,
  saveQualityJourneyDraftAction,
} from './quality-journey-actions'
import {
  actionId,
  buildBriefRequirement,
  focusIntakeField,
  initialIntakeState,
  type DraftSnapshot,
  type IntakeState,
} from './quality-journey-create-form-shared'

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

function draftRequirementForSave(requirement: ReturnType<typeof buildBriefRequirement>) {
  return Object.fromEntries(Object.entries(requirement).filter(([, value]) => value !== undefined && value !== ''))
}

export function useQualityJourneyCreateIntake({
  draft,
  predecessorJourneyId,
  projectId,
  push,
}: {
  draft?: DraftSnapshot
  predecessorJourneyId?: string
  projectId: string
  push: (href: string) => void
}) {
  const [state, dispatch] = useReducer(
    (current: IntakeState, patch: Partial<IntakeState>) => ({ ...current, ...patch }),
    draft,
    initialIntakeState,
  )
  const idempotencyKey = useRef(actionId('quality-journey-draft'))
  const draftRef = useRef<DraftSnapshot | undefined>(draft)
  const pendingCreate = useRef<
    | {
        idempotencyKey: string
        requirement: ReturnType<typeof draftRequirementForSave>
        currentStep: number
        predecessorJourneyId?: string
      }
    | undefined
  >(undefined)
  const saveQueue = useRef(Promise.resolve())
  const saveTimer = useRef<number | undefined>(undefined)
  const editRevision = useRef(0)
  const confirmationRef = useRef<
    | {
        revision: number
        input: { draftId: string; expectedVersion: number; expectedDraftHash: string; requirementHash: string }
      }
    | undefined
  >(undefined)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'failed'>(
    draft ? 'saved' : 'idle',
  )
  const [saveConflict, setSaveConflict] = useState(false)
  const [isPending, startTransition] = useTransition()
  const requirement = buildBriefRequirement(state, draft?.requirement)
  const requirementRef = useRef(requirement)
  const currentStepRef = useRef(state.currentStep)
  requirementRef.current = requirement
  currentStepRef.current = state.currentStep

  const update = (patch: Partial<IntakeState>) => {
    editRevision.current += 1
    setSaveStatus('dirty')
    dispatch(patch)
  }

  const updateView = (patch: Partial<IntakeState>) => {
    dispatch(patch)
  }

  const enqueueSave = useCallback(
    function enqueueSave(requirementToSave = requirementRef.current, stepToSave = currentStepRef.current) {
      const requestedRevision = editRevision.current
      const draftRequirement = draftRequirementForSave(requirementToSave)
      const operation = saveQueue.current
        .then(async () => {
          setSaveStatus('saving')
          let activeDraft = draftRef.current
          let response: Awaited<ReturnType<typeof createQualityJourneyDraftAction>>
          if (!activeDraft) {
            pendingCreate.current ??= {
              idempotencyKey: idempotencyKey.current,
              requirement: draftRequirement,
              currentStep: stepToSave,
              ...(predecessorJourneyId ? { predecessorJourneyId } : {}),
            }
            // Recover an interrupted first autosave with the original request identity and payload.
            response = await createQualityJourneyDraftAction(pendingCreate.current)
            const created = savedDraftFrom(response)
            if (created) {
              draftRef.current = created
              const captured = pendingCreate.current
              pendingCreate.current = undefined
              if (
                JSON.stringify(captured.requirement) !== JSON.stringify(draftRequirement) ||
                captured.currentStep !== stepToSave
              )
                activeDraft = created
            }
          }
          if (activeDraft) {
            response = await saveQualityJourneyDraftAction({
              draftId: activeDraft.id,
              expectedVersion: activeDraft.version,
              requirement: draftRequirement,
              currentStep: stepToSave,
              ...(activeDraft.predecessorJourneyId ? { predecessorJourneyId: activeDraft.predecessorJourneyId } : {}),
            })
          }
          const saved = savedDraftFrom(response!)
          if (!saved) {
            setSaveStatus('failed')
            setSaveConflict(Boolean(response!.error?.includes('newer saved version')))
            return false
          }
          draftRef.current = saved
          const isLatestEdit = editRevision.current === requestedRevision
          setSaveStatus(isLatestEdit ? 'saved' : 'dirty')
          if (isLatestEdit) setSaveConflict(false)
          return isLatestEdit
        })
        .catch(() => {
          setSaveStatus('failed')
          return false
        })
      saveQueue.current = operation.then(() => undefined)
      return operation
    },
    [predecessorJourneyId],
  )

  const draftRequirement = JSON.stringify(requirement)
  const hasMeaningfulEdit = editRevision.current > 0
  useEffect(() => {
    if (!hasMeaningfulEdit) return
    saveTimer.current = window.setTimeout(() => enqueueSave(), 750)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [draftRequirement, enqueueSave, hasMeaningfulEdit, state.currentStep])

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (saveStatus === 'saved' || (saveStatus === 'idle' && !hasMeaningfulEdit)) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [hasMeaningfulEdit, saveStatus])

  async function verifyCurrentRequirement() {
    const revision = editRevision.current
    const requirement = requirementRef.current
    let hash: string
    try {
      hash = await hashQualityJourneyRequirementForBrowser(requirement)
    } catch {
      updateView({ error: 'Unable to verify this brief. Retry before creating the Journey.' })
      return
    }
    if (editRevision.current !== revision) {
      updateView({ error: 'Your brief changed while it was being verified. Review it before creating the Journey.' })
      return
    }
    return { revision, requirement, hash }
  }

  function submit() {
    if (!requirement.objective) {
      updateView({ error: 'Describe what you want to validate before starting.' })
      focusIntakeField('quality-journey-objective')
      return
    }
    startTransition(async () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      try {
        let confirmation = confirmationRef.current
        if (!confirmation || confirmation.revision !== editRevision.current) {
          const verified = await verifyCurrentRequirement()
          if (!verified) return
          const savedLatest = await enqueueSave(verified.requirement)
          const activeDraft = draftRef.current
          if (!activeDraft || !savedLatest || saveConflict || editRevision.current !== verified.revision) {
            updateView({ error: 'Your brief has not been saved yet. Retry after it is saved.' })
            return
          }
          confirmation = {
            revision: verified.revision,
            input: {
              draftId: activeDraft.id,
              expectedVersion: activeDraft.version,
              expectedDraftHash: activeDraft.draftHash,
              requirementHash: verified.hash,
            },
          }
          // Retain the exact request if the response is lost after confirmation commits.
          confirmationRef.current = confirmation
        }
        const response = await confirmQualityJourneyDraftAction(confirmation.input)
        const journeyId = journeyIdFrom(response)
        if (!journeyId) {
          const message = response.error ?? 'Unable to start this Quality Journey.'
          updateView({ error: message })
          toast({ title: 'Journey could not start', description: message, variant: 'destructive' })
          return
        }
        const continuationError = isRecord(response.data) ? stringProperty(response.data, 'continuationError') : null
        toast({
          title: 'Journey started',
          description: continuationError ?? 'Appraise is preparing Analysis from your brief.',
        })
        push(`/quality-journeys/${journeyId}?project=${encodeURIComponent(projectId)}`)
      } catch {
        updateView({ error: 'The start response was interrupted. Retry to recover the same Journey.' })
      }
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
        updateView({ error: response.error ?? 'Unable to restore this draft.' })
        return
      }
      push(`/quality-journeys/drafts/${activeDraft.id}?project=${encodeURIComponent(projectId)}`)
    })
  }

  function saveAsNewDraft() {
    draftRef.current = undefined
    idempotencyKey.current = actionId('quality-journey-draft')
    pendingCreate.current = undefined
    setSaveConflict(false)
    void enqueueSave()
  }

  return {
    actions: { enqueueSave, restore, saveAsNewDraft, submit },
    isPending,
    requirement,
    saveConflict,
    saveStatus,
    state,
    update,
    updateView,
  }
}
