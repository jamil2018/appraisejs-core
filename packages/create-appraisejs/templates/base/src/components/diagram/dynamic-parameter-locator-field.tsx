'use client'

import CreateLocatorWorkspace from '@/app/(base)/locators/create/create-locator-workspace'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sparkles } from 'lucide-react'

import { DynamicParameterFieldShell } from './dynamic-parameter-field-shell'
import type { InlineLocatorSaveResult } from '@/app/(base)/locators/create/create-locator-workspace-helpers'

import type { DynamicParameterInputFieldProps, LocatorSelectionMode } from './dynamic-parameter-field-types'
import { getLocatorsForGroup } from './dynamic-parameters-helpers'

type LocatorFieldSectionProps = DynamicParameterInputFieldProps & {
  name: string
  fieldClassName: string
  defaultValueInput: boolean
}

function DynamicParameterLocatorModeSelect({
  name,
  fieldClassName,
  locatorSelectionMode,
  onLocatorSelectionModeChange,
}: {
  name: string
  fieldClassName: string
  locatorSelectionMode: LocatorSelectionMode
  onLocatorSelectionModeChange: DynamicParameterInputFieldProps['onLocatorSelectionModeChange']
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`locator-mode-${name}`} className="text-sm text-muted-foreground">
        Selector Source
      </Label>
      <Select
        value={locatorSelectionMode}
        onValueChange={value => onLocatorSelectionModeChange(name, value as LocatorSelectionMode)}
      >
        <SelectTrigger id={`locator-mode-${name}`} className={fieldClassName}>
          <SelectValue placeholder="Choose selector source" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="existing">Use Existing</SelectItem>
          <SelectItem value="new">Create New Selector</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

function DynamicParameterLocatorNewSection({
  name,
  fieldClassName,
  createLocatorParamName,
  createdLocatorSelection,
  environments,
  modules,
  availableLocatorGroups,
  onInlineLocatorSave,
  onOpenCreateLocator,
}: LocatorFieldSectionProps & {
  createLocatorParamName: string | null
  createdLocatorSelection: DynamicParameterInputFieldProps['createdLocatorSelections'][string] | undefined
}) {
  return (
    <div className="bg-background/40 space-y-3 rounded-md border border-border p-3">
      <div className="space-y-2">
        <Label className="block text-sm font-semibold text-primary">Create New Selector</Label>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => onOpenCreateLocator(name)}>
          <Sparkles className="size-4" />
          Create Selector
        </Button>
      </div>
      <Dialog open={createLocatorParamName === name} onOpenChange={open => !open && onOpenCreateLocator(null)}>
        <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Selector</DialogTitle>
            <DialogDescription>Save a selector here to use it in this node immediately.</DialogDescription>
          </DialogHeader>
          <CreateLocatorWorkspace
            environments={environments}
            locatorGroups={availableLocatorGroups}
            modules={modules}
            displayMode="inline"
            onSaveSuccess={result => onInlineLocatorSave(name, result)}
            onClose={() => onOpenCreateLocator(null)}
          />
        </DialogContent>
      </Dialog>
      <DynamicParameterLocatorCreatedSummary
        name={name}
        fieldClassName={fieldClassName}
        createdLocatorSelection={createdLocatorSelection}
      />
    </div>
  )
}

function DynamicParameterLocatorCreatedSummary({
  name,
  fieldClassName,
  createdLocatorSelection,
}: {
  name: string
  fieldClassName: string
  createdLocatorSelection: InlineLocatorSaveResult | undefined
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label
          htmlFor={`created-group-${name}`}
          className="pointer-events-none cursor-not-allowed select-none text-sm text-muted-foreground"
        >
          Locator Group
        </Label>
        <Input
          id={`created-group-${name}`}
          value={createdLocatorSelection?.locatorGroupName ?? ''}
          placeholder="Created group will appear here"
          readOnly
          tabIndex={-1}
          onMouseDown={event => event.preventDefault()}
          className={`${fieldClassName} cursor-not-allowed select-none`}
        />
      </div>
      <div className="space-y-2">
        <Label
          htmlFor={`created-locator-${name}`}
          className="pointer-events-none cursor-not-allowed select-none text-sm text-muted-foreground"
        >
          Locator
        </Label>
        <Input
          id={`created-locator-${name}`}
          value={createdLocatorSelection?.locatorName ?? ''}
          placeholder="Created locator will appear here"
          readOnly
          tabIndex={-1}
          onMouseDown={event => event.preventDefault()}
          className={`${fieldClassName} cursor-not-allowed select-none`}
        />
      </div>
    </div>
  )
}

function DynamicParameterLocatorExistingSection({
  name,
  values,
  fieldClassName,
  defaultValueInput,
  selectedGroupId,
  availableLocatorGroups,
  availableLocators,
  onInputChange,
  onLocatorGroupChange,
}: LocatorFieldSectionProps & {
  selectedGroupId: string
  availableLocators: ReturnType<typeof getLocatorsForGroup>
}) {
  return (
    <div className="bg-background/40 space-y-3 rounded-md border border-border p-3">
      <Label className="text-sm font-semibold text-primary">Use Existing</Label>
      <div className="space-y-2">
        <Label htmlFor={`group-${name}`} className="text-sm text-muted-foreground">
          Locator Group
        </Label>
        <Select
          value={selectedGroupId}
          onValueChange={value => onLocatorGroupChange(name, value)}
          required={!defaultValueInput}
        >
          <SelectTrigger id={`group-${name}`} className={fieldClassName}>
            <SelectValue placeholder="Select a locator group" />
          </SelectTrigger>
          <SelectContent isEmpty={availableLocatorGroups.length === 0}>
            {availableLocatorGroups.map(group => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`select-${name}`} className="text-sm text-muted-foreground">
          Locator
        </Label>
        <Select
          value={typeof values[name] === 'string' ? values[name] : ''}
          onValueChange={value => onInputChange(name, value)}
          required={!defaultValueInput}
          disabled={!selectedGroupId}
        >
          <SelectTrigger id={`select-${name}`} className={fieldClassName}>
            <SelectValue placeholder={getLocatorPlaceholder(defaultValueInput, selectedGroupId)} />
          </SelectTrigger>
          <SelectContent isEmpty={availableLocators.length === 0}>
            {availableLocators.map(locator => (
              <SelectItem key={locator.id} value={locator.name}>
                {locator.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function getLocatorPlaceholder(defaultValueInput: boolean, selectedGroupId: string) {
  if (!selectedGroupId) {
    return 'Select a locator group first'
  }

  return defaultValueInput ? 'Select a locator (optional)' : 'Select a locator *'
}

export function DynamicParameterLocatorField(props: DynamicParameterInputFieldProps) {
  const {
    param,
    values,
    errors,
    defaultValueInput,
    fieldClassName,
    selectedLocatorGroups,
    locatorSelectionModes,
    createdLocatorSelections,
    availableLocatorGroups,
    availableLocatorOptions,
    createLocatorParamName,
    environments,
    modules,
    onInputChange,
    onLocatorGroupChange,
    onLocatorSelectionModeChange,
    onInlineLocatorSave,
    onOpenCreateLocator,
  } = props
  const { name } = param
  const locatorSelectionMode = locatorSelectionModes[name] ?? 'existing'
  const selectedGroupId = selectedLocatorGroups[name] || ''
  const availableLocators = selectedGroupId ? getLocatorsForGroup(availableLocatorOptions, selectedGroupId) : []
  const sectionProps = { ...props, name, fieldClassName, defaultValueInput }

  return (
    <DynamicParameterFieldShell
      name={name}
      defaultValueInput={defaultValueInput}
      htmlFor={`select-${name}`}
      errorMessage={errors[name]}
    >
      <DynamicParameterLocatorModeSelect
        name={name}
        fieldClassName={fieldClassName}
        locatorSelectionMode={locatorSelectionMode}
        onLocatorSelectionModeChange={onLocatorSelectionModeChange}
      />
      {locatorSelectionMode === 'new' ? (
        <DynamicParameterLocatorNewSection
          {...sectionProps}
          createLocatorParamName={createLocatorParamName}
          createdLocatorSelection={createdLocatorSelections[name]}
          environments={environments}
          modules={modules}
          availableLocatorGroups={availableLocatorGroups}
          onInlineLocatorSave={onInlineLocatorSave}
          onOpenCreateLocator={onOpenCreateLocator}
        />
      ) : (
        <DynamicParameterLocatorExistingSection
          {...sectionProps}
          values={values}
          selectedGroupId={selectedGroupId}
          availableLocatorGroups={availableLocatorGroups}
          availableLocators={availableLocators}
          onInputChange={onInputChange}
          onLocatorGroupChange={onLocatorGroupChange}
        />
      )}
    </DynamicParameterFieldShell>
  )
}
