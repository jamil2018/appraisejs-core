'use client'

import { Button } from '@/components/ui/button'
import ErrorMessage from '@/components/form/error-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { templateStepGroupFormOpts, type TemplateStepGroup } from '@/constants/form-opts/template-step-group-form-opts'
import { toast } from '@/hooks/use-toast'
import { useForm } from '@tanstack/react-form'
import { Save } from 'lucide-react'
import { TanStackForm } from '@/lib/form/tanstack-form'
import { useRouter } from 'next/navigation'
import {
  getActionErrorMessage,
  templateStepGroupFieldValidators,
  templateStepGroupTypes,
  type TemplateStepGroupFormSubmitAction,
  type TemplateStepGroupType,
} from './template-step-group-helpers'

type TemplateStepGroupFormProps = {
  defaultValues?: TemplateStepGroup
  successTitle: string
  successMessage: string
  id?: string
  onSubmitAction: TemplateStepGroupFormSubmitAction
}

type TemplateStepGroupFieldErrorsProps = {
  errors: unknown[]
  isTouched: boolean
}

function getErrorMessage(error: unknown) {
  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  return String(error)
}

function TemplateStepGroupFieldErrors({ errors, isTouched }: TemplateStepGroupFieldErrorsProps) {
  if (!isTouched) {
    return null
  }

  return (
    <div className="flex flex-col gap-1" aria-live="polite">
      {errors.map(error => (
        <ErrorMessage key={getErrorMessage(error)} message={getErrorMessage(error)} visible={true} />
      ))}
    </div>
  )
}

export const TemplateStepGroupForm = ({
  defaultValues,
  successTitle,
  successMessage,
  id,
  onSubmitAction,
}: TemplateStepGroupFormProps) => {
  const { push } = useRouter()
  const form = useForm({
    defaultValues: defaultValues ?? templateStepGroupFormOpts.defaultValues,
    validators: templateStepGroupFormOpts.validators,
    onSubmit: async ({ value }) => {
      const res = await onSubmitAction(undefined, value, id)
      if (res.status === 200) {
        toast({
          title: successTitle,
          description: successMessage,
        })
        push('/template-step-groups')
      }
      if (res.status === 400) {
        toast({
          title: 'Error',
          description: getActionErrorMessage(res),
          variant: 'destructive',
        })
      }
      if (res.status === 500) {
        toast({
          title: 'Error',
          description: getActionErrorMessage(res),
          variant: 'destructive',
        })
      }
    },
  })
  return (
    <TanStackForm onSubmit={() => form.handleSubmit()}>
      <form.Field
        name="name"
        validators={{
          onChange: templateStepGroupFieldValidators.name,
        }}
      >
        {field => {
          return (
            <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
              <Label htmlFor={field.name}>Name</Label>
              <Input
                id={field.name}
                name={field.name}
                value={field.state.value}
                onChange={e => field.handleChange(e.target.value)}
              />
              <TemplateStepGroupFieldErrors errors={field.state.meta.errors} isTouched={field.state.meta.isTouched} />
            </div>
          )
        }}
      </form.Field>
      <form.Field name="description">
        {field => {
          return (
            <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
              <Label htmlFor={field.name}>Description</Label>
              <Input
                id={field.name}
                name={field.name}
                value={field.state.value}
                onChange={e => field.handleChange(e.target.value)}
              />
              <TemplateStepGroupFieldErrors errors={field.state.meta.errors} isTouched={field.state.meta.isTouched} />
            </div>
          )
        }}
      </form.Field>
      <form.Field
        name="type"
        validators={{
          onChange: templateStepGroupFieldValidators.type,
        }}
      >
        {field => {
          return (
            <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
              <Label htmlFor={field.name}>Type</Label>
              <Select
                onValueChange={value => {
                  field.handleChange(value as TemplateStepGroupType)
                }}
                value={field.state.value}
              >
                <SelectTrigger id={field.name}>
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  {templateStepGroupTypes.map(type => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <TemplateStepGroupFieldErrors errors={field.state.meta.errors} isTouched={field.state.meta.isTouched} />
            </div>
          )
        }}
      </form.Field>
      <form.Subscribe selector={formState => [formState.canSubmit, formState.isSubmitting]}>
        {([canSubmit, isSubmitting]) => (
          <Button type="submit" disabled={!canSubmit}>
            <Save className="size-4" aria-hidden />
            <span className="font-bold">{isSubmitting ? '...' : 'Save'}</span>
          </Button>
        )}
      </form.Subscribe>
    </TanStackForm>
  )
}
