'use client'

import { Button } from '@/components/ui/button'
import ErrorMessage from '@/components/form/error-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { moduleFormOpts, type Module, ROOT_MODULE_UUID } from '@/constants/form-opts/module-form-opts'
import { toast } from '@/hooks/use-toast'
import { useForm } from '@tanstack/react-form'
import { Save } from 'lucide-react'
import { TanStackForm } from '@/lib/form/tanstack-form'
import { useRouter } from 'next/navigation'
import {
  getActionErrorMessage,
  moduleFieldValidators,
  type ModuleFormSubmitAction,
  type ModuleParentOption,
} from './module-helpers'

type ModuleFormProps = {
  defaultValues?: Module
  successTitle: string
  successMessage: string
  parentOptions?: ModuleParentOption[]
  id?: string
  onSubmitAction: ModuleFormSubmitAction
}

type ModuleFieldErrorsProps = {
  errors: unknown[]
  isTouched: boolean
}

const EMPTY_PARENT_OPTIONS: ModuleParentOption[] = []

function getErrorMessage(error: unknown) {
  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  return String(error)
}

function ModuleFieldErrors({ errors, isTouched }: ModuleFieldErrorsProps) {
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

const ModuleForm = ({
  defaultValues,
  successTitle,
  successMessage,
  parentOptions = EMPTY_PARENT_OPTIONS,
  id,
  onSubmitAction,
}: ModuleFormProps) => {
  const { push } = useRouter()
  const form = useForm({
    defaultValues: defaultValues ?? moduleFormOpts.defaultValues,
    validators: moduleFormOpts.validators,
    onSubmit: async ({ value }) => {
      const res = await onSubmitAction(undefined, value, id)
      if (res.status === 200) {
        toast({
          title: successTitle,
          description: successMessage,
        })
        push('/modules')
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
          onChange: moduleFieldValidators.name,
        }}
      >
        {field => {
          return (
            <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
              <Label htmlFor={field.name}>Name</Label>
              <Input id={field.name} value={field.state.value} onChange={e => field.handleChange(e.target.value)} />
              <ModuleFieldErrors errors={field.state.meta.errors} isTouched={field.state.meta.isTouched} />
            </div>
          )
        }}
      </form.Field>
      <form.Field name="parentId">
        {field => {
          return (
            <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
              <Label htmlFor={field.name}>Parent</Label>
              <Select value={field.state.value || ROOT_MODULE_UUID} onValueChange={value => field.handleChange(value)}>
                <SelectTrigger id={field.name}>
                  <SelectValue
                    placeholder={parentOptions.length === 0 ? 'No parent modules available' : 'Select a parent or Root'}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOT_MODULE_UUID}>Root (No Parent)</SelectItem>
                  {parentOptions.length > 0
                    ? parentOptions.map(option => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))
                    : null}
                </SelectContent>
              </Select>
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

export default ModuleForm
