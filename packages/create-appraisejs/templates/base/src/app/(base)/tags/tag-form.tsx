'use client'

import { Button } from '@/components/ui/button'
import ErrorMessage from '@/components/form/error-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { tagFormOpts, type Tag } from '@/constants/form-opts/tag-form-opts'
import { toast } from '@/hooks/use-toast'
import { getActionErrorMessage, getCreatedTag, tagFieldValidators, type TagFormSubmitAction } from './tag-form-helpers'

import type { Tag as PrismaTag } from '@prisma/client'
import { useForm } from '@tanstack/react-form'
import { Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { TanStackForm } from '@/lib/form/tanstack-form'

type TagFormProps = {
  defaultValues?: Tag
  successTitle: string
  successMessage: string
  id?: string
  onSubmitAction: TagFormSubmitAction
  onSuccess?: (tag: PrismaTag) => void | Promise<void>
  redirectPath?: string | null
}

type TagFieldErrorsProps = {
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

function TagFieldErrors({ errors, isTouched }: TagFieldErrorsProps) {
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

const TagForm = ({
  defaultValues,
  successTitle,
  successMessage,
  id,
  onSubmitAction,
  onSuccess,
  redirectPath = '/tags',
}: TagFormProps) => {
  const { push } = useRouter()
  const form = useForm({
    defaultValues: defaultValues ?? tagFormOpts.defaultValues,
    validators: tagFormOpts.validators,
    onSubmit: async ({ value }) => {
      const res = await onSubmitAction(undefined, value, id)
      if (res.status === 200) {
        if (onSuccess) {
          const createdTag = getCreatedTag(res.data)
          if (!createdTag) {
            toast({
              title: 'Error',
              description: 'Created tag data was not returned.',
              variant: 'destructive',
            })
            return
          }

          await onSuccess(createdTag)
        }

        toast({
          title: successTitle,
          description: successMessage,
        })

        if (redirectPath) {
          push(redirectPath)
        }
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
          onChange: tagFieldValidators.name,
        }}
      >
        {field => {
          return (
            <div className="mb-4 flex w-full flex-col gap-2 lg:w-1/2">
              <Label htmlFor={field.name}>Name</Label>
              <Input id={field.name} value={field.state.value} onChange={e => field.handleChange(e.target.value)} />
              <TagFieldErrors errors={field.state.meta.errors} isTouched={field.state.meta.isTouched} />
            </div>
          )
        }}
      </form.Field>
      <form.Field
        name="tagExpression"
        validators={{
          onChange: tagFieldValidators.tagExpression,
        }}
      >
        {field => {
          return (
            <div className="mb-4 flex w-full flex-col gap-2 lg:w-1/2">
              <Label htmlFor={field.name}>Tag Expression</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onChange={e => field.handleChange(e.target.value)}
                placeholder="e.g. @smoke"
              />
              <TagFieldErrors errors={field.state.meta.errors} isTouched={field.state.meta.isTouched} />
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

export default TagForm
