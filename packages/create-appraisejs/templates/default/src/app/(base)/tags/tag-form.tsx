'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formOpts, type Tag } from '@/constants/form-opts/tag-form-opts'
import { toast } from '@/hooks/use-toast'
import { ActionResponse } from '@/types/form/actionHandler'

import { useForm } from '@tanstack/react-form'
import { useRouter } from 'next/navigation'
import React from 'react'
import { z } from 'zod'

const TagForm = ({
  defaultValues,
  successTitle,
  successMessage,
  id,
  onSubmitAction,
}: {
  defaultValues?: Tag
  successTitle: string
  successMessage: string
  id?: string
  onSubmitAction: (_prev: unknown, value: Tag, id?: string) => Promise<ActionResponse>
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
        router.push('/tags')
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
          onChange: z.string().min(1, { message: 'Name is required' }),
        }}
      >
        {field => {
          return (
            <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
              <Label htmlFor={field.name}>Name</Label>
              <Input id={field.name} value={field.state.value} onChange={e => field.handleChange(e.target.value)} />
              {field.state.meta.isTouched &&
                field.state.meta.errors.map((error, index) => (
                  <p key={index} className="text-xs text-pink-500">
                    {typeof error === 'string' ? error : error?.message || String(error)}
                  </p>
                ))}
            </div>
          )
        }}
      </form.Field>
      <form.Field
        name="tagExpression"
        validators={{
          onChange: z
            .string()
            .min(1, { message: 'Tag expression is required' })
            .refine(
              value => {
                // Check if the value follows Gherkin tag rules
                // Only one tag allowed per entry - single word after @ symbol
                const trimmedValue = value.trim()
                if (!trimmedValue) return false

                // Should not contain any spaces (only one tag allowed)
                if (trimmedValue.includes(' ')) return false

                // Tag should start with @
                if (!trimmedValue.startsWith('@')) return false

                // Tag should have at least one character after @
                if (trimmedValue.length <= 1) return false

                return true
              },
              {
                message: 'Tag expression must be a single tag starting with @ and contain no spaces (e.g., "@smoke")',
              },
            ),
        }}
      >
        {field => {
          return (
            <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
              <Label htmlFor={field.name}>Tag Expression</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onChange={e => field.handleChange(e.target.value)}
                placeholder="e.g. @smoke"
              />
              {field.state.meta.isTouched &&
                field.state.meta.errors.map((error, index) => (
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

export default TagForm
