'use client'

import { useForm } from '@tanstack/react-form'
import { ArrowDown, ArrowUp, PlusCircle, Save, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

import ErrorMessage from '@/components/form/error-message'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import { TanStackForm } from '@/lib/form/tanstack-form'
import {
  parameterMapSchema,
  stepBlockFormOpts,
  type StepBlockFormValues,
} from '@/constants/form-opts/step-block-form-opts'

import {
  getActionErrorMessage,
  stepBlockFieldValidators,
  type StepBlockFormSubmitAction,
  type StepBlockTemplateStepOption,
} from './step-block-helpers'

type StepBlockFormProps = {
  defaultValues?: StepBlockFormValues
  templateSteps: StepBlockTemplateStepOption[]
  successTitle: string
  successMessage: string
  id?: string
  onSubmitAction: StepBlockFormSubmitAction
}

function getErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message === '[object Object]' ? 'Invalid value' : message
}

function getErrorKey(error: unknown) {
  return typeof error === 'object' && error !== null ? JSON.stringify(error) : getErrorMessage(error)
}

function FieldErrors({ errors, isTouched }: { errors: unknown[]; isTouched: boolean }) {
  if (!isTouched) return null
  return (
    <div className="flex flex-col gap-1" aria-live="polite">
      {errors.map(error => (
        <ErrorMessage key={getErrorKey(error)} message={getErrorMessage(error)} visible={true} />
      ))}
    </div>
  )
}

type LabeledTextControlProps = {
  id: string
  label: string
  value: string
  errors: unknown[]
  isTouched: boolean
  multiline?: boolean
  onChange: (value: string) => void
}

function LabeledTextControl({ id, label, value, errors, isTouched, multiline, onChange }: LabeledTextControlProps) {
  const Control = multiline ? Textarea : Input

  return (
    <div className="mb-4 flex flex-col gap-2 lg:w-1/2">
      <Label htmlFor={id}>{label}</Label>
      <Control id={id} name={id} value={value} onChange={event => onChange(event.target.value)} />
      <FieldErrors errors={errors} isTouched={isTouched} />
    </div>
  )
}

function getParameterMapError(value: string) {
  return parameterMapSchema.safeParse(value).success ? null : 'Parameter map must be a JSON object'
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= items.length) return items
  const next = [...items]
  const [removed] = next.splice(index, 1)
  if (!removed) return items
  next.splice(nextIndex, 0, removed)
  return next
}

export function StepBlockForm({
  defaultValues,
  templateSteps,
  successTitle,
  successMessage,
  id,
  onSubmitAction,
}: StepBlockFormProps) {
  const { push } = useRouter()
  const initialValues = defaultValues ?? stepBlockFormOpts.defaultValues
  const nextStepRowId = useRef(initialValues.steps.length)
  const [stepRowIds, setStepRowIds] = useState(() => initialValues.steps.map((_, index) => `step-row-${index}`))
  const form = useForm({
    defaultValues: initialValues,
    validators: stepBlockFormOpts.validators,
    onSubmit: async ({ value }) => {
      const res = await onSubmitAction(undefined, value, id)
      if (res.status === 200) {
        toast({ title: successTitle, description: successMessage })
        push('/step-blocks')
        return
      }
      toast({
        title: 'Error',
        description: getActionErrorMessage(res),
        variant: 'destructive',
      })
    },
  })

  return (
    <TanStackForm onSubmit={() => form.handleSubmit()}>
      <form.Field name="name" validators={{ onChange: stepBlockFieldValidators.name }}>
        {field => (
          <LabeledTextControl
            id={field.name}
            label="Name"
            value={field.state.value}
            errors={field.state.meta.errors}
            isTouched={field.state.meta.isTouched}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <form.Field name="intent" validators={{ onChange: stepBlockFieldValidators.intent }}>
        {field => (
          <LabeledTextControl
            id={field.name}
            label="Intent"
            value={field.state.value ?? ''}
            errors={field.state.meta.errors}
            isTouched={field.state.meta.isTouched}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <form.Field name="description" validators={{ onChange: stepBlockFieldValidators.description }}>
        {field => (
          <LabeledTextControl
            id={field.name}
            label="Description"
            value={field.state.value ?? ''}
            errors={field.state.meta.errors}
            isTouched={field.state.meta.isTouched}
            multiline={true}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <form.Field name="steps" mode="array" validators={{ onChange: stepBlockFieldValidators.steps }}>
        {field => (
          <div className="mb-6 flex max-w-4xl flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label>Steps</Label>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const rowId = `step-row-${nextStepRowId.current}`
                  nextStepRowId.current += 1
                  setStepRowIds(ids => [...ids, rowId])
                  field.pushValue({ templateStepId: '', parameterMap: '{}' })
                }}
              >
                <PlusCircle className="size-4" aria-hidden />
                Add Step
              </Button>
            </div>
            {field.state.value.map((step, index) => (
              <div key={stepRowIds[index]} className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_1fr_auto]">
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`steps-${index}-templateStepId`}>Template Step</Label>
                  <Select
                    value={step.templateStepId}
                    onValueChange={value => {
                      field.replaceValue(index, { ...step, templateStepId: value })
                    }}
                  >
                    <SelectTrigger id={`steps-${index}-templateStepId`}>
                      <SelectValue placeholder="Select a template step" />
                    </SelectTrigger>
                    <SelectContent>
                      {templateSteps.map(templateStep => (
                        <SelectItem key={templateStep.id} value={templateStep.id}>
                          {templateStep.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <ErrorMessage message="Template step is required" visible={!step.templateStepId} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`steps-${index}-parameterMap`}>Parameter Map</Label>
                  <Textarea
                    id={`steps-${index}-parameterMap`}
                    value={step.parameterMap}
                    onChange={event => {
                      field.replaceValue(index, { ...step, parameterMap: event.target.value })
                    }}
                    className="min-h-20 font-mono text-sm"
                  />
                  <ErrorMessage
                    message={getParameterMapError(step.parameterMap) ?? ''}
                    visible={!!getParameterMapError(step.parameterMap)}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Move step up"
                    disabled={index === 0}
                    onClick={() => {
                      setStepRowIds(ids => moveItem(ids, index, -1))
                      field.handleChange(moveItem(field.state.value, index, -1))
                    }}
                  >
                    <ArrowUp className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Move step down"
                    disabled={index === field.state.value.length - 1}
                    onClick={() => {
                      setStepRowIds(ids => moveItem(ids, index, 1))
                      field.handleChange(moveItem(field.state.value, index, 1))
                    }}
                  >
                    <ArrowDown className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    aria-label="Remove step"
                    disabled={field.state.value.length === 1}
                    onClick={() => {
                      setStepRowIds(ids => ids.filter((_, idIndex) => idIndex !== index))
                      field.removeValue(index)
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            ))}
            <FieldErrors errors={field.state.meta.errors} isTouched={field.state.meta.isTouched} />
          </div>
        )}
      </form.Field>
      <form.Subscribe selector={formState => [formState.canSubmit, formState.isSubmitting]}>
        {([canSubmit, isSubmitting]) => (
          <Button type="submit" disabled={!canSubmit || templateSteps.length === 0}>
            <Save className="size-4" aria-hidden />
            <span className="font-bold">{isSubmitting ? '...' : 'Save'}</span>
          </Button>
        )}
      </form.Subscribe>
    </TanStackForm>
  )
}
