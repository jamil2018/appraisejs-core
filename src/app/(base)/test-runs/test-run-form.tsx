'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'
import { formOpts, TestRun } from '@/constants/form-opts/test-run-form-opts'
import { toast } from '@/hooks/use-toast'
import { ActionResponse } from '@/types/form/actionHandler'
import { BrowserEngine, Environment, Tag, TestCase, TestRunTestCase, TestSuite } from '@prisma/client'
import { useForm } from '@tanstack/react-form'
import { initialFormState, ServerFormState } from '@tanstack/react-form/nextjs'
import { useRouter } from 'next/navigation'
import React, { useState } from 'react'
import { z } from 'zod'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

enum TestSelectionType {
  TAGS = 'tags',
  TEST_CASES = 'testCases',
}

const TestRunForm = ({
  defaultValues,
  successTitle,
  successMessage,
  testSuiteTestCases,
  environments,
  tags,
  id,
  onSubmitAction,
}: {
  defaultValues?: TestRun
  successTitle: string
  successMessage: string
  testSuiteTestCases: (TestSuite & { testCases: TestCase[] })[]
  environments: Environment[]
  tags: Tag[]
  id?: string
  onSubmitAction: (initialFormState: ServerFormState<TestRun>, value: TestRun, id?: string) => Promise<ActionResponse>
}) => {
  const router = useRouter()
  const [testSelectionType, setTestSelectionType] = useState<TestSelectionType>(TestSelectionType.TAGS)

  const form = useForm({
    defaultValues: defaultValues ?? formOpts?.defaultValues,
    validators: formOpts?.validators,
    onSubmit: async ({ value }) => {
      // Ensure only the selected filter type is submitted
      console.log(`value: ${JSON.stringify(value)}`)
      const submitValue = {
        ...value,
        tags: testSelectionType === TestSelectionType.TAGS ? value.tags : [],
        testCases: testSelectionType === TestSelectionType.TEST_CASES ? value.testCases : [],
      }
      const res = await onSubmitAction(initialFormState, submitValue, id)
      if (res.status === 200) {
        toast({
          title: successTitle,
          description: successMessage,
        })
        // Redirect to test run detail page if test run ID is available
        if (res.data && typeof res.data === 'object' && 'id' in res.data) {
          router.push(`/test-runs/${res.data.id}`)
        } else {
          router.push('/test-runs')
        }
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
      <Card className="mb-4 lg:w-1/3">
        <CardHeader>
          <CardTitle>Filter Tests</CardTitle>
          <CardDescription>Select how would you like to filter your tests</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            defaultValue={testSelectionType}
            onValueChange={value => {
              const newType = value as TestSelectionType
              setTestSelectionType(newType)
              // Clear the other field when switching filter types
              if (newType === TestSelectionType.TAGS) {
                form.setFieldValue('testCases', [])
              } else {
                form.setFieldValue('tags', [])
              }
            }}
            className="mb-4 flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value={TestSelectionType.TAGS} id={TestSelectionType.TAGS} />
              <Label htmlFor={TestSelectionType.TAGS}>By Tags</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value={TestSelectionType.TEST_CASES} id={TestSelectionType.TEST_CASES} />
              <Label htmlFor={TestSelectionType.TEST_CASES}>By Test Cases</Label>
            </div>
          </RadioGroup>

          <form.Field
            name="tags"
            validators={{
              onChange: z
                .array(z.string())
                .min(testSelectionType === TestSelectionType.TAGS ? 1 : 0, { message: 'Tags are required' }),
            }}
          >
            {field => {
              return (
                <div
                  className={`mb-4 flex flex-col gap-2 ${testSelectionType === TestSelectionType.TAGS ? 'block' : 'hidden'}`}
                >
                  <MultiSelect
                    options={tags.map(tag => ({ label: tag.name, value: tag.id }))}
                    selected={field.state.value}
                    onChange={field.handleChange}
                    placeholder="Select tags"
                    emptyMessage="No tags available"
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

          <form.Field
            name="testCases"
            validators={{
              onChange: z
                .array(z.object({ testCaseId: z.string() }))
                .min(testSelectionType === TestSelectionType.TEST_CASES ? 1 : 0, {
                  message: 'Test cases are required',
                }),
            }}
          >
            {field => {
              return (
                <div
                  className={`mb-4 flex flex-col gap-2 ${testSelectionType === TestSelectionType.TEST_CASES ? 'block' : 'hidden'}`}
                >
                  <MultiSelect
                    options={testSuiteTestCases.flatMap(testSuite =>
                      testSuite.testCases.map(testCase => ({ label: testCase.title, value: testCase.id })),
                    )}
                    selected={field.state.value.map(testCase => testCase.testCaseId)}
                    onChange={value =>
                      field.handleChange(
                        value.map(testCaseId => ({ testCaseId: testCaseId }) as unknown as TestRunTestCase),
                      )
                    }
                    placeholder="Select test cases"
                    emptyMessage="No test cases available"
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
        </CardContent>
      </Card>

      <Card className="mb-4 lg:w-1/3">
        <CardHeader>
          <CardTitle>Test Configuration</CardTitle>
          <CardDescription>Set the configuration for your test run</CardDescription>
        </CardHeader>
        <CardContent>
          <form.Field
            name="environmentId"
            validators={{
              onChange: z.string().min(1, { message: 'Environment is required' }),
            }}
          >
            {field => {
              return (
                <div className="mb-4 flex flex-col gap-2">
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

          <form.Field
            name="testWorkersCount"
            validators={{ onChange: z.number().min(1, { message: 'Test workers count must be at least 1' }) }}
          >
            {field => {
              return (
                <div className="mb-4 flex flex-col gap-2">
                  <Label htmlFor={field.name}>Test Workers Count</Label>
                  <Input
                    type="number"
                    value={field.state.value}
                    onChange={e => field.handleChange(Number(e.target.value))}
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
          <form.Field name="browserEngine" validators={{ onChange: z.nativeEnum(BrowserEngine) }}>
            {field => {
              return (
                <div className="mb-4 flex flex-col gap-2">
                  <Label htmlFor={field.name}>Browser Engine</Label>
                  <Select
                    value={field.state.value}
                    onValueChange={value => field.handleChange(value as unknown as BrowserEngine)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a browser engine" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={BrowserEngine.CHROMIUM}>Chromium</SelectItem>
                      <SelectItem value={BrowserEngine.FIREFOX}>Firefox</SelectItem>
                      <SelectItem value={BrowserEngine.WEBKIT}>WebKit</SelectItem>
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
        </CardContent>
      </Card>
      <form.Subscribe selector={formState => [formState.canSubmit, formState.isSubmitting]}>
        {([canSubmit, isSubmitting]) => (
          <Button type="submit" disabled={!canSubmit}>
            {isSubmitting ? '...' : 'Start'}
          </Button>
        )}
      </form.Subscribe>
    </form>
  )
}

export default TestRunForm
