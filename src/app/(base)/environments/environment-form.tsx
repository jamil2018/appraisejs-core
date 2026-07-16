'use client'

import { FormSubmitButton, TextFormField } from '@/components/form/form-controls'
import { environmentFormOpts, type Environment } from '@/constants/form-opts/environment-form-opts'
import { useForm } from '@tanstack/react-form'
import { TanStackForm } from '@/lib/form/tanstack-form'
import { handleStandardFormResult } from '@/lib/form/standard-form-result'
import { useRouter } from 'next/navigation'
import {
  environmentFieldValidators,
  getActionErrorMessage,
  type EnvironmentFormSubmitAction,
} from './environment-helpers'

type EnvironmentFormProps = {
  defaultValues?: Environment
  successTitle: string
  successMessage: string
  id?: string
  onSubmitAction: EnvironmentFormSubmitAction
}

const EnvironmentForm = ({ defaultValues, successTitle, successMessage, id, onSubmitAction }: EnvironmentFormProps) => {
  const { push } = useRouter()
  const form = useForm({
    defaultValues: defaultValues ?? environmentFormOpts.defaultValues,
    validators: environmentFormOpts.validators,
    onSubmit: async ({ value }) => {
      const res = await onSubmitAction(undefined, value, id)
      handleStandardFormResult({
        status: res.status,
        successTitle,
        successMessage,
        errorMessage: getActionErrorMessage(res),
        onSuccess: () => push('/environments'),
      })
    },
  })
  return (
    <TanStackForm onSubmit={() => form.handleSubmit()}>
      <form.Field
        name="name"
        validators={{
          onChange: environmentFieldValidators.name,
        }}
      >
        {field => <TextFormField field={field} label="Name" />}
      </form.Field>
      <form.Field
        name="baseUrl"
        validators={{
          onChange: environmentFieldValidators.baseUrl,
        }}
      >
        {field => <TextFormField field={field} label="Base URL" placeholder="https://example.com" />}
      </form.Field>
      <form.Field
        name="apiBaseUrl"
        validators={{
          onChange: environmentFieldValidators.apiBaseUrl,
        }}
      >
        {field => <TextFormField field={field} label="API Base URL (Optional)" placeholder="https://api.example.com" />}
      </form.Field>
      <form.Field
        name="username"
        validators={{
          onChange: environmentFieldValidators.username,
        }}
      >
        {field => <TextFormField field={field} label="Username (Optional)" placeholder="Enter username" />}
      </form.Field>
      <form.Field
        name="passwordEnvironmentVariable"
        validators={{
          onChange: environmentFieldValidators.passwordEnvironmentVariable,
        }}
      >
        {field => (
          <TextFormField
            field={field}
            label="Password environment variable (Optional)"
            placeholder="APPRAISE_STAGING_PASSWORD"
            autoComplete="off"
            description="Store the secret in the named process environment variable. Appraise stores only this reference."
          />
        )}
      </form.Field>
      <form.Subscribe selector={formState => [formState.canSubmit, formState.isSubmitting]}>
        {([canSubmit, isSubmitting]) => <FormSubmitButton canSubmit={canSubmit} isSubmitting={isSubmitting} />}
      </form.Subscribe>
    </TanStackForm>
  )
}

export default EnvironmentForm
