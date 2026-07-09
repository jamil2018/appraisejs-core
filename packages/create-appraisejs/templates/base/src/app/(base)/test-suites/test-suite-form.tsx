'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import MultiSelectWithPreview from '@/components/ui/multi-select-with-preview'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { testSuiteFormOpts, type TestSuite } from '@/constants/form-opts/test-suite-form-opts'
import { toast } from '@/hooks/use-toast'
import type { TestCasePickerRow } from '@/types/test-case-picker'
import type { Module, Tag, TestSuite as PrismaTestSuite } from '@prisma/client'
import { useForm } from '@tanstack/react-form'
import { TanStackForm } from '@/lib/form/tanstack-form'
import { Info, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'

import TestCasePicker from '@/components/test-case/test-case-picker'

import {
  getActionErrorMessage,
  getCreatedTestSuite,
  getFieldErrorMessage,
  getModuleOptions,
  getTagOptions,
  testSuiteFieldValidators,
  testSuiteQuickTips,
  type TestSuiteFormSubmitAction,
} from './test-suite-helpers'

export const TestSuiteForm = ({
  defaultValues,
  successTitle,
  successMessage,
  id,
  onSubmitAction,
  testCases,
  moduleList,
  tags,
  onSuccess,
  redirectPath = '/test-suites',
}: {
  defaultValues?: TestSuite
  successTitle: string
  successMessage: string
  id?: string
  onSubmitAction: TestSuiteFormSubmitAction
  testCases: TestCasePickerRow[]
  moduleList: Module[]
  tags: Tag[]
  onSuccess?: (suite: PrismaTestSuite) => void | Promise<void>
  redirectPath?: string | null
}) => {
  const { push } = useRouter()
  const form = useForm({
    defaultValues: defaultValues ?? testSuiteFormOpts.defaultValues,
    validators: testSuiteFormOpts.validators,
    onSubmit: async ({ value }) => {
      const res = await onSubmitAction(undefined, value, id)
      if (res.status === 200) {
        if (onSuccess) {
          const createdTestSuite = getCreatedTestSuite(res.data)
          if (!createdTestSuite) {
            toast({
              title: 'Error',
              description: 'Created test suite data was not returned.',
              variant: 'destructive',
            })
            return
          }

          await onSuccess(createdTestSuite)
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
  const moduleOptions = getModuleOptions(moduleList)
  const tagOptions = getTagOptions(tags)
  const renderError = (error: unknown) => (
    <p key={getFieldErrorMessage(error)} className="text-xs text-pink-500">
      {getFieldErrorMessage(error)}
    </p>
  )
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <Card className="min-w-0 border-white/[0.1] bg-[rgba(18,37,64,0.32)]">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-primary">Test Suite Details</CardTitle>
          <CardDescription>Enter the details for your test suite</CardDescription>
        </CardHeader>
        <CardContent>
          <TanStackForm onSubmit={() => form.handleSubmit()}>
            <form.Field
              name="name"
              validators={{
                onChange: testSuiteFieldValidators.name,
              }}
            >
              {field => {
                return (
                  <div className="mb-6 flex flex-col gap-2">
                    <Label htmlFor={field.name} className="font-bold">
                      Name
                    </Label>
                    <Input
                      className="w-full"
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onChange={e => field.handleChange(e.target.value)}
                      placeholder="Enter name for your test suite"
                    />
                    {field.state.meta.errors.map(renderError)}
                  </div>
                )
              }}
            </form.Field>
            <form.Field name="description">
              {field => {
                return (
                  <div className="mb-6 flex flex-col gap-2">
                    <Label htmlFor={field.name} className="font-bold">
                      Description
                    </Label>
                    <Textarea
                      className="h-24 w-full bg-background"
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onChange={e => field.handleChange(e.target.value)}
                      placeholder="Enter description for your test suite"
                    />
                    {field.state.meta.errors.map(renderError)}
                  </div>
                )
              }}
            </form.Field>
            <form.Field name="testCases">
              {field => {
                return (
                  <div className="mb-6 flex flex-col gap-2">
                    <Label htmlFor={field.name} className="font-bold">
                      Test Cases
                    </Label>
                    <TestCasePicker
                      testCases={testCases}
                      selectedIds={field.state.value ?? []}
                      onSave={value => field.handleChange(value)}
                      triggerPlaceholder="Select test case(s)"
                      dialogTitle="Select Test Cases"
                      dialogDescription="Search and select the test cases to include in this suite."
                      selectedLabel="Selected test case(s)"
                    />
                    {field.state.meta.errors.map(renderError)}
                  </div>
                )
              }}
            </form.Field>
            <form.Field name="moduleId">
              {field => {
                return (
                  <div className="mb-6 flex flex-col gap-2">
                    <Label htmlFor={field.name} className="font-bold">
                      Module
                    </Label>
                    <Select value={field.state.value} onValueChange={value => field.handleChange(value)}>
                      <SelectTrigger id={field.name} className="w-full bg-background">
                        <SelectValue placeholder="Select a module" />
                      </SelectTrigger>
                      <SelectContent className="w-full" isEmpty={moduleOptions.length === 0}>
                        {moduleOptions.map(moduleOption => (
                          <SelectItem key={moduleOption.value} value={moduleOption.value}>
                            {moduleOption.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {field.state.meta.errors.map(renderError)}
                  </div>
                )
              }}
            </form.Field>
            <form.Field name="tagIds">
              {field => {
                return (
                  <div className="mb-6 flex flex-col gap-2">
                    <Label htmlFor={field.name} className="font-bold">
                      Tags
                    </Label>
                    <MultiSelectWithPreview
                      id={field.name}
                      options={tagOptions}
                      onSelectChange={value => {
                        field.handleChange(value)
                      }}
                      defaultSelectedValues={field.state.value || []}
                      placeholder="Select tag(s)"
                      emptyMessage="No tag(s) found"
                      selectedLabel="Selected tag(s)"
                      searchPlaceholder="Search tags..."
                    />
                  </div>
                )
              }}
            </form.Field>
            <form.Subscribe selector={formState => [formState.canSubmit, formState.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <Button type="submit" disabled={!canSubmit} className="hover:bg-emerald-500">
                  <Save className="size-4" />
                  <span className="font-bold">{isSubmitting ? '...' : 'Save'}</span>
                </Button>
              )}
            </form.Subscribe>
          </TanStackForm>
        </CardContent>
      </Card>
      <aside className="xl:sticky xl:top-5">
        <Card className="border-white/[0.1] bg-[rgba(18,37,64,0.24)]">
          <CardHeader className="mb-2">
            <CardTitle className="flex items-center gap-2 text-xl text-primary">
              <Info className="size-5" />
              <span className="font-bold">Quick Tips</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {testSuiteQuickTips.map((tip, index) => (
              <div key={tip.title} className="flex items-start gap-4">
                <span className="flex size-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
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
      </aside>
    </div>
  )
}
