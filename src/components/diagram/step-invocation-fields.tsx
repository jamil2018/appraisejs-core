'use client'

import CreateLocatorWorkspace from '@/app/(base)/locators/create/create-locator-workspace'
import type { InlineLocatorSaveResult } from '@/app/(base)/locators/create/create-locator-workspace-helpers'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { StepDefinitionOption } from '@/types/step-definition-option'
import { Crosshair } from 'lucide-react'
import { useState } from 'react'

import type { StepInvocationResources } from './step-invocation-resources'

type StepInvocationFieldsProps = {
  definition: StepDefinitionOption
  values: Record<string, unknown>
  errors: Record<string, string>
  onChange: (name: string, value: unknown) => void
  resources?: StepInvocationResources
}

type InvocationInput = StepDefinitionOption['inputs'][number]

type FieldControlProps = {
  input: InvocationInput
  id: string
  value: unknown
  error?: string
  onChange: (value: unknown) => void
  resources?: StepInvocationFieldsProps['resources']
}

export function parseStepInvocationInput(
  input: StepDefinitionOption['inputs'][number],
  value: string | boolean,
): unknown {
  if (!input.required && typeof value === 'string' && value.trim() === '') return undefined
  if (input.type === 'boolean') return value
  if (input.type === 'number') {
    if (typeof value === 'string' && value.trim() === '') return ''
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) throw new Error(`${input.name} must be a finite number.`)
    return parsed
  }
  if (input.type === 'json') {
    if (typeof value !== 'string') throw new Error(`${input.name} must be JSON text.`)
    return JSON.parse(value) as unknown
  }
  return value
}

function displayValue(input: InvocationInput, value: unknown): string {
  if (input.type === 'json' && value !== undefined) return typeof value === 'string' ? value : JSON.stringify(value)
  return String(value ?? '')
}

function inputAttributes({ input, id, error }: Pick<FieldControlProps, 'input' | 'id' | 'error'>) {
  return {
    id,
    required: input.required,
    'aria-invalid': Boolean(error),
    'aria-describedby': error ? `${id}-error` : undefined,
  }
}

function selectAttributes({ input, id, error }: Pick<FieldControlProps, 'input' | 'id' | 'error'>) {
  const { required, ...attributes } = inputAttributes({ input, id, error })
  return { ...attributes, 'aria-required': required || undefined }
}

function EnvironmentReferenceSelect({ input, id, value, error, onChange, resources }: FieldControlProps) {
  const options = resources?.environments ?? []
  return (
    <Select value={displayValue(input, value) || undefined} onValueChange={onChange}>
      <SelectTrigger {...selectAttributes({ input, id, error })}>
        <SelectValue placeholder="Select an environment" />
      </SelectTrigger>
      <SelectContent isEmpty={options.length === 0} emptyMessage="No environments available">
        <SelectGroup>
          {options.map(resource => (
            <SelectItem key={resource.id} value={resource.id}>
              {resource.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

type LocatorReferenceFieldProps = FieldControlProps

type LocatorModeContentProps = Pick<
  FieldControlProps,
  'input' | 'id' | 'value' | 'error' | 'onChange' | 'resources'
> & {
  selectedGroupId: string
  setSelectedGroupId: (groupId: string) => void
  onOpenPicker: () => void
}

function ExistingLocatorReference({
  input,
  id,
  value,
  error,
  onChange,
  resources,
  selectedGroupId,
  setSelectedGroupId,
  onOpenPicker,
}: LocatorModeContentProps) {
  const groups = resources?.locatorGroups ?? []
  const locators = (resources?.locators ?? []).filter(locator => locator.locatorGroupId === selectedGroupId)
  return (
    <>
      <label className="text-sm font-medium" htmlFor={`${id}-group`}>
        Locator group
      </label>
      <Select
        value={selectedGroupId || undefined}
        onValueChange={groupId => {
          setSelectedGroupId(groupId)
          onChange('')
        }}
      >
        <SelectTrigger id={`${id}-group`}>
          <SelectValue placeholder="Select a locator group" />
        </SelectTrigger>
        <SelectContent isEmpty={groups.length === 0} emptyMessage="No locator groups available">
          <SelectGroup>
            {groups.map(group => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <label className="text-sm font-medium" htmlFor={id}>
        Locator
      </label>
      <Select value={displayValue(input, value) || undefined} onValueChange={onChange} disabled={!selectedGroupId}>
        <SelectTrigger {...selectAttributes({ input, id, error })}>
          <SelectValue placeholder="Select a locator" />
        </SelectTrigger>
        <SelectContent isEmpty={locators.length === 0} emptyMessage="No locators available in this group">
          <SelectGroup>
            {locators.map(locator => (
              <SelectItem key={locator.id} value={locator.id}>
                {locator.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Button type="button" variant="outline" onClick={onOpenPicker}>
        <Crosshair data-icon="inline-start" aria-hidden />
        Open locator picker
      </Button>
    </>
  )
}

type InlineLocatorCreationProps = Pick<FieldControlProps, 'value' | 'onChange' | 'resources'> &
  Pick<LocatorModeContentProps, 'setSelectedGroupId'>

function CreatedLocatorStatus({ name }: { name?: string }) {
  if (!name) return null
  return <p className="text-sm text-muted-foreground">Using created locator: {name}</p>
}

type LocatorCreationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (result: InlineLocatorSaveResult) => void
  resources?: StepInvocationResources
}

function LocatorCreationDialog({ open, onOpenChange, onSave, resources }: LocatorCreationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Selector</DialogTitle>
          <DialogDescription>Save a selector here to use it in this invocation immediately.</DialogDescription>
        </DialogHeader>
        <CreateLocatorWorkspace
          environments={resources?.environments ?? []}
          locatorGroups={resources?.locatorGroups ?? []}
          modules={resources?.modules ?? []}
          displayMode="inline"
          onSaveSuccess={onSave}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function LocatorPickerUtility({ value, onChange, resources, setSelectedGroupId }: InlineLocatorCreationProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(true)
  const [createdLocatorName, setCreatedLocatorName] = useState<string>()
  const selectedLocatorName = resources?.locators.find(locator => locator.id === value)?.name
  const handleInlineSave = (result: InlineLocatorSaveResult) => {
    setSelectedGroupId(result.locatorGroupId)
    onChange(result.locatorId)
    resources?.onInlineLocatorSave?.(result)
    setCreatedLocatorName(result.locatorName)
    setIsCreateOpen(false)
  }
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setIsCreateOpen(true)}>
        <Crosshair data-icon="inline-start" aria-hidden />
        Open locator picker
      </Button>
      <CreatedLocatorStatus name={createdLocatorName ?? selectedLocatorName} />
      <LocatorCreationDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSave={handleInlineSave}
        resources={resources}
      />
    </>
  )
}

function LocatorReferenceField({ input, id, value, error, onChange, resources }: LocatorReferenceFieldProps) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const selectedLocator = resources?.locators.find(locator => locator.id === value)
  const [selectedGroupId, setSelectedGroupId] = useState(() => selectedLocator?.locatorGroupId ?? '')
  const modeProps = {
    input,
    id,
    value,
    error,
    onChange,
    resources,
    selectedGroupId,
    setSelectedGroupId,
    onOpenPicker: () => setMode('new'),
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <label className="text-sm font-medium" htmlFor={`${id}-mode`}>
        Selector source
      </label>
      <Select value={mode} onValueChange={nextMode => setMode(nextMode === 'new' ? 'new' : 'existing')}>
        <SelectTrigger id={`${id}-mode`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="existing">Use existing locator</SelectItem>
            <SelectItem value="new">Create New Selector</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      {mode === 'new' ? (
        <LocatorPickerUtility
          value={value}
          onChange={onChange}
          resources={resources}
          setSelectedGroupId={setSelectedGroupId}
        />
      ) : (
        <ExistingLocatorReference {...modeProps} />
      )}
    </div>
  )
}

function StepInvocationFieldControl(props: FieldControlProps) {
  const { input, value, onChange } = props
  const attributes = inputAttributes(props)
  if (input.type === 'boolean') {
    const { required, 'aria-describedby': errorDescription, ...checkboxAttributes } = attributes
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          {...checkboxAttributes}
          aria-describedby={[`${props.id}-boolean-help`, errorDescription].filter(Boolean).join(' ') || undefined}
          aria-required={required || undefined}
          checked={Boolean(value)}
          onCheckedChange={checked => onChange(checked === true)}
        />
        <Label htmlFor={props.id} className="font-normal">
          {input.name}
        </Label>
      </div>
    )
  }
  if (input.type === 'json') {
    return (
      <Textarea {...attributes} value={displayValue(input, value)} onChange={event => onChange(event.target.value)} />
    )
  }
  if (input.type === 'locator') return <LocatorReferenceField {...props} />
  if (input.type === 'environment-ref') return <EnvironmentReferenceSelect {...props} />
  return (
    <Input
      {...attributes}
      type={input.type === 'number' ? 'number' : 'text'}
      value={displayValue(input, value)}
      onChange={event => onChange(event.target.value)}
    />
  )
}

export function StepInvocationFields({ definition, values, errors, onChange, resources }: StepInvocationFieldsProps) {
  return (
    <div className="space-y-3">
      {definition.inputs.map(input => {
        const id = `invocation-${input.name}`
        const error = errors[input.name]
        return (
          <div key={input.name} className="space-y-1">
            {input.type === 'locator' || input.type === 'boolean' ? null : <Label htmlFor={id}>{input.name}</Label>}
            <StepInvocationFieldControl
              input={input}
              id={id}
              value={values[input.name]}
              error={error}
              onChange={value => onChange(input.name, value)}
              resources={resources}
            />
            {input.type === 'boolean' ? (
              <p id={`${id}-boolean-help`} className="text-sm text-muted-foreground">
                Expect active when selected; expect inactive when clear.
              </p>
            ) : null}
            {error ? (
              <p id={`${id}-error`} className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
