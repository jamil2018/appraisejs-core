'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formOpts, type Module, ROOT_MODULE_UUID } from '@/constants/form-opts/module-form-opts'
import { toast } from '@/hooks/use-toast'
import { ActionResponse } from '@/types/form/actionHandler'
import { useForm } from '@tanstack/react-form'
import { useRouter } from 'next/navigation'
import React from 'react'
import { z } from 'zod'

const ModuleForm = ({
  defaultValues,
  successTitle,
  successMessage,
  parentOptions,
  id,
  onSubmitAction,
}: {
  defaultValues?: Module
  successTitle: string
  successMessage: string
  parentOptions: { id: string; name: string }[]
  id?: string
  onSubmitAction: (_prev: unknown, value: Module, id?: string) => Promise<ActionResponse>
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
        router.push('/modules')
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
      <form.Field name="parentId">
        {field => {
          return (
            <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
              <Label htmlFor={field.name}>Parent</Label>
              <Select value={field.state.value || ROOT_MODULE_UUID} onValueChange={value => field.handleChange(value)}>
                <SelectTrigger>
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
            {isSubmitting ? '...' : 'Save'}
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}

export default ModuleForm
