'use client'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

import { DynamicParameterFieldShell } from './dynamic-parameter-field-shell'
import { DynamicParameterLocatorField } from './dynamic-parameter-locator-field'
import type { DynamicParameterInputFieldProps } from './dynamic-parameter-field-types'

function DynamicParameterNumberField(props: DynamicParameterInputFieldProps) {
  const { param, values, errors, defaultValueInput, fieldClassName, onInputChange } = props
  const { name } = param

  return (
    <DynamicParameterFieldShell
      name={name}
      defaultValueInput={defaultValueInput}
      htmlFor={`input-${name}`}
      errorMessage={errors[name]}
    >
      <Input
        id={`input-${name}`}
        type="number"
        value={typeof values[name] === 'number' ? values[name] : 0}
        onChange={e => onInputChange(name, Number(e.target.value))}
        className={fieldClassName}
      />
    </DynamicParameterFieldShell>
  )
}

function DynamicParameterStringField(props: DynamicParameterInputFieldProps) {
  const { param, values, errors, defaultValueInput, fieldClassName, onInputChange } = props
  const { name } = param

  return (
    <DynamicParameterFieldShell
      name={name}
      defaultValueInput={defaultValueInput}
      htmlFor={`input-${name}`}
      errorMessage={errors[name]}
    >
      <Input
        id={`input-${name}`}
        type="text"
        value={typeof values[name] === 'string' ? values[name] : ''}
        onChange={e => onInputChange(name, e.target.value)}
        className={fieldClassName}
      />
    </DynamicParameterFieldShell>
  )
}

function DynamicParameterDateField(props: DynamicParameterInputFieldProps) {
  const { param, values, errors, defaultValueInput, fieldClassName, onInputChange } = props
  const { name } = param

  return (
    <DynamicParameterFieldShell name={name} defaultValueInput={defaultValueInput} errorMessage={errors[name]}>
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
            onSelect={(date: Date | undefined) => onInputChange(name, date as Date)}
            initialFocus
            required={!defaultValueInput}
          />
        </PopoverContent>
      </Popover>
    </DynamicParameterFieldShell>
  )
}

function DynamicParameterBooleanField(props: DynamicParameterInputFieldProps) {
  const { param, values, errors, defaultValueInput, fieldClassName, onInputChange } = props
  const { name } = param

  return (
    <DynamicParameterFieldShell
      name={name}
      defaultValueInput={defaultValueInput}
      htmlFor={`select-${name}`}
      errorMessage={errors[name]}
    >
      <Select
        value={typeof values[name] === 'boolean' ? String(values[name]) : 'false'}
        onValueChange={value => onInputChange(name, value === 'true')}
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
    </DynamicParameterFieldShell>
  )
}

export function DynamicParameterInputField(props: DynamicParameterInputFieldProps) {
  switch (props.param.type) {
    case 'NUMBER':
      return <DynamicParameterNumberField {...props} />
    case 'STRING':
      return <DynamicParameterStringField {...props} />
    case 'DATE':
      return <DynamicParameterDateField {...props} />
    case 'BOOLEAN':
      return <DynamicParameterBooleanField {...props} />
    case 'LOCATOR':
      return <DynamicParameterLocatorField {...props} />
    default:
      return null
  }
}
