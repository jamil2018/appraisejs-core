'use client'

import { FormSubmitButton, TextFormField } from '@/components/form/form-controls'
import { tagFormOpts, type Tag } from '@/constants/form-opts/tag-form-opts'
import { toast } from '@/hooks/use-toast'
import { getActionErrorMessage, getCreatedTag, tagFieldValidators, type TagFormSubmitAction } from './tag-form-helpers'

import type { Tag as PrismaTag } from '@prisma/client'
import { useForm } from '@tanstack/react-form'
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
  expectedUpdatedAt?: string
}

const TagForm = ({
  defaultValues,
  successTitle,
  successMessage,
  id,
  onSubmitAction,
  onSuccess,
  redirectPath = '/tags',
  expectedUpdatedAt,
}: TagFormProps) => {
  const { push } = useRouter()
  const form = useForm({
    defaultValues: defaultValues ?? tagFormOpts.defaultValues,
    validators: tagFormOpts.validators,
    onSubmit: async ({ value }) => {
      const res =
        expectedUpdatedAt === undefined
          ? await onSubmitAction(undefined, value, id)
          : await onSubmitAction(undefined, value, id, expectedUpdatedAt)
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
      if (res.status === 400 || res.status === 409) {
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
    <TanStackForm
      className="app-surface grid w-full min-w-0 gap-4 rounded-xl border border-border bg-card p-4 lg:grid-cols-2"
      onSubmit={() => form.handleSubmit()}
    >
      <form.Field
        name="name"
        validators={{
          onChange: tagFieldValidators.name,
        }}
      >
        {field => <TextFormField field={field} label="Name" className="flex min-w-0 flex-col gap-2" />}
      </form.Field>
      <form.Field
        name="tagExpression"
        validators={{
          onChange: tagFieldValidators.tagExpression,
        }}
      >
        {field => (
          <TextFormField
            field={field}
            label="Tag Expression"
            placeholder="e.g. @smoke"
            className="flex min-w-0 flex-col gap-2"
          />
        )}
      </form.Field>
      <div className="flex border-t border-border pt-4 lg:col-span-2">
        <form.Subscribe selector={formState => [formState.canSubmit, formState.isSubmitting]}>
          {([canSubmit, isSubmitting]) => (
            <FormSubmitButton canSubmit={canSubmit && !isSubmitting} isSubmitting={isSubmitting} />
          )}
        </form.Subscribe>
      </div>
    </TanStackForm>
  )
}

export default TagForm
