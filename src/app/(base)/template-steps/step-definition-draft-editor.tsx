'use client'

import { Children, cloneElement, isValidElement, useId, useMemo, useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Code2,
  Layers3,
  Plus,
  Save,
} from 'lucide-react'

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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { ActionResponse } from '@/types/form/actionHandler'
import {
  createHumanStepDraft,
  applyManagedStepMetadata,
  draftContractSource,
  draftHandlerBoilerplate,
  reconcileNamedInputs,
  type DraftDefinition,
} from './step-definition-draft-helpers'

const stages = ['Define behavior', 'Connect implementation', 'Verify readiness', 'Review & publish'] as const

export type StepDefinitionEditorDraft = {
  id: string
  revision: number
  definition: DraftDefinition
  artifact?: { handlerSource?: string; examples?: Array<{ name?: string }> } | null
}
export type StepDefinitionEditorGroup = { id: string; name: string; type: string; description: string | null }
type DraftRecord = { id: string; revision: number; definition?: DraftDefinition }
type CompileData = { revision?: number; diagnostics?: string[]; conformance?: { passed?: boolean } }

function actionError(response: ActionResponse) {
  return response.error ?? response.message ?? 'The Step Definition request failed.'
}

function parseLines(value: string) {
  return value.split('\n').flatMap(item => {
    const trimmed = item.trim()
    return trimmed ? [trimmed] : []
  })
}

function hasDefinitionDetails(definition: DraftDefinition) {
  return Boolean(
    definition.intent.title.trim() &&
    definition.intent.description.trim() &&
    definition.human.groupId.trim() &&
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
  return definition.execution.steps.every(step => step.step.id.trim() && step.step.version.trim())
}

// fallow-ignore-next-line complexity -- The wizard coordinates four schema-driven phases in one resumable form boundary.
export function StepDefinitionDraftEditor({
  initialDraft,
  groups,
}: {
  initialDraft?: StepDefinitionEditorDraft
  groups: StepDefinitionEditorGroup[]
}) {
  const router = useRouter()
  const [stage, setStage] = useState(0)
  const [draft, setDraft] = useState<DraftRecord | null>(
    initialDraft ? { id: initialDraft.id, revision: initialDraft.revision } : null,
  )
  const [definition, setDefinition] = useState<DraftDefinition>(
    () => initialDraft?.definition ?? createHumanStepDraft(),
  )
  const [handlerSource, setHandlerSource] = useState(
    () =>
      initialDraft?.artifact?.handlerSource ??
      draftHandlerBoilerplate(initialDraft?.definition ?? createHumanStepDraft()),
  )
  const [exampleName, setExampleName] = useState(initialDraft?.artifact?.examples?.[0]?.name ?? 'Happy path')
  const [diagnostics, setDiagnostics] = useState<string[]>([])
  const [conformancePassed, setConformancePassed] = useState(false)
  const [preview, setPreview] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const generatedContract = useMemo(() => draftContractSource(definition), [definition])
  const managedDefinition = useMemo(() => applyManagedStepMetadata(definition), [definition])
  const definitionReady = hasDefinitionDetails(definition)
  const executionReady = hasExecutionDetails(definition, handlerSource)
  const verificationReady = Boolean(exampleName.trim() && conformancePassed)
  const stageReady = [
    definitionReady,
    definitionReady && executionReady,
    definitionReady && executionReady && verificationReady,
    false,
  ]
  const canSave = stage === 0 ? definitionReady : definitionReady && executionReady && Boolean(exampleName.trim())

  const patchDefinition = (patch: Partial<DraftDefinition>) => setDefinition(current => ({ ...current, ...patch }))
  const patchIntent = (patch: Partial<DraftDefinition['intent']>) =>
    setDefinition(current => ({ ...current, intent: { ...current.intent, ...patch } }))
  const patchHuman = (patch: Partial<DraftDefinition['human']>) =>
    setDefinition(current => ({ ...current, human: { ...current.human, ...patch } }))
  const persist = async () => {
    if (!canSave) return null
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
    setDraft({ id: record.id, revision: record.revision })
    if (!draft) router.push(`/template-steps/drafts/${record.id}`)
    toast({ title: 'Draft saved', description: `Revision ${record.revision} is ready to resume.` })
    return record
  }

  // fallow-ignore-next-line complexity -- This preserves the ordered save, artifact, compile, and revision refresh transaction in the UI client.
  const compile = async () => {
    const saved = (await persist()) ?? draft
    if (!saved) return
    const artifactResponse = await saveStepDefinitionDraftArtifactAction({
      draftId: saved.id,
      expectedRevision: saved.revision,
      artifact: {
        handlerSource,
        examples: [{ name: exampleName, inputs: definition.agent.examples[0]?.inputs ?? {} }],
      },
    })
    if (!artifactResponse.success) {
      toast({ title: 'Source not saved', description: actionError(artifactResponse), variant: 'destructive' })
      return
    }
    const response = await compileStepDefinitionDraftArtifactAction({
      draftId: saved.id,
      expectedRevision: saved.revision,
    })
    if (!response.success) {
      toast({ title: 'Compilation failed', description: actionError(response), variant: 'destructive' })
      return
    }
    const data = response.data as CompileData
    setDiagnostics(data.diagnostics ?? [])
    setConformancePassed(Boolean(data.conformance?.passed))
    const refreshed = await readStepDefinitionDraftAction(saved.id)
    const record = refreshed.data as DraftRecord
    setDraft({ id: saved.id, revision: data.revision ?? record.revision })
    if (record.definition) setDefinition(record.definition)
  }

  const reviewAndPublish = async () => {
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
      reviewAuthority: 'local-user',
    })
    if (!review.success) {
      toast({ title: 'Review failed', description: actionError(review), variant: 'destructive' })
      return
    }
    const publication = await publishStepDefinitionDraftAction({
      draftId: draft.id,
      expectedRevision: draft.revision,
      conformanceRunId: `human-wizard:${draft.id}:${draft.revision}`,
    })
    if (!publication.success) {
      toast({ title: 'Publication failed', description: actionError(publication), variant: 'destructive' })
      return
    }
    toast({
      title: 'Step Definition published',
      description: `${definition.identity.id}@${definition.identity.version}`,
    })
    router.push('/template-steps')
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <Card className="h-fit overflow-hidden border-white/[0.08] bg-[rgba(18,37,64,0.42)] shadow-none">
        <CardHeader className="border-b border-white/[0.06] px-4 pb-4 pt-4">
          <div className="flex items-center gap-3">
            <div className="border-primary/20 bg-primary/[0.04] flex size-9 items-center justify-center rounded-md border text-primary">
              <Layers3 className="size-4" />
            </div>
            <div>
              <CardTitle className="text-sm text-zinc-100">Creation progress</CardTitle>
              <CardDescription className="mt-1 text-xs">
                {draft ? `Draft revision ${draft.revision}` : 'Changes are not saved yet'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-4">
          <Progress aria-label="Wizard progress" value={((stage + 1) / stages.length) * 100} />
          <ol className="mt-4 space-y-1 text-sm">
            {stages.map((label, index) => (
              <li key={label}>
                <button
                  type="button"
                  disabled={index > 0 && !stageReady[index - 1]}
                  className={cn(
                    'flex min-h-10 w-full items-center gap-3 rounded-md border px-2.5 text-left text-xs outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary',
                    stage === index
                      ? 'border-primary/20 bg-primary/[0.06] text-zinc-100'
                      : 'border-transparent text-zinc-400 hover:border-white/[0.06] hover:bg-white/[0.025] hover:text-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:border-transparent disabled:hover:bg-transparent',
                  )}
                  aria-current={stage === index ? 'step' : undefined}
                  onClick={() => setStage(index)}
                >
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold',
                      index < stage
                        ? 'border-primary/25 bg-primary/[0.08] text-primary'
                        : stage === index
                          ? 'border-white/[0.12] bg-white/[0.05] text-zinc-100'
                          : 'border-white/[0.06] text-zinc-500',
                    )}
                  >
                    {stageReady[index] ? <CheckCircle2 className="size-3.5" /> : index + 1}
                  </span>
                  <span className="leading-4">{label}</span>
                </button>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden border-white/[0.08] bg-[rgba(18,37,64,0.42)] shadow-none">
        <CardHeader className="border-b border-white/[0.06] px-5 pb-4 pt-5">
          <CardTitle className="text-base text-zinc-100">{stages[stage]}</CardTitle>
          <CardDescription className="mt-1 max-w-2xl text-xs leading-5">
            {stage === 0 && 'Describe the reusable behavior and the sentence people will use.'}
            {stage === 1 && 'Choose how the behavior runs and complete its generated handler contract.'}
            {stage === 2 && 'Compile the implementation and produce executable readiness evidence.'}
            {stage === 3 && 'Inspect the exact human and agent projections before publishing.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 px-5 pb-5 pt-5">
          {stage === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title">
                <Input
                  required
                  value={definition.intent.title}
                  placeholder="e.g. Send account notification"
                  onChange={event => patchIntent({ title: event.target.value })}
                />
              </Field>
              <Field label="Group">
                <StepGroupPicker
                  groups={groups}
                  value={definition.human.groupId}
                  onValueChange={groupId => patchHuman({ groupId })}
                />
              </Field>
              <Field label="Purpose" wide>
                <Textarea
                  required
                  value={definition.intent.description}
                  placeholder="Explain the single reusable behavior and when it should be used."
                  onChange={event => patchIntent({ description: event.target.value })}
                />
              </Field>
              <p className="text-xs leading-5 text-zinc-500 sm:col-span-2">
                AppraiseJS manages the technical ID, initial version, and discovery metadata when this draft is saved.
              </p>
            </div>
          )}
          {stage === 0 && (
            <Field label="Readable Gherkin sentence">
              <Input
                required
                value={definition.human.signature}
                placeholder="e.g. I send an account notification"
                onChange={event => setDefinition(current => reconcileNamedInputs(current, event.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Named placeholders such as {'{accountName}'} become stable typed inputs.
              </p>
            </Field>
          )}
          {stage === 0 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-zinc-200">Sentence inputs</h3>
                <p className="mt-1 text-xs text-zinc-500">Add a plain-language description for each named input.</p>
              </div>
              {definition.inputs.map((input, index) => (
                <div key={input.name} className="grid gap-3 rounded-md border border-white/10 p-3 sm:grid-cols-3">
                  <Field label="Input">
                    <Input value={input.name} readOnly />
                  </Field>
                  <Field label="Type">
                    <Select
                      value={input.type}
                      onValueChange={value =>
                        patchDefinition({
                          inputs: definition.inputs.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, type: value as typeof item.type } : item,
                          ),
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          'string',
                          'number',
                          'boolean',
                          'json',
                          'locator',
                          'environment-ref',
                          'stored-value-ref',
                          'artifact-ref',
                          'reviewed-extension-ref',
                        ].map(type => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Description">
                    <Input
                      required
                      value={input.description}
                      onChange={event =>
                        patchDefinition({
                          inputs: definition.inputs.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, description: event.target.value } : item,
                          ),
                        })
                      }
                    />
                  </Field>
                </div>
              ))}
              {!definition.inputs.length && (
                <p className="text-sm text-muted-foreground">
                  Add named placeholders in the human sentence to define inputs.
                </p>
              )}
            </div>
          )}
          {stage === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Binding mode">
                <Select
                  value={definition.execution.kind}
                  onValueChange={value => {
                    const hash = `sha256:${'0'.repeat(64)}` as const
                    if (value === 'unbound') patchDefinition({ execution: { kind: 'unbound' } })
                    if (value === 'operation')
                      patchDefinition({
                        execution: {
                          kind: 'operation',
                          handlerId: definition.identity.id,
                          handlerVersion: definition.identity.version,
                          runtime: 'node',
                        },
                      })
                    if (value === 'composition')
                      patchDefinition({
                        execution: {
                          kind: 'composition',
                          steps: [
                            {
                              step: { id: 'builtin.example', version: '1' },
                              inputs: {},
                            },
                          ],
                        },
                      })
                    if (value === 'reviewed-extension')
                      patchDefinition({
                        execution: {
                          kind: 'reviewed-extension',
                          extensionId: definition.identity.id,
                          extensionVersion: definition.identity.version,
                          exportName: 'handler',
                          sourceHash: hash,
                          compiledHash: hash,
                          runtime: 'node',
                        },
                      })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reviewed-extension">New user-authored handler</SelectItem>
                    <SelectItem value="operation">Existing trusted handler</SelectItem>
                    <SelectItem value="composition">Existing ready composition</SelectItem>
                    <SelectItem value="unbound">Unbound draft</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {definition.execution.kind === 'operation' && (
                <>
                  <Field label="Handler ID">
                    <Input
                      value={definition.execution.handlerId}
                      onChange={event =>
                        setDefinition(current =>
                          current.execution.kind === 'operation'
                            ? {
                                ...current,
                                execution: { ...current.execution, handlerId: event.target.value },
                              }
                            : current,
                        )
                      }
                    />
                  </Field>
                  <Field label="Handler version">
                    <Input
                      value={definition.execution.handlerVersion}
                      onChange={event =>
                        setDefinition(current =>
                          current.execution.kind === 'operation'
                            ? {
                                ...current,
                                execution: { ...current.execution, handlerVersion: event.target.value },
                              }
                            : current,
                        )
                      }
                    />
                  </Field>
                </>
              )}
              {definition.execution.kind === 'composition' && (
                <>
                  <Field label="Ready child Step ID">
                    <Input
                      value={definition.execution.steps[0]?.step.id ?? ''}
                      onChange={event =>
                        setDefinition(current =>
                          current.execution.kind === 'composition'
                            ? {
                                ...current,
                                execution: {
                                  kind: 'composition',
                                  steps: [
                                    {
                                      step: {
                                        id: event.target.value,
                                        version: current.execution.steps[0]?.step.version ?? '1',
                                      },
                                      inputs: current.execution.steps[0]?.inputs ?? {},
                                    },
                                  ],
                                },
                              }
                            : current,
                        )
                      }
                    />
                  </Field>
                  <Field label="Child version">
                    <Input
                      value={definition.execution.steps[0]?.step.version ?? ''}
                      onChange={event =>
                        setDefinition(current =>
                          current.execution.kind === 'composition'
                            ? {
                                ...current,
                                execution: {
                                  kind: 'composition',
                                  steps: [
                                    {
                                      step: {
                                        id: current.execution.steps[0]?.step.id ?? 'builtin.example',
                                        version: event.target.value,
                                      },
                                      inputs: current.execution.steps[0]?.inputs ?? {},
                                    },
                                  ],
                                },
                              }
                            : current,
                        )
                      }
                    />
                  </Field>
                </>
              )}
              <Field label="Runtime">
                <Select
                  value={
                    definition.execution.kind === 'reviewed-extension' || definition.execution.kind === 'operation'
                      ? definition.execution.runtime
                      : 'node'
                  }
                  onValueChange={runtime => {
                    if (definition.execution.kind === 'reviewed-extension' || definition.execution.kind === 'operation')
                      patchDefinition({
                        execution: {
                          ...definition.execution,
                          runtime: runtime as 'browser' | 'api' | 'node' | 'database',
                        },
                      })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['browser', 'api', 'node', 'database'].map(runtime => (
                      <SelectItem key={runtime} value={runtime}>
                        {runtime}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Capabilities (one per line)" wide>
                <Textarea
                  value={definition.intent.capabilities.join('\n')}
                  onChange={event => patchIntent({ capabilities: parseLines(event.target.value) })}
                />
              </Field>
            </div>
          )}
          {stage === 1 && <CodePanel label="Generated contract" value={generatedContract} />}
          {stage === 1 && (
            <Field label="User-owned handler source">
              <Textarea
                className="min-h-80 font-mono text-xs"
                value={handlerSource}
                onChange={event => setHandlerSource(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">Metadata regeneration never overwrites this source.</p>
            </Field>
          )}
          {stage === 2 && (
            <div className="space-y-4">
              <Field label="Example name">
                <Input required value={exampleName} onChange={event => setExampleName(event.target.value)} />
              </Field>
              <Button
                type="button"
                onClick={compile}
                disabled={busy || definition.execution.kind !== 'reviewed-extension'}
              >
                <Code2 className="size-4" />
                Compile and run conformance
              </Button>
              <Alert variant={conformancePassed ? 'default' : 'destructive'}>
                <AlertCircle />
                <AlertTitle>{conformancePassed ? 'Executable readiness passed' : 'Not executable yet'}</AlertTitle>
                <AlertDescription>
                  {diagnostics.length
                    ? diagnostics.join(' ')
                    : 'Save and compile the handler to produce diagnostics and conformance evidence.'}
                </AlertDescription>
              </Alert>
            </div>
          )}
          {stage === 3 && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <CodePanel
                  label="Human projection"
                  value={`${definition.human.keywordCompatibility.join('/')} ${definition.human.signature}`}
                />
                <CodePanel label="Agent projection" value={JSON.stringify(definition.agent, null, 2)} />
              </div>
              {preview ? (
                <CodePanel label="Exact publication preview" value={JSON.stringify(preview, null, 2)} />
              ) : null}
              <Button type="button" onClick={reviewAndPublish} disabled={!draft || !conformancePassed}>
                Review exact draft and publish immutable version
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={stage === 0}
              onClick={() => setStage(current => current - 1)}
            >
              <ChevronLeft className="size-4" />
              Back
            </Button>
            <Button type="button" variant="secondary" onClick={persist} disabled={busy || !canSave}>
              <Save className="size-4" />
              {busy ? 'Saving…' : 'Save draft'}
            </Button>
            <Button
              type="button"
              disabled={stage === stages.length - 1 || !stageReady[stage] || busy}
              onClick={async () => {
                const saved = await persist()
                if (saved) setStage(current => current + 1)
              }}
            >
              Save and continue
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  const id = useId()
  const [control, ...supporting] = Children.toArray(children)
  const labelledControl = isValidElement(control)
    ? cloneElement(control as ReactElement<{ id?: string }>, { id })
    : control
  return (
    <div className={`space-y-2 ${wide ? 'sm:col-span-2' : ''}`}>
      <Label htmlFor={id}>{label}</Label>
      {labelledControl}
      {supporting}
    </div>
  )
}

function CodePanel({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-white/10 bg-black/20 p-3 text-xs">
        {value}
      </pre>
    </div>
  )
}

function StepGroupPicker({
  groups,
  value,
  onValueChange,
}: {
  groups: StepDefinitionEditorGroup[]
  value: string
  onValueChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  const selected = groups.find(group => group.name === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label="Group"
          aria-required="true"
          aria-expanded={open}
          aria-controls={listId}
          className="h-9 w-full justify-between border-white/[0.1] bg-white/[0.02] px-3 py-1 text-left font-normal hover:border-white/[0.16] hover:bg-white/[0.035]"
        >
          {selected ? (
            <span className="min-w-0 truncate text-sm text-zinc-100">{selected.name}</span>
          ) : (
            <span className="text-sm text-zinc-500">Choose where this step belongs</span>
          )}
          <ChevronsUpDown className="ml-3 size-4 shrink-0 text-zinc-500" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] border-white/[0.12] bg-[rgba(16,30,50,0.98)] p-0 shadow-[0_18px_50px_rgba(0,0,0,0.4)]"
      >
        <Command>
          <CommandInput placeholder="Search step groups…" />
          <CommandList id={listId} className="max-h-72">
            <CommandEmpty>No matching step group.</CommandEmpty>
            <CommandGroup heading={`${groups.length} shared groups`}>
              {groups.map(group => (
                <CommandItem
                  key={group.id}
                  value={`${group.name} ${group.type} ${group.description ?? ''}`}
                  onSelect={() => {
                    onValueChange(group.name)
                    setOpen(false)
                  }}
                  className="items-start py-2.5"
                >
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-indigo-500/20 bg-indigo-500/[0.05] text-indigo-300">
                    <Layers3 className="size-4" />
                  </div>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-zinc-100">{group.name}</span>
                      <span className="rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                        {group.type}
                      </span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-xs leading-4 text-zinc-400">
                      {group.description || 'Reusable steps grouped by this behavior.'}
                    </span>
                  </span>
                  <Check
                    className={cn('mt-1 size-4 text-primary', value === group.name ? 'opacity-100' : 'opacity-0')}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <div className="border-t border-white/[0.08] p-2">
            <Button asChild variant="ghost" className="w-full justify-start text-xs text-zinc-300">
              <Link href="/template-step-groups/create">
                <Plus className="size-4 text-primary" />
                Create a new step group
              </Link>
            </Button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
