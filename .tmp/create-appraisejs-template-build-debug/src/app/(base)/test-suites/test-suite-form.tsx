'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import MultiSelectWithPreview from '@/components/ui/multi-select-with-preview'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formOpts, TestSuite } from '@/constants/form-opts/test-suite-form-opts'
import { toast } from '@/hooks/use-toast'
import { ActionResponse } from '@/types/form/actionHandler'
import { Module, TestCase, Tag } from '@prisma/client'
import { useForm } from '@tanstack/react-form'
import { Info, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'

export const TestSuiteForm = ({
  defaultValues,
  successTitle,
  successMessage,
  id,
  onSubmitAction,
  testCases,
  moduleList,
  tags,
}: {
  defaultValues?: TestSuite
  successTitle: string
  successMessage: string
  id?: string
  onSubmitAction: (_prev: unknown, value: TestSuite, id?: string) => Promise<ActionResponse>
  testCases: TestCase[]
  moduleList: Module[]
  tags: Tag[]
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
        router.push('/test-suites')
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
    <div className="flex justify-between gap-20 overflow-x-hidden">
      <Card className="w-2/3 border-gray-700 bg-gray-500/10">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-primary">Test Suite Details</CardTitle>
          <CardDescription>Enter the details for your test suite</CardDescription>
        </CardHeader>
        <CardContent>
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
                onChange: z.string().min(3, { message: 'Name must be at least 3 characters' }),
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
                    {field.state.meta.errors.map((error, index) => (
                      <p key={index} className="text-xs text-pink-500">
                        {typeof error === 'string' ? error : error?.message || String(error)}
                      </p>
                    ))}
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
                    {field.state.meta.errors.map((error, index) => (
                      <p key={index} className="text-xs text-pink-500">
                        {typeof error === 'string' ? error : error?.message || String(error)}
                      </p>
                    ))}
                  </div>
                )
              }}
            </form.Field>
            <form.Field name="testCases">
              {field => {
                const testCasesOptions = testCases.map(testCase => ({
                  value: testCase.id,
                  label: testCase.title,
                }))
                return (
                  <div className="mb-6 flex flex-col gap-2">
                    <Label htmlFor={field.name} className="font-bold">
                      Test Cases
                    </Label>
                    <MultiSelectWithPreview
                      id={field.name}
                      className="w-full"
                      options={testCasesOptions}
                      onSelectChange={value => {
                        field.handleChange(value)
                      }}
                      defaultSelectedValues={field.state.value}
                      placeholder="Select test case(s)"
                      emptyMessage="No test case(s) found"
                      selectedLabel="Selected test case(s)"
                      searchPlaceholder="Search test cases..."
                    />
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
                      <SelectTrigger className="w-full bg-background">
                        <SelectValue placeholder="Select a module" />
                      </SelectTrigger>
                      <SelectContent className="w-full" isEmpty={moduleList.length === 0}>
                        {moduleList.map(module => (
                          <SelectItem key={module.id} value={module.id}>
                            {module.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )
              }}
            </form.Field>
            <form.Field name="tagIds">
              {field => {
                const tagsOptions = tags.map(tag => ({
                  value: tag.id,
                  label: tag.name,
                }))
                return (
                  <div className="mb-6 flex flex-col gap-2">
                    <Label htmlFor={field.name} className="font-bold">
                      Tags
                    </Label>
                    <MultiSelectWithPreview
                      id={field.name}
                      options={tagsOptions}
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
                  <Save className="h-4 w-4" />
                  <span className="font-bold">{isSubmitting ? '...' : 'Save'}</span>
                </Button>
              )}
            </form.Subscribe>
          </form>
        </CardContent>
      </Card>
      <div className="lg:w-1/3">
        <Card className="border-gray-700 bg-gray-500/10">
          <CardHeader className="mb-2">
            <CardTitle className="flex items-center gap-2 text-xl text-primary">
              <Info className="h-5 w-5" />
              <span className="font-bold">Quick Tips</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="flex items-start gap-4">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                1
              </span>
              <div className="flex flex-col gap-1">
                <span className="text-base font-bold">Choose a descriptive name</span>
                <span className="text-sm text-muted-foreground">
                  Use clear, specific names that indicate the purpose
                </span>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                2
              </span>
              <div className="flex flex-col gap-1">
                <span className="text-base font-bold">Group related tests</span>
                <span className="text-sm text-muted-foreground">
                  Organize tests that validate the same feature together
                </span>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                3
              </span>
              <div className="flex flex-col gap-1">
                <span className="text-base font-bold">Use meaningful tags</span>
                <span className="text-sm text-muted-foreground">Tags help filter and categorize effectively</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
