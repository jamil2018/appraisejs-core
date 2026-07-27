'use client'

import CreateLocatorWorkspace from '@/app/(base)/locators/create/create-locator-workspace'
import type { InlineLocatorSaveResult } from '@/app/(base)/locators/create/create-locator-workspace-helpers'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { StepDefinitionOption } from '@/types/step-definition-option'
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

function EnvironmentReferenceSelect({ input, id, value, error, onChange, resources }: FieldControlProps) {
  const options = resources?.environments
  return (
    <select
      {...inputAttributes({ input, id, error })}
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
      value={displayValue(input, value)}
      onChange={event => onChange(event.target.value)}
    >
      <option value="">Select an environment</option>
      {options?.map(resource => (
        <option key={resource.id} value={resource.id}>
          {resource.name}
        </option>
      ))}
    </select>
  )
}

type LocatorReferenceFieldProps = FieldControlProps

type LocatorModeContentProps = Pick<
  FieldControlProps,
  'input' | 'id' | 'value' | 'error' | 'onChange' | 'resources'
> & {
  selectedGroupId: string
  setSelectedGroupId: (groupId: string) => void
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
}: LocatorModeContentProps) {
  const groups = resources?.locatorGroups ?? []
  const locators = (resources?.locators ?? []).filter(locator => locator.locatorGroupId === selectedGroupId)
  return (
    <>
      <label className="text-sm font-medium" htmlFor={`${id}-group`}>
        Locator group
      </label>
      <select
        id={`${id}-group`}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
        value={selectedGroupId}
        onChange={event => {
          setSelectedGroupId(event.target.value)
          onChange('')
        }}
      >
        <option value="">Select a locator group</option>
        {groups.map(group => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>
      <label className="text-sm font-medium" htmlFor={id}>
        Locator
      </label>
      <select
        {...inputAttributes({ input, id, error })}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
        value={displayValue(input, value)}
        disabled={!selectedGroupId}
        onChange={event => onChange(event.target.value)}
      >
        <option value="">Select a locator</option>
        {locators.map(locator => (
          <option key={locator.id} value={locator.id}>
            {locator.name}
          </option>
        ))}
      </select>
    </>
  )
}

type InlineLocatorCreationProps = Pick<FieldControlProps, 'value' | 'onChange' | 'resources'> &
  Pick<LocatorModeContentProps, 'setSelectedGroupId'>

function InlineLocatorCreation({ value, onChange, resources, setSelectedGroupId }: InlineLocatorCreationProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const selectedLocator = resources?.locators.find(locator => locator.id === value)
  const handleInlineSave = (result: InlineLocatorSaveResult) => {
    resources?.onInlineLocatorSave?.(result)
    setSelectedGroupId(result.locatorGroupId)
    onChange(result.locatorId)
    setIsCreateOpen(false)
  }
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setIsCreateOpen(true)}>
        Create Selector
      </Button>
      {selectedLocator ? (
        <p className="text-sm text-muted-foreground">Using created locator: {selectedLocator.name}</p>
      ) : null}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
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
            onSaveSuccess={handleInlineSave}
            onClose={() => setIsCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

function LocatorReferenceField({ input, id, value, error, onChange, resources }: LocatorReferenceFieldProps) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const selectedLocator = resources?.locators.find(locator => locator.id === value)
  const [selectedGroupId, setSelectedGroupId] = useState(() => selectedLocator?.locatorGroupId ?? '')
  const modeProps = { input, id, value, error, onChange, resources, selectedGroupId, setSelectedGroupId }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <label className="text-sm font-medium" htmlFor={`${id}-mode`}>
        Selector source
      </label>
      <select
        id={`${id}-mode`}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
        value={mode}
        onChange={event => setMode(event.target.value as 'existing' | 'new')}
      >
        <option value="existing">Use existing locator</option>
        <option value="new">Create New Selector</option>
      </select>
      {mode === 'new' ? (
        <InlineLocatorCreation
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
    return (
      <Input
        {...attributes}
        type="checkbox"
        checked={Boolean(value)}
        onChange={event => onChange(event.target.checked)}
      />
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
            <Label htmlFor={id}>{input.name}</Label>
            <StepInvocationFieldControl
              input={input}
              id={id}
              value={values[input.name]}
              error={error}
              onChange={value => onChange(input.name, value)}
              resources={resources}
            />
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
