'use client'

import { FormFieldErrors, FormSubmitButton, TextFormField } from '@/components/form/form-controls'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { templateStepGroupFormOpts, type TemplateStepGroup } from '@/constants/form-opts/template-step-group-form-opts'
import { useForm } from '@tanstack/react-form'
import { TanStackForm } from '@/lib/form/tanstack-form'
import { handleStandardFormResult } from '@/lib/form/standard-form-result'
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
      handleStandardFormResult({
        status: res.status,
        successTitle,
        successMessage,
        errorMessage: getActionErrorMessage(res),
        onSuccess: () => push('/template-step-groups'),
      })
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
        {field => <TextFormField field={field} label="Name" />}
      </form.Field>
      <form.Field name="description">{field => <TextFormField field={field} label="Description" />}</form.Field>
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
              <FormFieldErrors errors={field.state.meta.errors} isTouched={field.state.meta.isTouched} />
            </div>
          )
        }}
      </form.Field>
      <form.Subscribe selector={formState => [formState.canSubmit, formState.isSubmitting]}>
        {([canSubmit, isSubmitting]) => <FormSubmitButton canSubmit={canSubmit} isSubmitting={isSubmitting} />}
      </form.Subscribe>
    </TanStackForm>
  )
}
