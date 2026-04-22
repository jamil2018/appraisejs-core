'use client'

import { useState, useMemo, forwardRef, useImperativeHandle, useEffect } from 'react'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StepParameterType, TemplateStepParameter, type Locator, type LocatorGroup } from '@prisma/client'
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

type DynamicFormFieldsProps = {
  templateStepParams: TemplateStepParameter[]
  locators: Array<Pick<Locator, 'id' | 'name' | 'locatorGroupId'>>
  locatorGroups: Array<Pick<LocatorGroup, 'id' | 'name'>>
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

const DynamicFormFields = forwardRef<DynamicFormFieldsRef, DynamicFormFieldsProps>((props, ref) => {
  const {
    templateStepParams,
    locators,
    locatorGroups,
    defaultValueInput = false,
    onChange,
    initialParameterValues,
  } = props

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
  const [selectedLocatorGroups, setSelectedLocatorGroups] = useState<Record<string, string>>(
    initialSelectedLocatorGroups,
  )
  const fieldClassName = 'w-full border-border bg-background'

  useEffect(() => {
    queueMicrotask(() => setErrors({}))
  }, [templateStepParams])

  // Sync state when initial data changes (e.g. opening edit for a different node)
  useEffect(() => {
    queueMicrotask(() => {
      setValues(initialValues)
      setSelectedLocatorGroups(initialSelectedLocatorGroups)
    })
  }, [initialValues, initialSelectedLocatorGroups])

  useImperativeHandle(ref, () => ({
    validate: () => {
      const newErrors = validateDynamicParameters(templateStepParams, values, selectedLocatorGroups, defaultValueInput)
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

  // Get locators for a specific group
  // Render the appropriate input field based on the parameter type
  const renderInputField = (param: TemplateStepParameter) => {
    const { name, type } = param
    const errorMessage = errors[name]

    switch (type) {
      case 'NUMBER':
        return (
          <div className="grid w-full items-center gap-1.5 rounded-md bg-gray-500/10 p-4">
            <Label htmlFor={`input-${name}`} className="text-primary">
              {defaultValueInput ? `Default ${name}` : name}{' '}
              {!defaultValueInput && <span className="text-red-500">*</span>}
            </Label>
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

      case 'STRING':
        return (
          <div className="grid w-full items-center gap-1.5 rounded-md bg-gray-500/10 p-4">
            <Label htmlFor={`input-${name}`} className="text-primary">
              {defaultValueInput ? `Default ${name}` : name}{' '}
              {!defaultValueInput && <span className="text-red-500">*</span>}
            </Label>
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

      case 'DATE':
        return (
          <div className="grid w-full items-center gap-1.5 rounded-md bg-gray-500/10 p-4">
            <Label className="text-primary">
              {defaultValueInput ? `Default ${name}` : name}{' '}
              {!defaultValueInput && <span className="text-red-500">*</span>}
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn('w-full justify-start text-left font-normal', !values[name] && 'text-muted-foreground')}
                  aria-required={!defaultValueInput}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
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

      case 'BOOLEAN':
        return (
          <div className="grid w-full items-center gap-1.5 rounded-md bg-gray-500/10 p-4">
            <Label htmlFor={`select-${name}`} className="text-primary">
              {defaultValueInput ? `Default ${name}` : name}{' '}
              {!defaultValueInput && <span className="text-red-500">*</span>}
            </Label>
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

      case 'LOCATOR':
        const selectedGroupId = selectedLocatorGroups[name] || ''
        const availableLocators = selectedGroupId ? getLocatorsForGroup(locators, selectedGroupId) : []

        return (
          <div className="grid w-full items-center gap-1.5 rounded-md bg-gray-500/10 p-4">
            <Label htmlFor={`select-${name}`} className="text-primary">
              {defaultValueInput ? `Default ${name}` : name}{' '}
              {!defaultValueInput && <span className="text-red-500">*</span>}
            </Label>

            {/* Locator Group Selection */}
            <div className="mb-2">
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
                <SelectContent isEmpty={locatorGroups.length === 0}>
                  {locatorGroups.map(group => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Locator Selection */}
            <div>
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
            <ErrorMessage message={errorMessage || ''} visible={!!errorMessage} />
          </div>
        )

      default:
        return null
    }
  }

  // Guard: do not render if no parameters
  if (!templateStepParams || templateStepParams.length === 0) {
    return null
  }

  return (
    <Card className="border-gray-700 bg-transparent shadow-none" key={resetKey}>
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
})
DynamicFormFields.displayName = 'DynamicFormFields'
export default DynamicFormFields
