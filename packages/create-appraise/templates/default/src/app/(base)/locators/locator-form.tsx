'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formOpts, Locator } from '@/constants/form-opts/locator-form-opts'
import { toast } from '@/hooks/use-toast'
import { ActionResponse } from '@/types/form/actionHandler'
import { useForm } from '@tanstack/react-form'
import React from 'react'
import { z } from 'zod'
import { LocatorGroup } from '@prisma/client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRouter } from 'next/navigation'

const LocatorForm = ({
  defaultValues,
  successTitle,
  successMessage,
  id,
  locatorGroupList,
  onSubmitAction,
}: {
  defaultValues?: Locator
  successTitle: string
  successMessage: string
  locatorGroupList: LocatorGroup[]
  id?: string
  onSubmitAction: (_prev: unknown, value: Locator, id?: string) => Promise<ActionResponse>
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
        router.push('/locators')
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
              <Input
                id={field.name}
                value={field.state.value}
                onChange={e => field.handleChange(e.target.value)}
                placeholder="Enter locator name"
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
      <form.Field
        name="value"
        validators={{
          onChange: z.string().min(1, { message: 'Value is required' }),
        }}
      >
        {field => {
          return (
            <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
              <Label htmlFor={field.name}>Value</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onChange={e => field.handleChange(e.target.value)}
                placeholder="CSS or XPath Selector"
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
      <form.Field
        name="locatorGroupId"
        validators={{
          onChange: z.string().min(1, { message: 'Locator group is required' }),
        }}
      >
        {field => {
          return (
            <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
              <Label htmlFor={field.name}>Locator Group</Label>
              <Select value={field.state.value} onValueChange={value => field.handleChange(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a locator group" />
                </SelectTrigger>
                <SelectContent>
                  {locatorGroupList.map(locatorGroup => (
                    <SelectItem key={locatorGroup.id} value={locatorGroup.id}>
                      {locatorGroup.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

export default LocatorForm
