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
import { useRouter } from 'next/navigation'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { z } from 'zod'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { checkTestRunNameUniqueAction } from '@/actions/test-run/test-run-actions'

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
  onSubmitAction: (_prev: unknown, value: TestRun, id?: string) => Promise<ActionResponse>
}) => {
  const router = useRouter()
  const [testSelectionType, setTestSelectionType] = useState<TestSelectionType>(TestSelectionType.TAGS)
  const testSelectionTypeRef = useRef<TestSelectionType>(testSelectionType)
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Keep ref in sync with state
  useEffect(() => {
    testSelectionTypeRef.current = testSelectionType
  }, [testSelectionType])

  // Debounced function to check name uniqueness
  // Returns: { isValid: boolean, error?: string }
  // isValid: false only if name is confirmed to be duplicate
  // error: error message to display (only returned when isValid is false to block submission)
  const checkNameUniqueness = useCallback(
    async (name: string): Promise<{ isValid: boolean; error?: string }> => {
      if (!name || name.length < 1) return { isValid: true }

      try {
        const response = await checkTestRunNameUniqueAction(name, id)

        // Handle server errors - allow submission but log the error
        if (response.status === 500) {
          console.error('Server error checking name uniqueness:', response.error)
          // Return valid to allow submission (server will handle validation)
          return { isValid: true }
        }

        // Handle successful response
        if (response.status === 200) {
          const isUnique = (response.data as { isUnique: boolean })?.isUnique ?? true
          if (!isUnique) {
            return {
              isValid: false,
              error: 'A test run with this name already exists. Please choose a different name.',
            }
          }
          return { isValid: true }
        }

        // Unexpected status code - allow submission
        console.warn('Unexpected response status when checking name uniqueness:', response.status)
        return { isValid: true }
      } catch (error) {
        console.error('Error checking name uniqueness:', error)
        // Allow submission if check fails (network error, etc.)
        // Server will handle validation on submit
        return { isValid: true }
      }
    },
    [id],
  )

  // Debounced validation function
  const debouncedNameValidation = useCallback(
    (name: string): Promise<{ isValid: boolean; error?: string }> => {
      return new Promise(resolve => {
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current)
        }

        debounceTimeoutRef.current = setTimeout(async () => {
          const result = await checkNameUniqueness(name)
          resolve(result)
        }, 500) // 500ms debounce
      })
    },
    [checkNameUniqueness],
  )

  const form = useForm({
    defaultValues: defaultValues ?? formOpts?.defaultValues,
    onSubmit: async ({ value }) => {
      const submitValue = {
        ...value,
        tags: testSelectionType === TestSelectionType.TAGS ? value.tags : [],
        testCases: testSelectionType === TestSelectionType.TEST_CASES ? value.testCases : [],
      }
      const res = await onSubmitAction(undefined, submitValue, id)
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
              // Update ref first so validators have the correct value
              testSelectionTypeRef.current = newType
              setTestSelectionType(newType)
              // Clear the other field when switching filter types
              if (newType === TestSelectionType.TAGS) {
                form.setFieldValue('testCases', [])
                // Validate both fields to clear any errors
                form.validateField('tags', 'change')
                form.validateField('testCases', 'change')
              } else {
                form.setFieldValue('tags', [])
                // Validate both fields to clear any errors
                form.validateField('tags', 'change')
                form.validateField('testCases', 'change')
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
              onChange: ({ value }) => {
                const currentSelectionType = testSelectionTypeRef.current
                if (currentSelectionType === TestSelectionType.TAGS) {
                  if (!Array.isArray(value) || value.length === 0) {
                    return 'Tags are required'
                  }
                }
                return undefined
              },
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
                    field.state.meta.errors.map((error, index) => (
                      <p key={index} className="text-xs text-pink-500">
                        {typeof error === 'string' ? error : String(error)}
                      </p>
                    ))}
                </div>
              )
            }}
          </form.Field>

          <form.Field
            name="testCases"
            validators={{
              onChange: ({ value }) => {
                const currentSelectionType = testSelectionTypeRef.current
                if (currentSelectionType === TestSelectionType.TEST_CASES) {
                  if (!Array.isArray(value) || value.length === 0) {
                    return 'Test cases are required'
                  }
                }
                return undefined
              },
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
                    field.state.meta.errors.map((error, index) => (
                      <p key={index} className="text-xs text-pink-500">
                        {typeof error === 'string' ? error : String(error)}
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
            name="name"
            validators={{
              onChange: z.string().min(1, { message: 'Name is required' }),
              onChangeAsync: async ({ value }) => {
                if (!value || value.length < 1) return undefined
                const result = await debouncedNameValidation(value)
                // Only return error if validation explicitly failed (duplicate name)
                // Server errors are handled by allowing submission and letting server validate
                if (!result.isValid && result.error) {
                  return result.error
                }
                return undefined
              },
            }}
          >
            {field => {
              return (
                <div className="mb-4 flex flex-col gap-2">
                  <Label htmlFor={field.name}>Name</Label>
                  <Input
                    id={field.name}
                    value={field.state.value}
                    onChange={e => field.handleChange(e.target.value)}
                    placeholder="Enter name for your test run"
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
                    field.state.meta.errors.map((error, index) => (
                      <p key={index} className="text-xs text-pink-500">
                        {typeof error === 'string' ? error : String(error)}
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
                    field.state.meta.errors.map((error, index) => (
                      <p key={index} className="text-xs text-pink-500">
                        {typeof error === 'string' ? error : String(error)}
                      </p>
                    ))}
                </div>
              )
            }}
          </form.Field>
        </CardContent>
      </Card>
      <form.Subscribe selector={formState => [formState.canSubmit, formState.isSubmitting]}>
        {([canSubmit, isSubmitting, errors]) => (
          <>
            <span>{errors}</span>
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? '...' : 'Start'}
            </Button>
          </>
        )}
      </form.Subscribe>
    </form>
  )
}

export default TestRunForm
