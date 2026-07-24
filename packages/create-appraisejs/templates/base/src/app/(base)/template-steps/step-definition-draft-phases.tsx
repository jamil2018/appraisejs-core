'use client'

import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  useState,
  type Dispatch,
  type ReactElement,
  type SetStateAction,
} from 'react'
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
  Settings2,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { reconcileNamedInputs, type DraftDefinition } from './step-definition-draft-helpers'
import type { StepDefinitionEditorGroup } from './step-definition-draft-editor'

type SetDefinition = Dispatch<SetStateAction<DraftDefinition>>
type PatchDefinition = (patch: Partial<DraftDefinition>) => void
type Runtime = 'browser' | 'api' | 'node' | 'database'

const executionLabels: Record<DraftDefinition['execution']['kind'], string> = {
  'reviewed-extension': 'Custom code',
  operation: 'Existing AppraiseJS handler',
  composition: 'Combine published steps',
  unbound: 'Decide later',
}
const runtimeLabels: Record<Runtime, string> = {
  browser: 'Browser automation',
  api: 'API service',
  node: 'Node.js',
  database: 'Database worker',
}
const inputTypes = [
  'string',
  'number',
  'boolean',
  'json',
  'locator',
  'environment-ref',
  'stored-value-ref',
  'artifact-ref',
  'reviewed-extension-ref',
] as const
const stages = ['Define behavior', 'Connect implementation', 'Verify readiness', 'Review & publish'] as const
const stageDescriptions = [
  'Describe the reusable behavior and the sentence people will use.',
  'Choose how the behavior runs and complete its generated handler contract.',
  'Compile the implementation and produce executable readiness evidence.',
  'Inspect the exact human and agent projections before publishing.',
]

type DraftReference = { id: string; revision: number } | null
type WizardProps = {
  busy: boolean
  canSave: boolean
  conformancePassed: boolean
  definition: DraftDefinition
  diagnostics: string[]
  draft: DraftReference
  exampleName: string
  generatedContract: string
  groups: StepDefinitionEditorGroup[]
  handlerSource: string
  onCompile: () => void
  onPersist: () => Promise<{ id: string; revision: number } | null>
  onReviewAndPublish: () => void
  patchDefinition: PatchDefinition
  patchHuman: (patch: Partial<DraftDefinition['human']>) => void
  patchIntent: (patch: Partial<DraftDefinition['intent']>) => void
  preview: unknown
  setDefinition: SetDefinition
  setExampleName: Dispatch<SetStateAction<string>>
  setHandlerSource: Dispatch<SetStateAction<string>>
  setStage: Dispatch<SetStateAction<number>>
  stage: number
  stageReady: boolean[]
}
type WizardPhaseProps = Omit<WizardProps, 'canSave' | 'onPersist' | 'setStage' | 'stageReady'>

export function WizardSidebar({
  draft,
  onStageChange,
  stage,
  stageReady,
}: {
  draft: DraftReference
  onStageChange: Dispatch<SetStateAction<number>>
  stage: number
  stageReady: boolean[]
}) {
  return (
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
            <StageButton
              key={label}
              index={index}
              label={label}
              onStageChange={onStageChange}
              ready={stageReady[index]}
              stage={stage}
              unlocked={index === 0 || stageReady[index - 1]}
            />
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

function StageButton({
  index,
  label,
  onStageChange,
  ready,
  stage,
  unlocked,
}: {
  index: number
  label: string
  onStageChange: Dispatch<SetStateAction<number>>
  ready: boolean
  stage: number
  unlocked: boolean
}) {
  const statusClass =
    index < stage
      ? 'border-primary/25 bg-primary/[0.08] text-primary'
      : stage === index
        ? 'border-white/[0.12] bg-white/[0.05] text-zinc-100'
        : 'border-white/[0.06] text-zinc-500'
  const buttonClass =
    stage === index
      ? 'border-primary/20 bg-primary/[0.06] text-zinc-100'
      : 'border-transparent text-zinc-400 hover:border-white/[0.06] hover:bg-white/[0.025] hover:text-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:border-transparent disabled:hover:bg-transparent'
  return (
    <li>
      <button
        type="button"
        disabled={!unlocked}
        className={cn(
          'flex min-h-10 w-full items-center gap-3 rounded-md border px-2.5 text-left text-xs outline-none transition-colors focus-visible:ring-1 focus-visible:ring-primary',
          buttonClass,
        )}
        aria-current={stage === index ? 'step' : undefined}
        onClick={() => onStageChange(index)}
      >
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold',
            statusClass,
          )}
        >
          {ready ? <CheckCircle2 className="size-3.5" /> : index + 1}
        </span>
        <span className="leading-4">{label}</span>
      </button>
    </li>
  )
}

export function WizardPanel(props: WizardProps) {
  return (
    <Card className="min-w-0 overflow-hidden border-white/[0.08] bg-[rgba(18,37,64,0.42)] shadow-none">
      <CardHeader className="border-b border-white/[0.06] px-5 pb-4 pt-5">
        <CardTitle className="text-base text-zinc-100">{stages[props.stage]}</CardTitle>
        <CardDescription className="mt-1 max-w-2xl text-xs leading-5">{stageDescriptions[props.stage]}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 px-5 pb-5 pt-5">
        <WizardPhase {...props} />
        <WizardFooter {...props} />
      </CardContent>
    </Card>
  )
}

function WizardPhase(props: WizardPhaseProps) {
  if (props.stage === 0)
    return (
      <DefinePhase
        definition={props.definition}
        groups={props.groups}
        patchDefinition={props.patchDefinition}
        patchHuman={props.patchHuman}
        patchIntent={props.patchIntent}
        setDefinition={props.setDefinition}
      />
    )
  if (props.stage === 1)
    return (
      <ConnectPhase
        definition={props.definition}
        generatedContract={props.generatedContract}
        handlerSource={props.handlerSource}
        patchDefinition={props.patchDefinition}
        setDefinition={props.setDefinition}
        setHandlerSource={props.setHandlerSource}
      />
    )
  if (props.stage === 2)
    return (
      <VerifyPhase
        busy={props.busy}
        conformancePassed={props.conformancePassed}
        diagnostics={props.diagnostics}
        exampleName={props.exampleName}
        executionKind={props.definition.execution.kind}
        onCompile={props.onCompile}
        setExampleName={props.setExampleName}
      />
    )
  return (
    <PublishPhase
      conformancePassed={props.conformancePassed}
      definition={props.definition}
      draft={props.draft}
      onReviewAndPublish={props.onReviewAndPublish}
      preview={props.preview}
    />
  )
}

function WizardFooter({
  busy,
  canSave,
  onPersist,
  setStage,
  stage,
  stageReady,
}: Pick<WizardProps, 'busy' | 'canSave' | 'onPersist' | 'setStage' | 'stage' | 'stageReady'>) {
  const continueDraft = async () => {
    const saved = await onPersist()
    if (saved) setStage(current => current + 1)
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-4">
      <Button type="button" variant="outline" disabled={stage === 0} onClick={() => setStage(current => current - 1)}>
        <ChevronLeft className="size-4" />
        Back
      </Button>
      <Button type="button" variant="secondary" onClick={onPersist} disabled={busy || !canSave}>
        <Save className="size-4" />
        {busy ? 'Saving…' : 'Save draft'}
      </Button>
      <Button
        type="button"
        disabled={stage === stages.length - 1 || !stageReady[stage] || busy}
        onClick={continueDraft}
      >
        Save and continue
        <ChevronRight className="size-4" />
      </Button>
    </div>
  )
}

export function DefinePhase({
  definition,
  groups,
  patchDefinition,
  patchHuman,
  patchIntent,
  setDefinition,
}: {
  definition: DraftDefinition
  groups: StepDefinitionEditorGroup[]
  patchDefinition: PatchDefinition
  patchHuman: (patch: Partial<DraftDefinition['human']>) => void
  patchIntent: (patch: Partial<DraftDefinition['intent']>) => void
  setDefinition: SetDefinition
}) {
  return (
    <>
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
                  {inputTypes.map(type => (
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
    </>
  )
}

export function ConnectPhase({
  definition,
  generatedContract,
  handlerSource,
  patchDefinition,
  setDefinition,
  setHandlerSource,
}: {
  definition: DraftDefinition
  generatedContract: string
  handlerSource: string
  patchDefinition: PatchDefinition
  setDefinition: SetDefinition
  setHandlerSource: Dispatch<SetStateAction<string>>
}) {
  return (
    <>
      <ExecutionSettings definition={definition} patchDefinition={patchDefinition} setDefinition={setDefinition} />
      <details className="rounded-md border border-white/[0.08] bg-black/10">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-300 outline-none focus-visible:ring-1 focus-visible:ring-primary">
          View generated TypeScript contract
        </summary>
        <div className="border-t border-white/[0.06] p-4">
          <CodePanel label="Generated contract" value={generatedContract} />
        </div>
      </details>
      <Field label="User-owned handler source">
        <Textarea
          className="min-h-80 font-mono text-xs"
          value={handlerSource}
          onChange={event => setHandlerSource(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">Metadata regeneration never overwrites this source.</p>
      </Field>
    </>
  )
}

function ExecutionSettings({
  definition,
  patchDefinition,
  setDefinition,
}: {
  definition: DraftDefinition
  patchDefinition: PatchDefinition
  setDefinition: SetDefinition
}) {
  const runtime = executionRuntime(definition)
  return (
    <details className="group rounded-md border border-white/[0.08] bg-white/[0.015]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 outline-none focus-visible:ring-1 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.025] text-zinc-400">
            <Settings2 className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-zinc-200">Advanced execution settings</span>
            <span className="block truncate text-xs text-zinc-500">
              {executionLabels[definition.execution.kind]} · {runtimeLabels[runtime]}
            </span>
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-90" />
      </summary>
      <div className="grid gap-4 border-t border-white/[0.06] px-4 py-4 sm:grid-cols-2">
        <ExecutionSource definition={definition} patchDefinition={patchDefinition} />
        <ExecutionFields definition={definition} setDefinition={setDefinition} />
        <RuntimePicker definition={definition} patchDefinition={patchDefinition} runtime={runtime} />
        <p className="text-xs leading-5 text-zinc-500 sm:col-span-2">
          AppraiseJS records the selected run environment as registry metadata. It does not grant code access or require
          a separate capability list.
        </p>
      </div>
    </details>
  )
}

function ExecutionSource({
  definition,
  patchDefinition,
}: {
  definition: DraftDefinition
  patchDefinition: PatchDefinition
}) {
  return (
    <Field label="Implementation source">
      <Select
        value={definition.execution.kind}
        onValueChange={kind => patchDefinition({ execution: executionForKind(kind, definition) })}
      >
        <SelectTrigger aria-label="Implementation source">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="reviewed-extension">Write custom code</SelectItem>
          <SelectItem value="operation">Reuse an AppraiseJS handler</SelectItem>
          <SelectItem value="composition">Combine published steps</SelectItem>
          <SelectItem value="unbound">Decide later</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs leading-5 text-zinc-500">
        Custom code is the normal choice. Reuse and composition are for advanced library workflows.
      </p>
    </Field>
  )
}

function executionForKind(kind: string, definition: DraftDefinition): DraftDefinition['execution'] {
  const hash = `sha256:${'0'.repeat(64)}` as const
  switch (kind) {
    case 'operation':
      return { kind, handlerId: definition.identity.id, handlerVersion: definition.identity.version, runtime: 'node' }
    case 'composition':
      return {
        kind,
        steps: [
          {
            step: { id: 'builtin.example', version: '1', definitionHash: `sha256:${'0'.repeat(64)}` },
            inputs: {},
          },
        ],
      }
    case 'reviewed-extension':
      return {
        kind,
        extensionId: definition.identity.id,
        extensionVersion: definition.identity.version,
        exportName: 'handler',
        sourceHash: hash,
        compiledHash: hash,
        runtime: 'node',
      }
    default:
      return { kind: 'unbound' }
  }
}

function ExecutionFields({ definition, setDefinition }: { definition: DraftDefinition; setDefinition: SetDefinition }) {
  if (definition.execution.kind === 'operation')
    return <OperationFields definition={definition} setDefinition={setDefinition} />
  if (definition.execution.kind === 'composition')
    return <CompositionFields definition={definition} setDefinition={setDefinition} />
  return null
}

function OperationFields({
  definition,
  setDefinition,
}: {
  definition: Extract<DraftDefinition, { execution: { kind: 'operation' } }> | DraftDefinition
  setDefinition: SetDefinition
}) {
  if (definition.execution.kind !== 'operation') return null
  const update = (field: 'handlerId' | 'handlerVersion', value: string) =>
    setDefinition(current =>
      current.execution.kind === 'operation'
        ? { ...current, execution: { ...current.execution, [field]: value } }
        : current,
    )
  return (
    <>
      <Field label="Handler ID">
        <Input value={definition.execution.handlerId} onChange={event => update('handlerId', event.target.value)} />
      </Field>
      <Field label="Handler version">
        <Input
          value={definition.execution.handlerVersion}
          onChange={event => update('handlerVersion', event.target.value)}
        />
      </Field>
    </>
  )
}

type CompositionReferenceField = 'id' | 'version' | 'definitionHash'

function updateCompositionChildReference(
  definition: DraftDefinition,
  field: CompositionReferenceField,
  value: string,
): DraftDefinition {
  if (definition.execution.kind !== 'composition') return definition
  const child = definition.execution.steps[0]
  const reference = child?.step ?? {
    id: 'builtin.example',
    version: '1',
    definitionHash: `sha256:${'0'.repeat(64)}`,
  }
  return {
    ...definition,
    execution: {
      kind: 'composition',
      steps: [
        {
          step: { ...reference, [field]: value },
          inputs: child?.inputs ?? {},
        },
      ],
    },
  }
}

function CompositionFields({
  definition,
  setDefinition,
}: {
  definition: DraftDefinition
  setDefinition: SetDefinition
}) {
  if (definition.execution.kind !== 'composition') return null
  const child = definition.execution.steps[0]
  const update = (field: CompositionReferenceField, value: string) =>
    setDefinition(current => updateCompositionChildReference(current, field, value))
  return (
    <>
      <Field label="Ready child Step ID">
        <Input value={child?.step.id ?? ''} onChange={event => update('id', event.target.value)} />
      </Field>
      <Field label="Child version">
        <Input value={child?.step.version ?? ''} onChange={event => update('version', event.target.value)} />
      </Field>
      <Field label="Exact child definition hash">
        <Input
          value={child?.step.definitionHash ?? ''}
          onChange={event => update('definitionHash', event.target.value)}
        />
      </Field>
    </>
  )
}

function executionRuntime(definition: DraftDefinition): Runtime {
  return definition.execution.kind === 'reviewed-extension' || definition.execution.kind === 'operation'
    ? definition.execution.runtime
    : 'node'
}

function RuntimePicker({
  definition,
  patchDefinition,
  runtime,
}: {
  definition: DraftDefinition
  patchDefinition: PatchDefinition
  runtime: Runtime
}) {
  const setRuntime = (value: string) => {
    if (definition.execution.kind === 'reviewed-extension' || definition.execution.kind === 'operation')
      patchDefinition({ execution: { ...definition.execution, runtime: value as Runtime } })
  }
  return (
    <Field label="Runs in">
      <Select value={runtime} onValueChange={setRuntime}>
        <SelectTrigger aria-label="Runs in">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(runtimeLabels) as Runtime[]).map(item => (
            <SelectItem key={item} value={item}>
              {runtimeLabels[item]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs leading-5 text-zinc-500">
        Node.js is recommended. Change this only when the handler needs a specialized execution environment.
      </p>
    </Field>
  )
}

export function VerifyPhase({
  busy,
  conformancePassed,
  diagnostics,
  exampleName,
  executionKind,
  onCompile,
  setExampleName,
}: {
  busy: boolean
  conformancePassed: boolean
  diagnostics: string[]
  exampleName: string
  executionKind: DraftDefinition['execution']['kind']
  onCompile: () => void
  setExampleName: Dispatch<SetStateAction<string>>
}) {
  return (
    <div className="space-y-4">
      <Field label="Example name">
        <Input required value={exampleName} onChange={event => setExampleName(event.target.value)} />
      </Field>
      <Button type="button" onClick={onCompile} disabled={busy || executionKind !== 'reviewed-extension'}>
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
  )
}

export function PublishPhase({
  conformancePassed,
  definition,
  draft,
  onReviewAndPublish,
  preview,
}: {
  conformancePassed: boolean
  definition: DraftDefinition
  draft: { id: string; revision: number } | null
  onReviewAndPublish: () => void
  preview: unknown
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <CodePanel
          label="Human projection"
          value={`${definition.human.keywordCompatibility.join('/')} ${definition.human.signature}`}
        />
        <CodePanel label="Agent projection" value={JSON.stringify(definition.agent, null, 2)} />
      </div>
      {preview ? <CodePanel label="Exact publication preview" value={JSON.stringify(preview, null, 2)} /> : null}
      <Button type="button" onClick={onReviewAndPublish} disabled={!draft || !conformancePassed}>
        Review exact draft and publish immutable version
      </Button>
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
