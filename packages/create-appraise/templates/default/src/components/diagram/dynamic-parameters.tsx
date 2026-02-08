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
import { StepParameterType, TemplateStepParameter, Locator, LocatorGroup } from '@prisma/client'
import { format } from 'date-fns'
import ErrorMessage from '@/components/form/error-message'

interface DynamicFormFieldsProps {
  templateStepParams: TemplateStepParameter[]
  locators: Locator[]
  locatorGroups: LocatorGroup[]
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
  const initialValues = useMemo(() => {
    const values: { [key: string]: string | number | boolean | Date } = {}
    // Build a map for quick lookup of initial values by name
    const initialValueMap: Record<string, { value: string; type: StepParameterType }> = {}
    initialParameterValues?.forEach(v => {
      initialValueMap[v.name] = { value: v.value, type: v.type }
    })
    templateStepParams.forEach(param => {
      const initial = initialValueMap[param.name]
      if (initial) {
        switch (param.type) {
          case 'NUMBER':
            values[param.name] = Number(initial.value)
            break
          case 'STRING':
          case 'LOCATOR':
            values[param.name] = initial.value
            break
          case 'DATE':
            // Try to parse date from string
            const date = new Date(initial.value)
            values[param.name] = isNaN(date.getTime()) ? new Date() : date
            break
          case 'BOOLEAN':
            values[param.name] = initial.value === 'true'
            break
        }
      } else {
        // fallback to default
        switch (param.type) {
          case 'NUMBER':
            values[param.name] = 0
            break
          case 'STRING':
            values[param.name] = ''
            break
          case 'DATE':
            values[param.name] = new Date()
            break
          case 'BOOLEAN':
            values[param.name] = false
            break
          case 'LOCATOR':
            values[param.name] = ''
            break
        }
      }
    })
    return values
  }, [templateStepParams, initialParameterValues])

  // Initialize state with initial values
  const [values, setValues] = useState<{
    [key: string]: string | number | boolean | Date
  }>(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // State for locator group selection
  const [selectedLocatorGroups, setSelectedLocatorGroups] = useState<Record<string, string>>({})

  useEffect(() => {
    setErrors({})
  }, [templateStepParams])

  useImperativeHandle(ref, () => ({
    validate: () => {
      // Skip all validation if defaultValueInput is true (all fields are optional)
      if (defaultValueInput) {
        setErrors({})
        return true
      }

      const newErrors: Record<string, string> = {}
      templateStepParams.forEach(param => {
        const value = values[param.name]

        if (param.type === 'LOCATOR') {
          const selectedGroup = selectedLocatorGroups[param.name]
          if (!selectedGroup) {
            newErrors[param.name] = 'Locator group is required'
          } else if (!value) {
            newErrors[param.name] = 'Locator is required'
          }
        }
        if (param.type === 'STRING' && !value) {
          newErrors[param.name] = 'This field is required'
        }
        if (param.type === 'NUMBER' && !value) {
          newErrors[param.name] = 'This field is required'
        }
        // Add other validation rules here if needed
      })
      setErrors(newErrors)
      return Object.keys(newErrors).length === 0
    },
  }))

  // Update values when an input changes
  const handleInputChange = (name: string, value: string | number | boolean | Date) => {
    const newValues = {
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
      // We need to calculate formatted values based on the new state
      const formattedValues = templateStepParams.map(param => {
        let stringValue = ''
        // Use the new value if it's the one that changed, otherwise use the current state
        const currentValue = param.name === name ? value : values[param.name]

        switch (param.type) {
          case 'NUMBER':
            stringValue = currentValue !== undefined && currentValue !== null ? String(currentValue) : ''
            break
          case 'STRING':
            stringValue = currentValue !== undefined && currentValue !== null ? (currentValue as string) : ''
            break
          case 'DATE':
            if (
              currentValue &&
              currentValue instanceof Date &&
              typeof currentValue.getTime === 'function' &&
              !Number.isNaN(currentValue.getTime())
            ) {
              stringValue = format(currentValue as Date, 'PPP')
            } else {
              stringValue = ''
            }
            break
          case 'BOOLEAN':
            stringValue = currentValue !== undefined && currentValue !== null ? String(currentValue) : ''
            break
          case 'LOCATOR':
            stringValue = currentValue !== undefined && currentValue !== null ? (currentValue as string) : ''
            break
        }

        return {
          name: param.name,
          value: stringValue,
          type: param.type,
          order: param.order,
        }
      })

      onChange(formattedValues)
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
  const getLocatorsForGroup = (groupId: string) => {
    return locators.filter(locator => locator.locatorGroupId === groupId)
  }

  // Render the appropriate input field based on the parameter type
  const renderInputField = (param: TemplateStepParameter) => {
    const { name, type } = param
    const errorMessage = errors[name]

    switch (type) {
      case 'NUMBER':
        return (
          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor={`input-${name}`}>
              {defaultValueInput ? `Default ${name}` : name}{' '}
              {!defaultValueInput && <span className="text-red-500">*</span>}
            </Label>
            <Input
              id={`input-${name}`}
              type="number"
              value={typeof values[name] === 'number' ? values[name] : 0}
              onChange={e => handleInputChange(name, Number(e.target.value))}
              className="w-full"
            />
            <ErrorMessage message={errorMessage || ''} visible={!!errorMessage} />
          </div>
        )

      case 'STRING':
        return (
          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor={`input-${name}`}>
              {defaultValueInput ? `Default ${name}` : name}{' '}
              {!defaultValueInput && <span className="text-red-500">*</span>}
            </Label>
            <Input
              id={`input-${name}`}
              type="text"
              value={typeof values[name] === 'string' ? values[name] : ''}
              onChange={e => handleInputChange(name, e.target.value)}
              className="w-full"
            />
            <ErrorMessage message={errorMessage || ''} visible={!!errorMessage} />
          </div>
        )

      case 'DATE':
        return (
          <div className="grid w-full items-center gap-1.5">
            <Label>
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
          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor={`select-${name}`}>
              {defaultValueInput ? `Default ${name}` : name}{' '}
              {!defaultValueInput && <span className="text-red-500">*</span>}
            </Label>
            <Select
              value={typeof values[name] === 'boolean' ? String(values[name]) : 'false'}
              onValueChange={value => handleInputChange(name, value === 'true')}
              required={!defaultValueInput}
            >
              <SelectTrigger id={`select-${name}`} className="w-full">
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
        const availableLocators = selectedGroupId ? getLocatorsForGroup(selectedGroupId) : []

        return (
          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor={`select-${name}`}>
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
                <SelectTrigger id={`group-${name}`} className="w-full">
                  <SelectValue placeholder="Select a locator group" />
                </SelectTrigger>
                <SelectContent>
                  {locatorGroups.map(group => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Locator Selection */}
            <Select
              value={typeof values[name] === 'string' ? values[name] : ''}
              onValueChange={value => handleInputChange(name, value)}
              required={!defaultValueInput}
              disabled={!selectedGroupId}
            >
              <SelectTrigger id={`select-${name}`} className="w-full">
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
              <SelectContent>
                {availableLocators.map(locator => (
                  <SelectItem key={locator.id} value={locator.name}>
                    {locator.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
    <Card className="border-none shadow-none" key={resetKey}>
      <CardHeader className='py-3'>
        <CardTitle className='text-xs font-bold text-primary'>Parameters</CardTitle>
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
