'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formOpts, TestRun } from '@/constants/form-opts/test-run-form-opts'
import { toast } from '@/hooks/use-toast'
import { ActionResponse } from '@/types/form/actionHandler'
import { Environment, TestCase, TestSuite } from '@prisma/client'
import { useForm } from '@tanstack/react-form'
import { initialFormState, ServerFormState } from '@tanstack/react-form/nextjs'
import { useRouter } from 'next/navigation'
import React from 'react'
import { z } from 'zod'

const TestRunForm = ({
  defaultValues,
  successTitle,
  successMessage,
  testSuiteTestCases,
  environments,
  id,
  onSubmitAction,
}: {
  defaultValues?: TestRun
  successTitle: string
  successMessage: string
  testSuiteTestCases: (TestSuite & { testCases: TestCase[] })[]
  environments: Environment[]
  id?: string
  onSubmitAction: (initialFormState: ServerFormState<TestRun>, value: TestRun, id?: string) => Promise<ActionResponse>
}) => {
  const router = useRouter()
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
        router.push('/test-runs')
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
        name="environmentId"
        validators={{
          onChange: z.string().min(1, { message: 'Environment is required' }),
        }}
      >
        {field => {
          return (
            <div className="mb-4 flex flex-col gap-2 lg:w-1/3">
              <Label htmlFor={field.name}>Environment</Label>
              <Select value={field.state.value} onValueChange={value => field.handleChange(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an environment" />
                </SelectTrigger>
                <SelectContent>
                  {environments.length === 0 ? (
                    <div className="p-2 text-sm">No environments available</div>
                  ) : (
                    environments.map(environment => (
                      <SelectItem key={environment.id} value={environment.id}>
                        {environment.name}
                      </SelectItem>
                    ))
                  )}
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

export default TestRunForm
