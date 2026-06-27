'use client'

import { Button } from '@/components/ui/button'
import ErrorMessage from '@/components/form/error-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { environmentFormOpts, type Environment } from '@/constants/form-opts/environment-form-opts'
import { toast } from '@/hooks/use-toast'
import { useForm } from '@tanstack/react-form'
import { TanStackForm } from '@/lib/form/tanstack-form'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Eye, EyeOff, Save } from 'lucide-react'
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

type EnvironmentFieldErrorsProps = {
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

function EnvironmentFieldErrors({ errors, isTouched }: EnvironmentFieldErrorsProps) {
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

const EnvironmentForm = ({ defaultValues, successTitle, successMessage, id, onSubmitAction }: EnvironmentFormProps) => {
  const { push } = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const form = useForm({
    defaultValues: defaultValues ?? environmentFormOpts.defaultValues,
    validators: environmentFormOpts.validators,
    onSubmit: async ({ value }) => {
      const res = await onSubmitAction(undefined, value, id)
      if (res.status === 200) {
        toast({
          title: successTitle,
          description: successMessage,
        })
        push('/environments')
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
          onChange: environmentFieldValidators.name,
        }}
      >
        {field => {
          return (
            <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
              <Label htmlFor={field.name}>Name</Label>
              <Input id={field.name} value={field.state.value} onChange={e => field.handleChange(e.target.value)} />
              <EnvironmentFieldErrors errors={field.state.meta.errors} isTouched={field.state.meta.isTouched} />
            </div>
          )
        }}
      </form.Field>
      <form.Field
        name="baseUrl"
        validators={{
          onChange: environmentFieldValidators.baseUrl,
        }}
      >
        {field => {
          return (
            <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
              <Label htmlFor={field.name}>Base URL</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onChange={e => field.handleChange(e.target.value)}
                placeholder="https://example.com"
              />
              <EnvironmentFieldErrors errors={field.state.meta.errors} isTouched={field.state.meta.isTouched} />
            </div>
          )
        }}
      </form.Field>
      <form.Field
        name="apiBaseUrl"
        validators={{
          onChange: environmentFieldValidators.apiBaseUrl,
        }}
      >
        {field => {
          return (
            <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
              <Label htmlFor={field.name}>API Base URL (Optional)</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onChange={e => field.handleChange(e.target.value)}
                placeholder="https://api.example.com"
              />
              <EnvironmentFieldErrors errors={field.state.meta.errors} isTouched={field.state.meta.isTouched} />
            </div>
          )
        }}
      </form.Field>
      <form.Field
        name="username"
        validators={{
          onChange: environmentFieldValidators.username,
        }}
      >
        {field => {
          return (
            <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
              <Label htmlFor={field.name}>Username (Optional)</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onChange={e => field.handleChange(e.target.value)}
                placeholder="Enter username"
              />
              <EnvironmentFieldErrors errors={field.state.meta.errors} isTouched={field.state.meta.isTouched} />
            </div>
          )
        }}
      </form.Field>
      <form.Field
        name="password"
        validators={{
          onChange: environmentFieldValidators.password,
        }}
      >
        {field => {
          return (
            <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
              <Label htmlFor={field.name}>Password (Optional)</Label>
              <div className="relative">
                <Input
                  id={field.name}
                  type={showPassword ? 'text' : 'password'}
                  value={field.state.value}
                  onChange={e => field.handleChange(e.target.value)}
                  placeholder="Enter password"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden="true" />
                  ) : (
                    <Eye className="size-4" aria-hidden="true" />
                  )}
                </Button>
              </div>
              <EnvironmentFieldErrors errors={field.state.meta.errors} isTouched={field.state.meta.isTouched} />
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

export default EnvironmentForm
