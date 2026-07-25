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
  draftContractSource,
  draftHandlerBoilerplate,
  type DraftDefinition,
} from './step-definition-draft-helpers'
import { WizardPanel, WizardSidebar } from './step-definition-draft-phases'

export type StepDefinitionEditorDraft = {
  id: string
  revision: number
  definition: DraftDefinition
  artifact?: { handlerSource?: string; examples?: Array<{ name?: string }> } | null
}
type DraftRecord = { id: string; revision: number; definition?: DraftDefinition }
type CompileData = { revision?: number; diagnostics?: string[]; conformance?: { passed?: boolean } }
type CompiledDraftState = Pick<CompileData, 'diagnostics' | 'conformance'> & {
  revision: number
  definition?: DraftDefinition
}
type DraftSetter = (draft: DraftRecord | null) => void
type DefinitionSetter = (definition: DraftDefinition | ((current: DraftDefinition) => DraftDefinition)) => void
type BooleanSetter = (value: boolean) => void
type DiagnosticsSetter = (diagnostics: string[]) => void
type PreviewSetter = (preview: unknown) => void
type Router = { push: (href: string) => void }

function sameDefinition(left: DraftDefinition | undefined, right: DraftDefinition) {
  return left !== undefined && JSON.stringify(left) === JSON.stringify(right)
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
  if (definition.execution.kind === 'reviewed-extension') return Boolean(handlerSource.trim())
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

async function persistDraft({
  canSave,
  draft,
  managedDefinition,
  router,
  setBusy,
  setDraft,
}: {
  canSave: boolean
  draft: DraftRecord | null
  managedDefinition: DraftDefinition
  router: Router
  setBusy: BooleanSetter
  setDraft: DraftSetter
}): Promise<DraftRecord | null> {
  if (!canSave) return null
  if (draft && sameDefinition(draft.definition, managedDefinition)) return draft
  setBusy(true)
  const response = draft
    ? await reviseStepDefinitionDraftAction({
        draftId: draft.id,
        expectedRevision: draft.revision,
        definition: managedDefinition,
      })
    : await createStepDefinitionDraftAction(managedDefinition)
  setBusy(false)
  if (!response.success) {
    toast({ title: 'Draft not saved', description: actionError(response), variant: 'destructive' })
    return null
  }
  const record = response.data as DraftRecord
  setDraft({ id: record.id, revision: record.revision, definition: managedDefinition })
  if (!draft) router.push(`/step-definitions/drafts/${record.id}`)
  toast({ title: 'Draft saved', description: `Revision ${record.revision} is ready to resume.` })
  return record
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
}) {
  const saved = (await persist()) ?? draft
  if (!saved || !(await saveDraftArtifact(saved, handlerSource, exampleName, definition))) return
  const compiled = await compileAndReadDraft(saved)
  if (!compiled) return
  setDiagnostics(compiled.diagnostics ?? [])
  setConformancePassed(Boolean(compiled.conformance?.passed))
  setDraft({ id: saved.id, revision: compiled.revision, definition: compiled.definition ?? definition })
  if (compiled.definition) setDefinition(compiled.definition)
}

async function reviewAndPublishDraft({
  draft,
  definition,
  router,
  setPreview,
}: {
  draft: DraftRecord | null
  definition: DraftDefinition
  router: Router
  setPreview: PreviewSetter
}) {
  if (!draft) return
  const validation = await validateStepDefinitionDraftAction(draft.id)
  if (!(validation.data as { valid?: boolean })?.valid) {
    toast({ title: 'Draft has blockers', description: actionError(validation), variant: 'destructive' })
    return
  }
  const previewResponse = await previewStepDefinitionDraftAction(draft.id)
  if (!previewResponse.success) return
  setPreview(previewResponse.data)
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
  toast({ title: 'Step Definition published', description: `${definition.identity.id}@${definition.identity.version}` })
  router.push('/step-definitions/create')
}

function useEditorActions({
  canSave,
  definition,
  draft,
  exampleName,
  handlerSource,
  managedDefinition,
  router,
  setBusy,
  setConformancePassed,
  setCompiledDefinition,
  setDefinition,
  setDiagnostics,
  setDraft,
  setPreview,
}: {
  canSave: boolean
  definition: DraftDefinition
  draft: DraftRecord | null
  exampleName: string
  handlerSource: string
  managedDefinition: DraftDefinition
  router: Router
  setBusy: BooleanSetter
  setConformancePassed: BooleanSetter
  setCompiledDefinition: DefinitionSetter
  setDefinition: DefinitionSetter
  setDiagnostics: DiagnosticsSetter
  setDraft: DraftSetter
  setPreview: PreviewSetter
}) {
  const patchDefinition = (patch: Partial<DraftDefinition>) => setDefinition(current => ({ ...current, ...patch }))
  const patchIntent = (patch: Partial<DraftDefinition['intent']>) =>
    setDefinition(current => ({ ...current, intent: { ...current.intent, ...patch } }))
  const persist = () => persistDraft({ canSave, draft, managedDefinition, router, setBusy, setDraft })
  const compile = () =>
    compileDraft({
      draft,
      definition,
      exampleName,
      handlerSource,
      persist,
      setConformancePassed,
      setDefinition: setCompiledDefinition,
      setDiagnostics,
      setDraft,
    })
  const reviewAndPublish = () => reviewAndPublishDraft({ draft, definition, router, setPreview })
  return { compile, patchDefinition, patchIntent, persist, reviewAndPublish }
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

function useDraftEditorState(initialDraft?: StepDefinitionEditorDraft) {
  const [stage, setStage] = useState(0)
  const [draft, setDraft] = useState<DraftRecord | null>(() => initialDraftRecord(initialDraft))
  const [definition, setDefinition] = useState<DraftDefinition>(() => initialDefinition(initialDraft))
  const [handlerSource, setHandlerSource] = useState(() => initialHandlerSource(initialDraft))
  const [exampleName, setExampleName] = useState(() => initialExampleName(initialDraft))
  const [diagnostics, setDiagnostics] = useState<string[]>([])
  const [conformancePassed, setConformancePassed] = useState(false)
  const [preview, setPreview] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const generatedContract = useMemo(() => draftContractSource(definition), [definition])
  const managedDefinition = useMemo(() => applyManagedStepMetadata(definition), [definition])
  const { definitionReady, stageReady } = draftReadiness(definition, handlerSource, exampleName, conformancePassed)
  const canSave = stage === 0 ? definitionReady : stageReady[1] && Boolean(exampleName.trim())
  return {
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
    setBusy,
    setConformancePassed,
    setDefinition,
    setDiagnostics,
    setDraft,
    setExampleName,
    setHandlerSource,
    setPreview,
    setStage,
    stage,
    stageReady,
  }
}

export function StepDefinitionDraftEditor({ initialDraft }: { initialDraft?: StepDefinitionEditorDraft }) {
  const router = useRouter()
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
    setBusy,
    setConformancePassed,
    setDefinition,
    setDiagnostics,
    setDraft,
    setExampleName,
    setHandlerSource,
    setPreview,
    setStage,
    stage,
    stageReady,
  } = useDraftEditorState(initialDraft)

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

  const { compile, patchDefinition, patchIntent, persist, reviewAndPublish } = useEditorActions({
    canSave,
    definition,
    draft,
    exampleName,
    handlerSource,
    managedDefinition,
    router,
    setBusy,
    setConformancePassed,
    setCompiledDefinition: setDefinition,
    setDefinition: setAuthoredDefinition,
    setDiagnostics,
    setDraft,
    setPreview,
  })

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
        onReviewAndPublish={reviewAndPublish}
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
