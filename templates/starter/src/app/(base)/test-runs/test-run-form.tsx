'use client'

import { Button } from '@/components/ui/button'
import ErrorMessage from '@/components/form/error-message'
import TestSuitePicker from '@/components/test-suite/test-suite-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'
import { formOpts, type TestRun } from '@/constants/form-opts/test-run-form-opts'
import { toast } from '@/hooks/use-toast'
import { BrowserEngine, Environment, Tag } from '@prisma/client'
import { useForm } from '@tanstack/react-form'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Info, Play } from 'lucide-react'
import type { TestSuitePickerRow } from '@/types/test-suite-picker'
import {
  buildTestRunSubmitValue,
  getActionErrorMessage,
  getBrowserEngineOptions,
  getFieldErrorMessage,
  getInitialTestSelectionType,
  getTestRunSuccessPath,
  testRunFieldValidators,
  testRunQuickTips,
  testSelectionTypes,
  type TestRunFormSubmitAction,
  type TestSelectionType,
  validateTagSelections,
  validateTestSuiteSelections,
} from './test-run-form-helpers'
import { useTestRunNameValidation } from './use-test-run-name-validation'

type TestRunFormProps = {
  defaultValues?: TestRun
  successTitle: string
  successMessage: string
  testSuites: TestSuitePickerRow[]
  environments: Environment[]
  tags: Tag[]
  id?: string
  onSubmitAction: TestRunFormSubmitAction
}

type TestRunFieldErrorsProps = {
  errors: unknown[]
  isTouched: boolean
}

function TestRunFieldErrors({ errors, isTouched }: TestRunFieldErrorsProps) {
  if (!isTouched) {
    return null
  }

  return (
    <div className="flex flex-col gap-1" aria-live="polite">
      {errors.map((error, index) => (
        <ErrorMessage key={`${String(error)}-${index}`} message={getFieldErrorMessage(error)} visible={true} />
      ))}
    </div>
  )
}

const TestRunForm = ({
  defaultValues,
  successTitle,
  successMessage,
  testSuites,
  environments,
  tags,
  id,
  onSubmitAction,
}: TestRunFormProps) => {
  const router = useRouter()
  const { debouncedNameValidation } = useTestRunNameValidation(id)
  const [testSelectionType, setTestSelectionType] = useState<TestSelectionType>(() =>
    getInitialTestSelectionType(defaultValues),
  )
  const testSelectionTypeRef = useRef<TestSelectionType>(testSelectionType)

  const form = useForm({
    defaultValues: defaultValues ?? formOpts.defaultValues,
    validators: formOpts.validators,
    onSubmit: async ({ value }) => {
      const submitValue = buildTestRunSubmitValue(value, testSelectionType)
      const res = await onSubmitAction(undefined, submitValue, id)
      if (res.status === 200) {
        toast({
          title: successTitle,
          description: successMessage,
        })
        router.push(getTestRunSuccessPath(res.data))
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

  const handleSelectionTypeChange = (nextType: TestSelectionType) => {
    testSelectionTypeRef.current = nextType
    setTestSelectionType(nextType)

    if (nextType === testSelectionTypes.TAGS) {
      form.setFieldValue('testSuites', [])
    } else {
      form.setFieldValue('tags', [])
    }

    form.validateField('tags', 'change')
    form.validateField('testSuites', 'change')
  }

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      <div className="flex justify-between gap-5 overflow-x-hidden">
        <div className="lg:w-1/2">
          <Card className="mb-4 h-fit">
            <CardHeader>
              <CardTitle>Filter Tests</CardTitle>
              <CardDescription>Select how would you like to filter your tests</CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={testSelectionType}
                onValueChange={value => handleSelectionTypeChange(value as TestSelectionType)}
                className="mb-4 flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value={testSelectionTypes.TAGS} id={testSelectionTypes.TAGS} />
                  <Label htmlFor={testSelectionTypes.TAGS}>By Tags</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value={testSelectionTypes.TEST_SUITES} id={testSelectionTypes.TEST_SUITES} />
                  <Label htmlFor={testSelectionTypes.TEST_SUITES}>By Test Suites</Label>
                </div>
              </RadioGroup>

              <form.Field
                name="tags"
                validators={{
                  onChange: ({ value }) => validateTagSelections(value, testSelectionTypeRef.current),
                }}
              >
                {field => {
                  return (
                    <div
                      className={`mb-4 flex flex-col gap-2 ${testSelectionType === testSelectionTypes.TAGS ? 'block' : 'hidden'}`}
                    >
                      <MultiSelect
                        options={tags.map(tag => ({ label: tag.name, value: tag.id }))}
                        selected={field.state.value}
                        onChange={field.handleChange}
                        placeholder="Select tags"
                        emptyMessage="No tags available"
                        label="Test tags"
                      />
                      <TestRunFieldErrors errors={field.state.meta.errors} isTouched={field.state.meta.isTouched} />
                    </div>
                  )
                }}
              </form.Field>

              <form.Field
                name="testSuites"
                validators={{
                  onChange: ({ value }) => validateTestSuiteSelections(value, testSelectionTypeRef.current),
                }}
              >
                {field => {
                  return (
                    <div
                      className={`mb-4 flex flex-col gap-2 ${testSelectionType === testSelectionTypes.TEST_SUITES ? 'block' : 'hidden'}`}
                    >
                      <TestSuitePicker
                        testSuites={testSuites}
                        selectedSuites={field.state.value}
                        onSave={value => field.handleChange(value)}
                        triggerPlaceholder="Select test suite(s)"
                        dialogTitle="Select Test Suites"
                        dialogDescription="Browse suites, expand child test cases, and save the suite-scoped selection for this test run."
                        selectedLabel="Selected test suite(s)"
                      />
                      <TestRunFieldErrors errors={field.state.meta.errors} isTouched={field.state.meta.isTouched} />
                    </div>
                  )
                }}
              </form.Field>
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Test Configuration</CardTitle>
              <CardDescription>Set the configuration for your test run</CardDescription>
            </CardHeader>
            <CardContent>
              <form.Field
                name="name"
                validators={{
                  onChange: testRunFieldValidators.name,
                  onChangeAsync: async ({ value }) => {
                    if (!value || value.length < 1) return undefined
                    const result = await debouncedNameValidation(value)
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
                      <TestRunFieldErrors errors={field.state.meta.errors} isTouched={field.state.meta.isTouched} />
                    </div>
                  )
                }}
              </form.Field>
              <form.Field
                name="environmentId"
                validators={{
                  onChange: testRunFieldValidators.environmentId,
                }}
              >
                {field => {
                  return (
                    <div className="mb-4 flex flex-col gap-2">
                      <Label htmlFor={field.name}>Environment</Label>
                      <Select value={field.state.value} onValueChange={value => field.handleChange(value)}>
                        <SelectTrigger id={field.name}>
                          <SelectValue placeholder="Select an environment" />
                        </SelectTrigger>
                        <SelectContent isEmpty={environments.length === 0} emptyMessage="No environments available">
                          {environments.map(environment => (
                            <SelectItem key={environment.id} value={environment.id}>
                              {environment.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <TestRunFieldErrors errors={field.state.meta.errors} isTouched={field.state.meta.isTouched} />
                    </div>
                  )
                }}
              </form.Field>

              <form.Field
                name="testWorkersCount"
                validators={{ onChange: testRunFieldValidators.testWorkersCount }}
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
                      <TestRunFieldErrors errors={field.state.meta.errors} isTouched={field.state.meta.isTouched} />
                    </div>
                  )
                }}
              </form.Field>
              <form.Field name="browserEngine" validators={{ onChange: testRunFieldValidators.browserEngine }}>
                {field => {
                  return (
                    <div className="mb-4 flex flex-col gap-2">
                      <Label htmlFor={field.name}>Browser Engine</Label>
                      <Select value={field.state.value} onValueChange={value => field.handleChange(value as BrowserEngine)}>
                        <SelectTrigger id={field.name}>
                          <SelectValue placeholder="Select a browser engine" />
                        </SelectTrigger>
                        <SelectContent>
                          {getBrowserEngineOptions().map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <TestRunFieldErrors errors={field.state.meta.errors} isTouched={field.state.meta.isTouched} />
                    </div>
                  )
                }}
              </form.Field>
            </CardContent>
          </Card>
        </div>
        <div className="lg:w-3/7">
          <Card className="border-gray-700 bg-gray-500/10">
            <CardHeader className="mb-2">
              <CardTitle className="flex items-center gap-2 text-xl text-primary">
                <Info className="h-5 w-5" />
                <span className="font-bold">Quick Tips</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {testRunQuickTips.map((tip, index) => (
                <div key={tip.title} className="flex items-start gap-4">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                    {index + 1}
                  </span>
                  <div className="flex flex-col gap-1">
                    <span className="text-base font-bold">{tip.title}</span>
                    <span className="text-sm text-muted-foreground">{tip.description}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
      <form.Subscribe selector={formState => [formState.canSubmit, formState.isSubmitting]}>
        {([canSubmit, isSubmitting]) => (
          <>
            <Button type="submit" disabled={!canSubmit} className="hover:bg-emerald-500">
              <Play className="h-4 w-4" />
              <span className="font-bold">{isSubmitting ? '...' : 'Start'}</span>
            </Button>
          </>
        )}
      </form.Subscribe>
    </form>
  )
}

export default TestRunForm
