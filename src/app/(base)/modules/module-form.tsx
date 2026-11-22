'use client'

import { FormSubmitButton, TextFormField } from '@/components/form/form-controls'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { moduleFormOpts, type Module, ROOT_MODULE_UUID } from '@/constants/form-opts/module-form-opts'
import { useForm } from '@tanstack/react-form'
import { TanStackForm } from '@/lib/form/tanstack-form'
import { handleStandardFormResult } from '@/lib/form/standard-form-result'
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

const EMPTY_PARENT_OPTIONS: ModuleParentOption[] = []

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
      handleStandardFormResult({
        status: res.status,
        successTitle,
        successMessage,
        errorMessage: getActionErrorMessage(res),
        onSuccess: () => push('/modules'),
      })
    },
  })
  return (
    <TanStackForm
      className="app-surface grid w-full min-w-0 gap-4 rounded-xl border border-border bg-card p-4 lg:grid-cols-2"
      onSubmit={() => form.handleSubmit()}
    >
      <form.Field
        name="name"
        validators={{
          onChange: moduleFieldValidators.name,
        }}
      >
        {field => <TextFormField field={field} label="Name" className="flex min-w-0 flex-col gap-2" />}
      </form.Field>
      <form.Field name="parentId">
        {field => {
          return (
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor={field.name}>Parent</Label>
              <Select
                items={[
                  { value: ROOT_MODULE_UUID, label: 'Root (No Parent)' },
                  ...parentOptions.map(option => ({ value: option.id, label: option.name })),
                ]}
                value={field.state.value || ROOT_MODULE_UUID}
                onValueChange={value => field.handleChange(value)}
              >
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
      <div className="flex border-t border-border pt-4 lg:col-span-2">
        <form.Subscribe selector={formState => [formState.canSubmit, formState.isSubmitting]}>
          {([canSubmit, isSubmitting]) => <FormSubmitButton canSubmit={canSubmit} isSubmitting={isSubmitting} />}
        </form.Subscribe>
      </div>
    </TanStackForm>
  )
}

export default ModuleForm
