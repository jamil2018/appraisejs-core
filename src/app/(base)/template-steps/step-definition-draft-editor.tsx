'use client'

import { Children, cloneElement, isValidElement, useId, useMemo, useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Code2, Save } from 'lucide-react'

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
import { toast } from '@/hooks/use-toast'
import type { ActionResponse } from '@/types/form/actionHandler'
import {
  createHumanStepDraft,
  draftContractSource,
  draftHandlerBoilerplate,
  reconcileNamedInputs,
  type DraftDefinition,
} from './step-definition-draft-helpers'

const stages = [
  'Identity & purpose',
  'Human sentence',
  'Typed contract',
  'Runtime capabilities',
  'Generated contract',
  'Code',
  'Examples & conformance',
  'Review & publish',
] as const

export type StepDefinitionEditorDraft = {
  id: string
  revision: number
  definition: DraftDefinition
  artifact?: { handlerSource?: string; examples?: Array<{ name?: string }> } | null
}
type DraftRecord = { id: string; revision: number; definition?: DraftDefinition }
type CompileData = { revision?: number; diagnostics?: string[]; conformance?: { passed?: boolean } }

function actionError(response: ActionResponse) {
  return response.error ?? response.message ?? 'The Step Definition request failed.'
}

function parseLines(value: string) {
  return value
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean)
}

// fallow-ignore-next-line complexity -- The wizard deliberately coordinates eight schema-driven stages in one resumable form boundary.
export function StepDefinitionDraftEditor({ initialDraft }: { initialDraft?: StepDefinitionEditorDraft }) {
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

  const patchDefinition = (patch: Partial<DraftDefinition>) => setDefinition(current => ({ ...current, ...patch }))
  const patchIntent = (patch: Partial<DraftDefinition['intent']>) =>
    setDefinition(current => ({ ...current, intent: { ...current.intent, ...patch } }))
  const patchHuman = (patch: Partial<DraftDefinition['human']>) =>
    setDefinition(current => ({ ...current, human: { ...current.human, ...patch } }))
  const persist = async () => {
    setBusy(true)
    const response = draft
      ? await reviseStepDefinitionDraftAction({
          draftId: draft.id,
          expectedRevision: draft.revision,
          definition,
        })
      : await createStepDefinitionDraftAction(definition)
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
    <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <Card className="h-fit bg-zinc-500/10">
        <CardHeader>
          <CardTitle>Creation readiness</CardTitle>
          <CardDescription>{draft ? `Draft revision ${draft.revision}` : 'Not saved yet'}</CardDescription>
        </CardHeader>
        <CardContent>
          <Progress aria-label="Wizard progress" value={((stage + 1) / stages.length) * 100} />
          <ol className="mt-4 space-y-1 text-sm">
            {stages.map((label, index) => (
              <li key={label}>
                <button
                  type="button"
                  className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left focus-visible:ring-2 focus-visible:ring-ring"
                  aria-current={stage === index ? 'step' : undefined}
                  onClick={() => setStage(index)}
                >
                  {index < stage ? <CheckCircle2 className="size-4 text-emerald-400" /> : <span>{index + 1}.</span>}
                  {label}
                </button>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card className="min-w-0 bg-zinc-500/10">
        <CardHeader>
          <CardTitle>{stages[stage]}</CardTitle>
          <CardDescription>
            Ready definitions use the same schema and publication service as built-ins and agents.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {stage === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Stable ID">
                <Input
                  value={definition.identity.id}
                  onChange={event => {
                    const id = event.target.value
                    patchDefinition({
                      identity: { ...definition.identity, id },
                      execution:
                        definition.execution.kind === 'reviewed-extension'
                          ? { ...definition.execution, extensionId: id }
                          : definition.execution,
                    })
                  }}
                />
              </Field>
              <Field label="Version">
                <Input
                  value={definition.identity.version}
                  onChange={event =>
                    patchDefinition({ identity: { ...definition.identity, version: event.target.value } })
                  }
                />
              </Field>
              <Field label="Title">
                <Input value={definition.intent.title} onChange={event => patchIntent({ title: event.target.value })} />
              </Field>
              <Field label="Group">
                <Input
                  value={definition.human.groupId}
                  onChange={event => patchHuman({ groupId: event.target.value })}
                />
              </Field>
              <Field label="Purpose" wide>
                <Textarea
                  value={definition.intent.description}
                  onChange={event => patchIntent({ description: event.target.value })}
                />
              </Field>
              <Field label="Search terms (one per line)" wide>
                <Textarea
                  value={definition.intent.searchTerms.join('\n')}
                  onChange={event => patchIntent({ searchTerms: parseLines(event.target.value) })}
                />
              </Field>
            </div>
          )}
          {stage === 1 && (
            <Field label="Readable Gherkin sentence">
              <Input
                value={definition.human.signature}
                onChange={event => setDefinition(current => reconcileNamedInputs(current, event.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Named placeholders such as {'{accountName}'} become stable typed inputs.
              </p>
            </Field>
          )}
          {stage === 2 && (
            <div className="space-y-4">
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
          {stage === 3 && (
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
          {stage === 4 && <CodePanel label="Generated contract" value={generatedContract} />}
          {stage === 5 && (
            <Field label="User-owned handler source">
              <Textarea
                className="min-h-80 font-mono text-xs"
                value={handlerSource}
                onChange={event => setHandlerSource(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">Metadata regeneration never overwrites this source.</p>
            </Field>
          )}
          {stage === 6 && (
            <div className="space-y-4">
              <Field label="Example name">
                <Input value={exampleName} onChange={event => setExampleName(event.target.value)} />
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
          {stage === 7 && (
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

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={stage === 0}
              onClick={() => setStage(current => current - 1)}
            >
              <ChevronLeft className="size-4" />
              Back
            </Button>
            <Button type="button" variant="secondary" onClick={persist} disabled={busy}>
              <Save className="size-4" />
              {busy ? 'Saving…' : 'Save draft'}
            </Button>
            <Button
              type="button"
              disabled={stage === stages.length - 1}
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
