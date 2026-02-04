'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formOpts, type Environment } from '@/constants/form-opts/environment-form-opts'
import { toast } from '@/hooks/use-toast'
import { ActionResponse } from '@/types/form/actionHandler'
import { useForm } from '@tanstack/react-form'
import { useRouter } from 'next/navigation'
import React, { useState } from 'react'
import { z } from 'zod'
import { Eye, EyeOff } from 'lucide-react'

const EnvironmentForm = ({
  defaultValues,
  successTitle,
  successMessage,
  id,
  onSubmitAction,
}: {
  defaultValues?: Environment
  successTitle: string
  successMessage: string
  id?: string
  onSubmitAction: (
    _prev: unknown,
    value: Environment,
    id?: string,
  ) => Promise<ActionResponse>
}) => {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
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
        router.push('/environments')
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
        name="baseUrl"
        validators={{
          onChange: z.string().url({ message: 'Base URL must be a valid URL' }),
        }}
      >
        {field => {
          return (
            <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
              <Label htmlFor={field.name}>Base URL</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onChange={e => field.handleChange(e.target.value)}
                placeholder="https://example.com"
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
        name="apiBaseUrl"
        validators={{
          onChange: z.string().url({ message: 'API Base URL must be a valid URL' }).optional().or(z.literal('')),
        }}
      >
        {field => {
          return (
            <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
              <Label htmlFor={field.name}>API Base URL (Optional)</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onChange={e => field.handleChange(e.target.value)}
                placeholder="https://api.example.com"
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
        name="username"
        validators={{
          onChange: z.string().optional().or(z.literal('')),
        }}
      >
        {field => {
          return (
            <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
              <Label htmlFor={field.name}>Username (Optional)</Label>
              <Input
                id={field.name}
                value={field.state.value}
                onChange={e => field.handleChange(e.target.value)}
                placeholder="Enter username"
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
        name="password"
        validators={{
          onChange: z.string().optional().or(z.literal('')),
        }}
      >
        {field => {
          return (
            <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
              <Label htmlFor={field.name}>Password (Optional)</Label>
              <div className="relative">
                <Input
                  id={field.name}
                  type={showPassword ? 'text' : 'password'}
                  value={field.state.value}
                  onChange={e => field.handleChange(e.target.value)}
                  placeholder="Enter password"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
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

export default EnvironmentForm
