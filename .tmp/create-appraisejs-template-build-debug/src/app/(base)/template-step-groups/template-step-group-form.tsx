'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formOpts, TemplateStepGroup } from '@/constants/form-opts/template-step-group-form-opts'
import { toast } from '@/hooks/use-toast'
import { ActionResponse } from '@/types/form/actionHandler'
import { useForm } from '@tanstack/react-form'
import { useRouter } from 'next/navigation'
import { z } from 'zod'

// TemplateStepGroupType values
const TemplateStepGroupType = {
  ACTION: 'ACTION',
  VALIDATION: 'VALIDATION',
} as const

// Enum validator for type field
const TemplateStepGroupTypeEnum = z.enum(['ACTION', 'VALIDATION'])

export const TemplateStepGroupForm = ({
  defaultValues,
  successTitle,
  successMessage,
  id,
  onSubmitAction,
}: {
  defaultValues?: TemplateStepGroup
  successTitle: string
  successMessage: string
  id?: string
  onSubmitAction: (
    _prev: unknown,
    value: TemplateStepGroup,
    id?: string,
  ) => Promise<ActionResponse>
}) => {
  const router = useRouter()
  const form = useForm({
    defaultValues: defaultValues ?? formOpts?.defaultValues,
    validators: formOpts?.validators,
    onSubmit: async ({ value }) => {
      const res = await onSubmitAction(undefined, value, id)
      if (res.status === 200) {
        toast({
          title: successTitle,
          description: successMessage,
        })
        router.push('/template-step-groups')
      }
      if (res.status === 400) {
        toast({
          title: 'Error',
          description: res.error,
          variant: 'destructive',
        })
      }
      if (res.status === 500) {
        toast({
          title: 'Error',
          description: res.error,
          variant: 'destructive',
        })
      }
    },
  })
  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      <form.Field
        name="name"
        validators={{
          onChange: z.string().min(3, { message: 'Name must be at least 3 characters' }),
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
              {field.state.meta.errors.map((error, index) => (
                <p key={index} className="text-xs text-pink-500">
                  {typeof error === 'string' ? error : error?.message || String(error)}
                </p>
              ))}
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
              {field.state.meta.errors.map((error, index) => (
                <p key={index} className="text-xs text-pink-500">
                  {typeof error === 'string' ? error : error?.message || String(error)}
                </p>
              ))}
            </div>
          )
        }}
      </form.Field>
      <form.Field
        name="type"
        validators={{
          onChange: TemplateStepGroupTypeEnum,
        }}
      >
        {field => {
          return (
            <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
              <Label htmlFor={field.name}>Type</Label>
              <Select
                onValueChange={value => {
                  field.handleChange(value as 'ACTION' | 'VALIDATION')
                }}
                value={field.state.value}
              >
                <SelectTrigger id={field.name}>
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(TemplateStepGroupType).map(type => (
                    <SelectItem key={type} value={type as string}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {field.state.meta.errors.map((error, index) => (
                <p key={index} className="text-xs text-pink-500">
                  {typeof error === 'string' ? error : error?.message || String(error)}
                </p>
              ))}
            </div>
          )
        }}
      </form.Field>
      <form.Subscribe selector={formState => [formState.canSubmit, formState.isSubmitting]}>
        {([canSubmit, isSubmitting]) => (
          <Button type="submit" disabled={!canSubmit}>
            {isSubmitting ? '...' : 'Save'}
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}
