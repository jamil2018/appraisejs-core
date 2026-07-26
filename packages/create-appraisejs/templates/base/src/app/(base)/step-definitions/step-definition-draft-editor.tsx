'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  compileStepDefinitionDraftArtifactAction,
  createStepDefinitionDraftAction,
  previewStepDefinitionDraftAction,
  publishStepDefinitionDraftAction,
  readStepDefinitionDraftAction,
  reviewStepDefinitionDraftAction,
  saveStepDefinitionDraftArtifactAction,
  reviseStepDefinitionDraftAction,
  validateStepDefinitionDraftAction,
} from '@/actions/step-definition/step-definition-actions'
import { toast } from '@/hooks/use-toast'
import type { ActionResponse } from '@/types/form/actionHandler'
import {
  createHumanStepDraft,
  applyManagedStepMetadata,
  canonicalDraftDefinitionJson,
  draftContractSource,
  draftHandlerBoilerplate,
  type DraftDefinition,
} from './step-definition-draft-helpers'
import { PublishedStepSuccess, WizardPanel, WizardSidebar } from './step-definition-draft-phases'

export type StepDefinitionEditorDraft = {
  id: string
  revision: number
  definition: DraftDefinition
  artifact?: { handlerSource?: string; examples?: Array<{ name?: string }> } | null
}
type DraftRecord = { id: string; revision: number; definition?: DraftDefinition }
type CompileData = { revision?: number; diagnostics?: string[]; conformance?: { passed?: boolean } }
type PublicationData = { step: { id: string; version: string }; definitionHash: string }
type CompiledDraftState = Pick<CompileData, 'diagnostics' | 'conformance'> & {
  revision: number
  definition?: DraftDefinition
}
type DraftSetter = (draft: DraftRecord | null) => void
type DefinitionSetter = (definition: DraftDefinition | ((current: DraftDefinition) => DraftDefinition)) => void
type BooleanSetter = (value: boolean) => void
type DiagnosticsSetter = (diagnostics: string[]) => void
type PreviewSetter = (preview: unknown) => void
type ArtifactFingerprintSetter = (fingerprint: string) => void
type PublishedStep = { id: string; version: string; signature: string }
type PublishedSetter = (published: PublishedStep | null) => void
type Router = { push: (href: string) => void; replace: (href: string) => void }

function sameDefinition(left: DraftDefinition | undefined, right: DraftDefinition) {
  return left !== undefined && canonicalDraftDefinitionJson(left) === canonicalDraftDefinitionJson(right)
}

function actionError(response: ActionResponse) {
  return response.error ?? response.message ?? 'The Step Definition request failed.'
}

function hasDefinitionDetails(definition: DraftDefinition) {
  return Boolean(
    definition.intent.title.trim() &&
    definition.intent.description.trim() &&
    definition.human.signature.trim() &&
    definition.inputs.every(input => input.description.trim()),
  )
}

function hasExecutionDetails(definition: DraftDefinition, handlerSource: string) {
  if (definition.execution.kind === 'unbound') return false
  if (definition.execution.kind === 'reviewed-extension')
    return Boolean(handlerSource.trim() && handlerSource.trim() !== draftHandlerBoilerplate(definition).trim())
  if (definition.execution.kind === 'operation') {
    return Boolean(definition.execution.handlerId.trim() && definition.execution.handlerVersion.trim())
  }
  return (
    definition.execution.steps.length > 0 &&
    definition.execution.steps.every(
      step => step.step.id.trim() && step.step.version.trim() && /^sha256:[a-f0-9]{64}$/.test(step.step.definitionHash),
    )
  )
}

async function saveDraftArtifact(
  draft: DraftRecord,
  handlerSource: string,
  exampleName: string,
  definition: DraftDefinition,
) {
  const response = await saveStepDefinitionDraftArtifactAction({
    draftId: draft.id,
    expectedRevision: draft.revision,
    artifact: {
      handlerSource,
      examples: [{ name: exampleName, inputs: definition.agent.examples[0]?.inputs ?? {} }],
    },
  })
  if (!response.success)
    toast({ title: 'Source not saved', description: actionError(response), variant: 'destructive' })
  return response.success
}

function artifactFingerprint(handlerSource: string, exampleName: string, definition: DraftDefinition) {
  const artifactDefinition =
    definition.execution.kind === 'reviewed-extension'
      ? {
          ...definition,
          execution: {
            ...definition.execution,
            sourceHash: `sha256:${'0'.repeat(64)}`,
            compiledHash: `sha256:${'0'.repeat(64)}`,
          },
        }
      : definition
  return JSON.stringify({
    definition: canonicalDraftDefinitionJson(artifactDefinition),
    handlerSource,
    examples: [{ name: exampleName, inputs: definition.agent.examples[0]?.inputs ?? {} }],
  })
}

async function compileAndReadDraft(draft: DraftRecord): Promise<CompiledDraftState | null> {
  const response = await compileStepDefinitionDraftArtifactAction({
    draftId: draft.id,
    expectedRevision: draft.revision,
  })
  if (!response.success) {
    toast({ title: 'Compilation failed', description: actionError(response), variant: 'destructive' })
    return null
  }
  const compiled = response.data as CompileData
  const refreshed = await readStepDefinitionDraftAction(draft.id)
  const record = refreshed.data as DraftRecord
  return { ...compiled, revision: compiled.revision ?? record.revision, definition: record.definition }
}

async function saveDefinitionRecord(
  draft: DraftRecord | null,
  managedDefinition: DraftDefinition,
): Promise<DraftRecord | null> {
  if (draft && sameDefinition(draft.definition, managedDefinition)) return draft
  const response = draft
    ? await reviseStepDefinitionDraftAction({
        draftId: draft.id,
        expectedRevision: draft.revision,
        definition: managedDefinition,
      })
    : await createStepDefinitionDraftAction(managedDefinition)
  if (response.success) return response.data as DraftRecord
  toast({ title: 'Draft not saved', description: actionError(response), variant: 'destructive' })
  return null
}

async function saveChangedArtifact({
  definition,
  exampleName,
  handlerSource,
  record,
  savedArtifactFingerprint,
  setSavedArtifactFingerprint,
}: {
  definition: DraftDefinition
  exampleName: string
  handlerSource: string
  record: DraftRecord
  savedArtifactFingerprint: string | null
  setSavedArtifactFingerprint: ArtifactFingerprintSetter
}) {
  const nextFingerprint = artifactFingerprint(handlerSource, exampleName, definition)
  if (savedArtifactFingerprint === nextFingerprint) return true
  if (!(await saveDraftArtifact(record, handlerSource, exampleName, definition))) return false
  setSavedArtifactFingerprint(nextFingerprint)
  return true
}

type PersistDraftInput = {
  canSave: boolean
  draft: DraftRecord | null
  definition: DraftDefinition
  exampleName: string
  handlerSource: string
  managedDefinition: DraftDefinition
  router: Router
  savedArtifactFingerprint: string | null
  setBusy: BooleanSetter
  setDraft: DraftSetter
  setSavedArtifactFingerprint: ArtifactFingerprintSetter
  targetStage?: number
  manageBusy?: boolean
}

async function persistDraftData({
  draft,
  definition,
  exampleName,
  handlerSource,
  managedDefinition,
  router,
  savedArtifactFingerprint,
  setDraft,
  setSavedArtifactFingerprint,
  targetStage,
}: Omit<PersistDraftInput, 'canSave' | 'manageBusy' | 'setBusy'>): Promise<DraftRecord | null> {
  const record = await saveDefinitionRecord(draft, managedDefinition)
  if (!record) return null
  if (record !== draft) setDraft({ id: record.id, revision: record.revision, definition: managedDefinition })
  const artifactSaved = await saveChangedArtifact({
    definition,
    exampleName,
    handlerSource,
    record,
    savedArtifactFingerprint,
    setSavedArtifactFingerprint,
  })
  if (!artifactSaved) return null
  if (!draft) {
    const stageQuery = targetStage === undefined ? '' : `?stage=${targetStage}`
    router.push(`/step-definitions/drafts/${record.id}${stageQuery}`)
  }
  toast({ title: 'Draft saved', description: `Revision ${record.revision} is ready to resume.` })
  return record
}

async function persistDraft({ canSave, manageBusy = true, setBusy, ...input }: PersistDraftInput) {
  if (!canSave) return null
  if (manageBusy) setBusy(true)
  try {
    return await persistDraftData(input)
  } catch {
    toast({
      title: 'Draft not saved',
      description: 'The save request did not complete. Your edits are still available.',
      variant: 'destructive',
    })
    return null
  } finally {
    if (manageBusy) setBusy(false)
  }
}

async function compileDraft({
  draft,
  definition,
  exampleName,
  handlerSource,
  persist,
  setConformancePassed,
  setDefinition,
  setDiagnostics,
  setDraft,
  setBusy,
  setSavedArtifactFingerprint,
}: {
  draft: DraftRecord | null
  definition: DraftDefinition
  exampleName: string
  handlerSource: string
  persist: () => Promise<DraftRecord | null>
  setConformancePassed: BooleanSetter
  setDefinition: DefinitionSetter
  setDiagnostics: DiagnosticsSetter
  setDraft: DraftSetter
  setBusy: BooleanSetter
  setSavedArtifactFingerprint: ArtifactFingerprintSetter
}) {
  setBusy(true)
  try {
    const saved = (await persist()) ?? draft
    if (!saved) return
    const compiled = await compileAndReadDraft(saved)
    if (!compiled) return
    setDiagnostics(compiled.diagnostics ?? [])
    setConformancePassed(Boolean(compiled.conformance?.passed))
    setDraft({ id: saved.id, revision: compiled.revision, definition: compiled.definition ?? definition })
    setSavedArtifactFingerprint(artifactFingerprint(handlerSource, exampleName, compiled.definition ?? definition))
    if (compiled.definition) setDefinition(compiled.definition)
  } finally {
    setBusy(false)
  }
}

async function preparePublicationReview({
  draft,
  setBusy,
  setPreview,
}: {
  draft: DraftRecord | null
  setBusy: BooleanSetter
  setPreview: PreviewSetter
}) {
  if (!draft) return
  setBusy(true)
  try {
    const validation = await validateStepDefinitionDraftAction(draft.id)
    if (!(validation.data as { valid?: boolean })?.valid) {
      toast({ title: 'Draft has blockers', description: actionError(validation), variant: 'destructive' })
      return
    }
    const previewResponse = await previewStepDefinitionDraftAction(draft.id)
    if (!previewResponse.success) {
      toast({ title: 'Preview unavailable', description: actionError(previewResponse), variant: 'destructive' })
      return
    }
    setPreview(previewResponse.data)
  } catch {
    toast({
      title: 'Preview unavailable',
      description: 'The review request did not complete. Your draft is unchanged.',
      variant: 'destructive',
    })
  } finally {
    setBusy(false)
  }
}

async function publishReviewedDraft({
  definition,
  draft,
  router,
  setBusy,
  setPublished,
}: {
  definition: DraftDefinition
  draft: DraftRecord | null
  router: Router
  setBusy: BooleanSetter
  setPublished: PublishedSetter
}) {
  if (!draft) return
  setBusy(true)
  try {
    const review = await reviewStepDefinitionDraftAction({
      draftId: draft.id,
      expectedRevision: draft.revision,
    })
    if (!review.success) {
      toast({ title: 'Review failed', description: actionError(review), variant: 'destructive' })
      return
    }
    const publication = await publishStepDefinitionDraftAction({
      draftId: draft.id,
      expectedRevision: draft.revision,
    })
    if (!publication.success) {
      toast({ title: 'Publication failed', description: actionError(publication), variant: 'destructive' })
      return
    }
    toast({
      title: 'Step Definition published',
      description: `${definition.identity.id}@${definition.identity.version}`,
    })
    const receiptData = publication.data as PublicationData
    setPublished({
      id: receiptData.step.id,
      version: receiptData.step.version,
      signature: definition.human.signature,
    })
    const receipt = new URLSearchParams({
      id: receiptData.step.id,
      version: receiptData.step.version,
      definitionHash: receiptData.definitionHash,
    })
    router.replace(`/step-definitions/published?${receipt.toString()}`)
  } catch {
    toast({
      title: 'Publication failed',
      description: 'The publication request did not complete. Your reviewed draft is still available.',
      variant: 'destructive',
    })
  } finally {
    setBusy(false)
  }
}

function useEditorActions({
  canSave,
  definition,
  draft,
  exampleName,
  handlerSource,
  managedDefinition,
  router,
  savedArtifactFingerprint,
  setBusy,
  setConformancePassed,
  setCompiledDefinition,
  setDefinition,
  setDiagnostics,
  setDraft,
  setPublished,
  setPreview,
  setSavedArtifactFingerprint,
}: {
  canSave: boolean
  definition: DraftDefinition
  draft: DraftRecord | null
  exampleName: string
  handlerSource: string
  managedDefinition: DraftDefinition
  router: Router
  savedArtifactFingerprint: string | null
  setBusy: BooleanSetter
  setConformancePassed: BooleanSetter
  setCompiledDefinition: DefinitionSetter
  setDefinition: DefinitionSetter
  setDiagnostics: DiagnosticsSetter
  setDraft: DraftSetter
  setPublished: PublishedSetter
  setPreview: PreviewSetter
  setSavedArtifactFingerprint: ArtifactFingerprintSetter
}) {
  const patchDefinition = (patch: Partial<DraftDefinition>) => setDefinition(current => ({ ...current, ...patch }))
  const patchIntent = (patch: Partial<DraftDefinition['intent']>) =>
    setDefinition(current => ({ ...current, intent: { ...current.intent, ...patch } }))
  const persist = (targetStage?: number) =>
    persistDraft({
      canSave,
      definition,
      draft,
      exampleName,
      handlerSource,
      managedDefinition,
      router,
      savedArtifactFingerprint,
      setBusy,
      setDraft,
      setSavedArtifactFingerprint,
      targetStage,
    })
  const persistForCompile = () =>
    persistDraft({
      canSave,
      definition,
      draft,
      exampleName,
      handlerSource,
      managedDefinition,
      router,
      savedArtifactFingerprint,
      setBusy,
      setDraft,
      setSavedArtifactFingerprint,
      manageBusy: false,
    })
  const compile = () =>
    compileDraft({
      draft,
      definition,
      exampleName,
      handlerSource,
      persist: persistForCompile,
      setConformancePassed,
      setDefinition: setCompiledDefinition,
      setDiagnostics,
      setDraft,
      setBusy,
      setSavedArtifactFingerprint,
    })
  const prepareReview = () => preparePublicationReview({ draft, setBusy, setPreview })
  const publish = () => publishReviewedDraft({ draft, definition, router, setBusy, setPublished })
  return { compile, patchDefinition, patchIntent, persist, prepareReview, publish }
}

function initialDraftRecord(initialDraft?: StepDefinitionEditorDraft) {
  return initialDraft
    ? { id: initialDraft.id, revision: initialDraft.revision, definition: initialDraft.definition }
    : null
}
function initialDefinition(initialDraft?: StepDefinitionEditorDraft) {
  return initialDraft?.definition ?? createHumanStepDraft()
}
function initialHandlerSource(initialDraft?: StepDefinitionEditorDraft) {
  return initialDraft?.artifact?.handlerSource ?? draftHandlerBoilerplate(initialDefinition(initialDraft))
}
function initialExampleName(initialDraft?: StepDefinitionEditorDraft) {
  return initialDraft?.artifact?.examples?.[0]?.name ?? 'Happy path'
}
function initialArtifactFingerprint(initialDraft?: StepDefinitionEditorDraft) {
  if (!initialDraft?.artifact) return null
  return artifactFingerprint(
    initialHandlerSource(initialDraft),
    initialExampleName(initialDraft),
    initialDefinition(initialDraft),
  )
}
function draftReadiness(
  definition: DraftDefinition,
  handlerSource: string,
  exampleName: string,
  conformancePassed: boolean,
) {
  const definitionReady = hasDefinitionDetails(definition)
  const executionReady = hasExecutionDetails(definition, handlerSource)
  const verificationReady = Boolean(exampleName.trim() && conformancePassed)
  return {
    definitionReady,
    stageReady: [
      definitionReady,
      definitionReady && executionReady,
      definitionReady && executionReady && verificationReady,
      false,
    ],
  }
}

function useDraftEditorState(initialDraft?: StepDefinitionEditorDraft, initialStage = 0) {
  const [stage, setStage] = useState(initialStage)
  const [draft, setDraft] = useState<DraftRecord | null>(() => initialDraftRecord(initialDraft))
  const [definition, setDefinition] = useState<DraftDefinition>(() => initialDefinition(initialDraft))
  const [handlerSource, setHandlerSource] = useState(() => initialHandlerSource(initialDraft))
  const [exampleName, setExampleName] = useState(() => initialExampleName(initialDraft))
  const [diagnostics, setDiagnostics] = useState<string[]>([])
  const [conformancePassed, setConformancePassed] = useState(false)
  const [preview, setPreview] = useState<unknown>(null)
  const [savedArtifactFingerprint, setSavedArtifactFingerprint] = useState<string | null>(() =>
    initialArtifactFingerprint(initialDraft),
  )
  const [published, setPublished] = useState<PublishedStep | null>(null)
  const [busy, setBusy] = useState(false)
  const generatedContract = useMemo(() => draftContractSource(definition), [definition])
  const managedDefinition = useMemo(() => applyManagedStepMetadata(definition), [definition])
  const { definitionReady, stageReady } = draftReadiness(definition, handlerSource, exampleName, conformancePassed)
  const canSave = stage === 0 ? definitionReady : stageReady[1] && Boolean(exampleName.trim())
  const state = {
    busy,
    canSave,
    conformancePassed,
    definition,
    diagnostics,
    draft,
    exampleName,
    generatedContract,
    handlerSource,
    managedDefinition,
    preview,
    published,
    savedArtifactFingerprint,
    stage,
    stageReady,
  }
  const actions = {
    setBusy,
    setConformancePassed,
    setDefinition,
    setDiagnostics,
    setDraft,
    setExampleName,
    setHandlerSource,
    setPreview,
    setPublished,
    setSavedArtifactFingerprint,
    setStage,
  }
  return [state, actions] as const
}

export function StepDefinitionDraftEditor({
  initialDraft,
  initialStage,
}: {
  initialDraft?: StepDefinitionEditorDraft
  initialStage?: number
}) {
  const router = useRouter()
  const [editorState, editorActions] = useDraftEditorState(initialDraft, initialStage)
  const {
    busy,
    canSave,
    conformancePassed,
    definition,
    diagnostics,
    draft,
    exampleName,
    generatedContract,
    handlerSource,
    managedDefinition,
    preview,
    published,
    savedArtifactFingerprint,
    stage,
    stageReady,
  } = editorState
  const {
    setBusy,
    setConformancePassed,
    setDefinition,
    setDiagnostics,
    setDraft,
    setExampleName,
    setHandlerSource,
    setPreview,
    setPublished,
    setSavedArtifactFingerprint,
    setStage,
  } = editorActions

  const invalidateEvidence = () => {
    setConformancePassed(false)
    setDiagnostics([])
    setPreview(null)
  }
  const setAuthoredDefinition: DefinitionSetter = update => {
    invalidateEvidence()
    setDefinition(update)
  }
  const setAuthoredHandlerSource: typeof setHandlerSource = update => {
    invalidateEvidence()
    setHandlerSource(update)
  }
  const setAuthoredExampleName: typeof setExampleName = update => {
    invalidateEvidence()
    setExampleName(update)
  }

  const { compile, patchDefinition, patchIntent, persist, prepareReview, publish } = useEditorActions({
    canSave,
    definition,
    draft,
    exampleName,
    handlerSource,
    managedDefinition,
    router,
    savedArtifactFingerprint,
    setBusy,
    setConformancePassed,
    setCompiledDefinition: setDefinition,
    setDefinition: setAuthoredDefinition,
    setDiagnostics,
    setDraft,
    setPublished,
    setPreview,
    setSavedArtifactFingerprint,
  })

  if (published) return <PublishedStepSuccess published={published} />

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <WizardSidebar draft={draft} stage={stage} stageReady={stageReady} onStageChange={setStage} />
      <WizardPanel
        busy={busy}
        canSave={canSave}
        conformancePassed={conformancePassed}
        definition={definition}
        diagnostics={diagnostics}
        draft={draft}
        exampleName={exampleName}
        generatedContract={generatedContract}
        handlerSource={handlerSource}
        onCompile={compile}
        onPersist={persist}
        onPrepareReview={prepareReview}
        onPublish={publish}
        patchDefinition={patchDefinition}
        patchIntent={patchIntent}
        preview={preview}
        setDefinition={setAuthoredDefinition}
        setExampleName={setAuthoredExampleName}
        setHandlerSource={setAuthoredHandlerSource}
        setStage={setStage}
        stage={stage}
        stageReady={stageReady}
      />
    </div>
  )
}
