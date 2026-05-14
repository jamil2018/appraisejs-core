'use client'

import { useState, useMemo, useImperativeHandle, useEffect, useRef, startTransition } from 'react'
import { Calendar } from '@/components/ui/calendar'
import CreateLocatorWorkspace from '@/app/(base)/locators/create/create-locator-workspace'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CalendarIcon, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StepParameterType, TemplateStepParameter, type Locator, type LocatorGroup, type Module } from '@prisma/client'
import type {
  InlineLocatorSaveResult,
  LocatorWorkspaceEnvironment,
} from '@/app/(base)/locators/create/create-locator-workspace-helpers'
import { format } from 'date-fns'
import ErrorMessage from '@/components/form/error-message'
import {
  formatDynamicParameterValues,
  getDynamicParameterInitialValues,
  getInitialSelectedLocatorGroups,
  getLocatorsForGroup,
  validateDynamicParameters,
} from './dynamic-parameters-helpers'

type DynamicParameterValue = string | number | boolean | Date
type LocatorOption = Pick<Locator, 'id' | 'name' | 'locatorGroupId'>
type LocatorGroupOption = Pick<LocatorGroup, 'id' | 'name' | 'route' | 'moduleId'>
type LocatorSelectionMode = 'existing' | 'new'

type DynamicFormFieldsProps = {
  templateStepParams: TemplateStepParameter[]
  locators: LocatorOption[]
  locatorGroups: LocatorGroupOption[]
  environments: LocatorWorkspaceEnvironment[]
  modules: Array<Pick<Module, 'id' | 'name' | 'parentId'>>
  onLocatorCreated?: (result: InlineLocatorSaveResult) => void
  defaultValueInput?: boolean
  onChange?: (
    values: {
      name: string
      value: string
      type: StepParameterType
      order: number
    }[],
  ) => void
  initialParameterValues?: {
    name: string
    value: string
    type: StepParameterType
    order: number
  }[]
}

export interface DynamicFormFieldsRef {
  validate: () => boolean
}

function DynamicFormFields({
  ref,
  templateStepParams,
  locators,
  locatorGroups,
  environments,
  modules,
  onLocatorCreated,
  defaultValueInput = false,
  onChange,
  initialParameterValues,
}: DynamicFormFieldsProps & React.RefAttributes<DynamicFormFieldsRef>) {

  const resetKey = useMemo(() => {
    return JSON.stringify({
      params: templateStepParams.map(p => ({ name: p.name, type: p.type })),
      initialParameterValues,
    })
  }, [templateStepParams, initialParameterValues])

  // Create initial values only once when component mounts
  const initialValues = useMemo(
    () => getDynamicParameterInitialValues(templateStepParams, initialParameterValues),
    [templateStepParams, initialParameterValues],
  )

  // Derive initial locator groups from initialParameterValues (locator name -> group id via locators lookup)
  const initialSelectedLocatorGroups = useMemo(
    () => getInitialSelectedLocatorGroups(templateStepParams, initialParameterValues, locators),
    [templateStepParams, initialParameterValues, locators],
  )

  // Initialize state with initial values
  const [values, setValues] = useState<Record<string, DynamicParameterValue>>(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // State for locator group selection (initialized from initial data so edit restores group + locator)
  const [selectedLocatorGroups, setSelectedLocatorGroups] =
    useState<Record<string, string>>(initialSelectedLocatorGroups)
  const [inlineLocators, setInlineLocators] = useState<LocatorOption[]>([])
  const [inlineLocatorGroups, setInlineLocatorGroups] = useState<LocatorGroupOption[]>([])
  const [createdLocatorSelections, setCreatedLocatorSelections] = useState<Record<string, InlineLocatorSaveResult>>({})
  const [locatorSelectionModes, setLocatorSelectionModes] = useState<Record<string, LocatorSelectionMode>>({})
  const [createLocatorParamName, setCreateLocatorParamName] = useState<string | null>(null)
  const lastInitialSyncKeyRef = useRef<string | null>(null)
  const fieldClassName = 'w-full border-border bg-background'

  const availableLocatorGroups = useMemo(() => {
    const groupsById = new Map<string, LocatorGroupOption>()
    for (const group of locatorGroups) {
      groupsById.set(group.id, group)
    }
    for (const group of inlineLocatorGroups) {
      groupsById.set(group.id, group)
    }
    return Array.from(groupsById.values())
  }, [inlineLocatorGroups, locatorGroups])

  const availableLocatorOptions = useMemo(() => {
    const locatorsById = new Map<string, LocatorOption>()
    for (const locator of locators) {
      locatorsById.set(locator.id, locator)
    }
    for (const locator of inlineLocators) {
      locatorsById.set(locator.id, locator)
    }
    return Array.from(locatorsById.values())
  }, [inlineLocators, locators])

  useEffect(() => {
    startTransition(() => {
      setErrors({})
    })
  }, [templateStepParams])

  // Sync state when initial data changes (e.g. opening edit for a different node)
  useEffect(() => {
    if (lastInitialSyncKeyRef.current === resetKey) {
      return
    }

    lastInitialSyncKeyRef.current = resetKey
    startTransition(() => {
      setValues(initialValues)
      setSelectedLocatorGroups(initialSelectedLocatorGroups)
      setCreatedLocatorSelections({})
      setLocatorSelectionModes({})
    })
  }, [initialValues, initialSelectedLocatorGroups, resetKey])

  useImperativeHandle(ref, () => ({
    validate: () => {
      const newErrors = validateDynamicParameters(
        templateStepParams,
        values,
        selectedLocatorGroups,
        defaultValueInput,
        locatorSelectionModes,
      )
      setErrors(newErrors)
      return Object.keys(newErrors).length === 0
    },
  }))

  // Update values when an input changes
  const handleInputChange = (name: string, value: string | number | boolean | Date) => {
    const newValues: Record<string, DynamicParameterValue> = {
      ...values,
      [name]: value,
    }

    setValues(newValues)

    // Clear error for the field being edited
    if (errors[name]) {
      const newErrors = { ...errors }
      delete newErrors[name]
      setErrors(newErrors)
    }

    // Notify parent component of changes
    if (onChange) {
      onChange(formatDynamicParameterValues(templateStepParams, newValues))
    }
  }

  // Handle locator group selection
  const handleLocatorGroupChange = (paramName: string, groupId: string) => {
    setSelectedLocatorGroups(prev => ({
      ...prev,
      [paramName]: groupId,
    }))

    // Clear the locator selection when group changes
    setValues(prev => ({
      ...prev,
      [paramName]: '',
    }))

    // Clear errors for this field
    if (errors[paramName]) {
      const newErrors = { ...errors }
      delete newErrors[paramName]
      setErrors(newErrors)
    }
  }

  const handleLocatorSelectionModeChange = (paramName: string, mode: LocatorSelectionMode) => {
    setLocatorSelectionModes(prev => ({
      ...prev,
      [paramName]: mode,
    }))

    if (mode === 'new') {
      const createdLocatorSelection = createdLocatorSelections[paramName]
      if (createdLocatorSelection) {
        const newValues: Record<string, DynamicParameterValue> = {
          ...values,
          [paramName]: createdLocatorSelection.locatorName,
        }
        setSelectedLocatorGroups(prev => ({
          ...prev,
          [paramName]: createdLocatorSelection.locatorGroupId,
        }))
        setValues(newValues)
        onChange?.(formatDynamicParameterValues(templateStepParams, newValues))
      }
    }

    if (errors[paramName]) {
      const newErrors = { ...errors }
      delete newErrors[paramName]
      setErrors(newErrors)
    }
  }

  const handleInlineLocatorSave = (paramName: string, result: InlineLocatorSaveResult) => {
    const nextGroup = {
      id: result.locatorGroupId,
      name: result.locatorGroupName,
      route: result.route,
      moduleId: result.moduleId,
    }
    const nextLocator = {
      id: result.locatorId,
      name: result.locatorName,
      locatorGroupId: result.locatorGroupId,
    }

    setInlineLocatorGroups(current =>
      current.some(group => group.id === nextGroup.id)
        ? current.map(group => (group.id === nextGroup.id ? nextGroup : group))
        : [...current, nextGroup],
    )
    setInlineLocators(current =>
      current.some(locator => locator.id === nextLocator.id)
        ? current.map(locator => (locator.id === nextLocator.id ? nextLocator : locator))
        : [...current, nextLocator],
    )
    setCreatedLocatorSelections(current => ({
      ...current,
      [paramName]: result,
    }))

    const newValues: Record<string, DynamicParameterValue> = {
      ...values,
      [paramName]: result.locatorName,
    }

    setSelectedLocatorGroups(prev => ({
      ...prev,
      [paramName]: result.locatorGroupId,
    }))
    setValues(newValues)

    if (errors[paramName]) {
      const newErrors = { ...errors }
      delete newErrors[paramName]
      setErrors(newErrors)
    }

    onChange?.(formatDynamicParameterValues(templateStepParams, newValues))
    onLocatorCreated?.(result)
  }

  const renderFieldLabel = (name: string, htmlFor?: string) => (
    <Label htmlFor={htmlFor} className="text-primary">
      {defaultValueInput ? `Default ${name}` : name} {!defaultValueInput && <span className="text-red-500">*</span>}
    </Label>
  )

  const renderNumberInput = (name: string, errorMessage: string | undefined) => (
    <div className="grid w-full items-center gap-1.5 rounded-md bg-zinc-500/10 p-4">
      {renderFieldLabel(name, `input-${name}`)}
      <Input
        id={`input-${name}`}
        type="number"
        value={typeof values[name] === 'number' ? values[name] : 0}
        onChange={e => handleInputChange(name, Number(e.target.value))}
        className={fieldClassName}
      />
      <ErrorMessage message={errorMessage || ''} visible={!!errorMessage} />
    </div>
  )

  const renderStringInput = (name: string, errorMessage: string | undefined) => (
    <div className="grid w-full items-center gap-1.5 rounded-md bg-zinc-500/10 p-4">
      {renderFieldLabel(name, `input-${name}`)}
      <Input
        id={`input-${name}`}
        type="text"
        value={typeof values[name] === 'string' ? values[name] : ''}
        onChange={e => handleInputChange(name, e.target.value)}
        className={fieldClassName}
      />
      <ErrorMessage message={errorMessage || ''} visible={!!errorMessage} />
    </div>
  )

  const renderDateInput = (name: string) => (
    <div className="grid w-full items-center gap-1.5 rounded-md bg-zinc-500/10 p-4">
      {renderFieldLabel(name)}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn('w-full justify-start text-left font-normal', !values[name] && 'text-muted-foreground')}
            aria-required={!defaultValueInput}
          >
            <CalendarIcon className="mr-2 size-4" />
            {values[name] instanceof Date ? (
              format(values[name] as Date, 'PPP')
            ) : (
              <span className={defaultValueInput ? 'text-muted-foreground' : 'text-red-500'}>
                {defaultValueInput ? 'Pick a date (optional)' : 'Pick a date *'}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={values[name] instanceof Date ? (values[name] as Date) : undefined}
            onSelect={(date: Date | undefined) => handleInputChange(name, date as Date)}
            initialFocus
            required={!defaultValueInput}
          />
        </PopoverContent>
      </Popover>
    </div>
  )

  const renderBooleanInput = (name: string) => (
    <div className="grid w-full items-center gap-1.5 rounded-md bg-zinc-500/10 p-4">
      {renderFieldLabel(name, `select-${name}`)}
      <Select
        value={typeof values[name] === 'boolean' ? String(values[name]) : 'false'}
        onValueChange={value => handleInputChange(name, value === 'true')}
        required={!defaultValueInput}
      >
        <SelectTrigger id={`select-${name}`} className={fieldClassName}>
          <SelectValue placeholder={defaultValueInput ? 'Select a value (optional)' : 'Select a value *'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">True</SelectItem>
          <SelectItem value="false">False</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )

  const renderCreatedLocatorFields = (name: string, createdLocatorSelection: InlineLocatorSaveResult | undefined) => (
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

  const renderExistingLocatorPanel = (name: string, selectedGroupId: string, availableLocators: LocatorOption[]) => (
    <div className="bg-background/40 space-y-3 rounded-md border border-border p-3">
      <Label className="text-sm font-semibold text-primary">Use Existing</Label>

      <div className="space-y-2">
        <Label htmlFor={`group-${name}`} className="text-sm text-muted-foreground">
          Locator Group
        </Label>
        <Select
          value={selectedGroupId}
          onValueChange={value => handleLocatorGroupChange(name, value)}
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
          onValueChange={value => handleInputChange(name, value)}
          required={!defaultValueInput}
          disabled={!selectedGroupId}
        >
          <SelectTrigger id={`select-${name}`} className={fieldClassName}>
            <SelectValue
              placeholder={
                !selectedGroupId
                  ? 'Select a locator group first'
                  : defaultValueInput
                    ? 'Select a locator (optional)'
                    : 'Select a locator *'
              }
            />
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

  const renderNewLocatorPanel = (
    name: string,
    isCreateDialogOpen: boolean,
    createdLocatorSelection?: InlineLocatorSaveResult,
  ) => (
    <div className="bg-background/40 space-y-3 rounded-md border border-border p-3">
      <div className="space-y-2">
        <Label className="block text-sm font-semibold text-primary">Create New Selector</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setCreateLocatorParamName(name)}
        >
          <Sparkles className="size-4" />
          Create Selector
        </Button>
      </div>
      <Dialog open={isCreateDialogOpen} onOpenChange={open => !open && setCreateLocatorParamName(null)}>
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
            onSaveSuccess={result => handleInlineLocatorSave(name, result)}
            onClose={() => setCreateLocatorParamName(null)}
          />
        </DialogContent>
      </Dialog>
      {renderCreatedLocatorFields(name, createdLocatorSelection)}
    </div>
  )

  const renderLocatorInput = (name: string, errorMessage: string | undefined) => {
    const locatorSelectionMode = locatorSelectionModes[name] ?? 'existing'
    const selectedGroupId = selectedLocatorGroups[name] || ''
    const availableLocators = selectedGroupId ? getLocatorsForGroup(availableLocatorOptions, selectedGroupId) : []

    return (
      <div className="grid w-full items-center gap-1.5 rounded-md bg-zinc-500/10 p-4">
        {renderFieldLabel(name, `select-${name}`)}
        <div className="space-y-2">
          <Label htmlFor={`locator-mode-${name}`} className="text-sm text-muted-foreground">
            Selector Source
          </Label>
          <Select
            value={locatorSelectionMode}
            onValueChange={value => handleLocatorSelectionModeChange(name, value as LocatorSelectionMode)}
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
        {locatorSelectionMode === 'new'
          ? renderNewLocatorPanel(name, createLocatorParamName === name, createdLocatorSelections[name])
          : renderExistingLocatorPanel(name, selectedGroupId, availableLocators)}
        <ErrorMessage message={errorMessage || ''} visible={!!errorMessage} />
      </div>
    )
  }

  // Render the appropriate input field based on the parameter type
  const renderInputField = (param: TemplateStepParameter) => {
    const { name, type } = param
    const errorMessage = errors[name]

    switch (type) {
      case 'NUMBER':
        return renderNumberInput(name, errorMessage)

      case 'STRING':
        return renderStringInput(name, errorMessage)

      case 'DATE':
        return renderDateInput(name)

      case 'BOOLEAN':
        return renderBooleanInput(name)

      case 'LOCATOR':
        return renderLocatorInput(name, errorMessage)

      default:
        return null
    }
  }

  // Guard: do not render if no parameters
  if (!templateStepParams || templateStepParams.length === 0) {
    return null
  }

  return (
    <Card className="border-zinc-700 bg-transparent shadow-none" key={resetKey}>
      <CardHeader className="py-3">
        <CardTitle className="text-xs font-bold text-primary">Parameters</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {templateStepParams.map(param => (
            <div key={param.name}>{renderInputField(param)}</div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

DynamicFormFields.displayName = 'DynamicFormFields'
export default DynamicFormFields
