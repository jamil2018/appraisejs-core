'use client'

import { useEffect, useRef } from 'react'
import { Save } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { StepDefinitionOption } from '@/types/step-definition-option'

import { parseStepInvocationInput, StepInvocationFields } from './step-invocation-fields'
import type { StepInvocationResources } from './step-invocation-resources'

type StepInvocationEditorProps = {
  title: string
  definition: StepDefinitionOption
  values: Record<string, unknown>
  errors: Record<string, string>
  onCancel: () => void
  onChange: (name: string, value: unknown) => void
  onErrorsChange: (errors: Record<string, string>) => void
  onSave: (values: Record<string, unknown>) => void
  resources?: StepInvocationResources
  variant?: 'dialog' | 'sidebar'
}

type InvocationParseResult = {
  values: Record<string, unknown>
  errors: Record<string, string>
}

function parseInputValue(input: StepDefinitionOption['inputs'][number], raw: unknown): unknown {
  if (input.type === 'boolean') {
    if (raw === undefined && !input.required) return undefined
    return parseStepInvocationInput(input, Boolean(raw))
  }
  return parseStepInvocationInput(input, String(raw ?? ''))
}

function parseInvocationValues(
  definition: StepDefinitionOption,
  values: Record<string, unknown>,
): InvocationParseResult {
  return definition.inputs.reduce<InvocationParseResult>(
    (result, input) => {
      try {
        const value = parseInputValue(input, values[input.name])
        if (value !== undefined) result.values[input.name] = value
      } catch (error) {
        result.errors[input.name] = error instanceof Error ? error.message : 'Invalid value.'
      }
      if (input.required && (result.values[input.name] === '' || result.values[input.name] === undefined)) {
        result.errors[input.name] = `${input.name} is required.`
      }
      return result
    },
    { values: {}, errors: {} },
  )
}

export function StepInvocationEditor({
  title,
  definition,
  values,
  errors,
  onCancel,
  onChange,
  onErrorsChange,
  onSave,
  resources,
  variant = 'dialog',
}: StepInvocationEditorProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    const firstField = dialog?.querySelector<HTMLElement>('input, select, textarea')
    ;(firstField ?? dialog?.querySelector<HTMLElement>('button'))?.focus()
  }, [])
  const submit = () => {
    const result = parseInvocationValues(definition, values)
    if (Object.keys(result.errors).length > 0) {
      onErrorsChange(result.errors)
      return
    }
    onErrorsChange({})
    onSave(result.values)
  }
  return (
    <Card
      ref={dialogRef}
      className={variant === 'sidebar' ? 'border-0 bg-transparent p-0 shadow-none' : 'max-h-96 overflow-auto p-4'}
      role="dialog"
      aria-modal={variant === 'dialog' ? 'true' : undefined}
      aria-labelledby="step-invocation-editor-title"
    >
      <form
        noValidate
        onSubmit={event => {
          event.preventDefault()
          submit()
        }}
      >
        <div className="mb-3">
          <p id="step-invocation-editor-title" className="font-medium">
            {title}
          </p>
        </div>
        <StepInvocationFields
          definition={definition}
          values={values}
          errors={errors}
          resources={resources}
          onChange={onChange}
        />
        {errors.form ? (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {errors.form}
          </p>
        ) : null}
        <div className="mt-4 flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">
            <Save data-icon="inline-start" aria-hidden />
            Save step
          </Button>
        </div>
      </form>
    </Card>
  )
}
