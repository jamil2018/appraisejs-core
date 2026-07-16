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
        {field => <TextFormField field={field} label="Name" className="mb-4 flex w-full flex-col gap-2 lg:w-1/2" />}
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
            className="mb-4 flex w-full flex-col gap-2 lg:w-1/2"
          />
        )}
      </form.Field>
      <form.Subscribe selector={formState => [formState.canSubmit, formState.isSubmitting]}>
        {([canSubmit, isSubmitting]) => <FormSubmitButton canSubmit={canSubmit} isSubmitting={isSubmitting} />}
      </form.Subscribe>
    </TanStackForm>
  )
}

export default TagForm
