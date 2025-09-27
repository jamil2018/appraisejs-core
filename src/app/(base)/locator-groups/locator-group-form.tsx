'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formOpts, LocatorGroup } from '@/constants/form-opts/locator-group-form-opts'
import { toast } from '@/hooks/use-toast'
import { ActionResponse } from '@/types/form/actionHandler'
import { useForm } from '@tanstack/react-form'
import { initialFormState, ServerFormState } from '@tanstack/react-form/nextjs'
import React, { useCallback, useRef } from 'react'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { Module } from '@prisma/client'
import { checkLocatorGroupNameUniqueAction } from '@/actions/locator-groups/locator-group-actions'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const LocatorGroupForm = ({
  defaultValues,
  successTitle,
  successMessage,
  id,
  onSubmitAction,
  moduleList,
}: {
  defaultValues?: LocatorGroup
  successTitle: string
  successMessage: string
  moduleList: Module[]
  id?: string
  onSubmitAction: (
    initialFormState: ServerFormState<LocatorGroup>,
    value: LocatorGroup,
    id?: string,
  ) => Promise<ActionResponse>
}) => {
  const router = useRouter()
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Debounced function to check name uniqueness
  const checkNameUniqueness = useCallback(
    async (name: string) => {
      if (!name || name.length < 1) return true

      try {
        const response = await checkLocatorGroupNameUniqueAction(name, id)
        return response.status === 200 && (response.data as { isUnique: boolean })?.isUnique
      } catch (error) {
        console.error('Error checking name uniqueness:', error)
        return true // Allow submission if check fails
      }
    },
    [id],
  )

  // Debounced validation function
  const debouncedNameValidation = useCallback(
    (name: string): Promise<boolean> => {
      return new Promise(resolve => {
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current)
        }

        debounceTimeoutRef.current = setTimeout(async () => {
          const isValid = await checkNameUniqueness(name)
          resolve(isValid)
        }, 500) // 500ms debounce
      })
    },
    [checkNameUniqueness],
  )

  const form = useForm({
    defaultValues: defaultValues ?? formOpts?.defaultValues,
    validators: formOpts?.validators,
    onSubmit: async ({ value }) => {
      const res = await onSubmitAction(initialFormState, value, id)
      if (res.status === 200) {
        toast({
          title: successTitle,
          description: successMessage,
        })
        router.push('/locator-groups')
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
          onChangeAsync: async ({ value }) => {
            if (!value || value.length < 1) return undefined
            const isValid = await debouncedNameValidation(value)
            return isValid
              ? undefined
              : 'A locator group with this name already exists. Please choose a different name.'
          },
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
                placeholder="Enter locator group name"
              />
              {field.state.meta.isTouched &&
                field.state.meta.errors.map(error => (
                  <p key={error as string} className="text-xs text-pink-500">
                    {error}
                  </p>
                ))}
              {field.state.meta.isTouched && field.state.meta.errors.length === 0 && field.state.meta.isValidating && (
                <p className="text-xs text-blue-500">Checking name availability...</p>
              )}
            </div>
          )
        }}
      </form.Field>
      <form.Field
        name="moduleId"
        validators={{
          onChange: z.string().min(1, { message: 'Module is required' }),
        }}
      >
        {field => {
          return (
            <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
              <Label htmlFor={field.name}>Module</Label>
              <Select value={field.state.value} onValueChange={value => field.handleChange(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a module" />
                </SelectTrigger>
                <SelectContent>
                  {moduleList.map(moduleData => (
                    <SelectItem key={moduleData.id} value={moduleData.id}>
                      {moduleData.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {field.state.meta.isTouched &&
                field.state.meta.errors.map(error => (
                  <p key={error as string} className="text-xs text-pink-500">
                    {error}
                  </p>
                ))}
            </div>
          )
        }}
      </form.Field>
      <form.Field
        name="route"
        validators={{
          onChange: z.string().optional(),
        }}
      >
        {field => {
          return (
            <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
              <Label htmlFor={field.name}>Route</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onChange={e => field.handleChange(e.target.value)}
                placeholder="Enter the route of page the locator group is for. Default is '/' (root)"
              />
              {field.state.meta.isTouched &&
                field.state.meta.errors.map(error => (
                  <p key={error as string} className="text-xs text-pink-500">
                    {error}
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

export default LocatorGroupForm
