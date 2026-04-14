'use client'
import React, { useCallback, useState } from 'react'

import TestCaseFlow from './test-case-flow'
import type { NodeOrderMap } from '@/types/diagram/diagram'
import {
  type Locator,
  type LocatorGroup,
  type TemplateStep,
  type TemplateStepParameter,
  type TestSuite,
  type Tag,
} from '@prisma/client'
import { Info, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'

import ErrorMessage from '@/components/form/error-message'
import { TestScenarioPreview } from '@/components/test-case/test-scenario-preview'
import {
  buildScenarioPreview,
  buildScenarioSteps,
  getActionErrorMessage,
  getNodesWithMissingMandatoryParams,
  testCaseQuickTips,
  testCaseSubmitSchema,
} from '@/components/test-case/test-case-form-helpers'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MultiSelect } from '@/components/ui/multi-select'
import { Textarea } from '@/components/ui/textarea'
import { testCaseSchema } from '@/constants/form-opts/test-case-form-opts'
import { toast } from '@/hooks/use-toast'
import type { ActionResponse } from '@/types/form/actionHandler'

type TestCaseFormProps = {
  defaultNodesOrder: NodeOrderMap
  templateStepParams: TemplateStepParameter[]
  templateSteps: TemplateStep[]
  locators: Locator[]
  locatorGroups: LocatorGroup[]
  testSuites: TestSuite[]
  tags: Tag[]
  onSubmitAction: (value: z.infer<typeof testCaseSchema>, id?: string) => Promise<ActionResponse>
  id?: string
  defaultTitle?: string
  defaultDescription?: string
  defaultTestSuiteIds?: string[]
  defaultTagIds?: string[]
}

const TestCaseForm = ({
  defaultNodesOrder,
  templateStepParams,
  templateSteps,
  locators,
  locatorGroups,
  testSuites,
  tags,
  id,
  defaultTitle,
  defaultDescription,
  defaultTestSuiteIds,
  defaultTagIds,
  onSubmitAction,
}: TestCaseFormProps) => {
  const router = useRouter()
  const [nodesOrder, setNodesOrder] = useState<NodeOrderMap>(defaultNodesOrder)
  const [title, setTitle] = useState(defaultTitle || '')
  const [description, setDescription] = useState(defaultDescription || '')
  const [selectedTestSuites, setSelectedTestSuites] = useState(defaultTestSuiteIds || [])
  const [selectedTags, setSelectedTags] = useState(defaultTagIds || [])
  const [errors, setErrors] = useState<{
    title?: string[]
    description?: string[]
    testSuiteIds?: string[]
    steps?: string[]
  }>({})

  const scenarioPreview = buildScenarioPreview(title, description, nodesOrder)
  const renderError = (message?: string[]) => <ErrorMessage message={message?.[0] || ''} visible={!!message} />

  const onNodeOrderChange = useCallback((nodesOrder: NodeOrderMap) => {
    setNodesOrder(nodesOrder)
  }, [])

  const onTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value)
  }, [])

  const onDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value)
  }, [])

  const onTestSuiteChange = useCallback((selectedTestSuites: string[]) => {
    setSelectedTestSuites(selectedTestSuites)
  }, [])

  const onTagChange = useCallback((selectedTags: string[]) => {
    setSelectedTags(selectedTags)
  }, [])

  const handleSubmit = useCallback(async () => {
    const nodesWithMissingParams = getNodesWithMissingMandatoryParams(nodesOrder, templateStepParams)

    if (nodesWithMissingParams.length > 0) {
      toast({
        title: 'Validation Error',
        description: `The following nodes have missing mandatory parameters: ${nodesWithMissingParams.join(', ')}. Please fill in all required parameters before saving.`,
        variant: 'destructive',
      })
      return
    }

    const result = testCaseSubmitSchema.safeParse({
      title,
      description,
      testSuiteIds: selectedTestSuites,
      tagIds: selectedTags,
      steps: buildScenarioSteps(nodesOrder),
    })

    if (!result.success) {
      setErrors(result.error.flatten().fieldErrors)
      return
    }
    setErrors({})
    const response = await onSubmitAction(result.data, id)
    if (response.status === 200) {
      toast({
        title: 'Success',
        description: 'Test case saved successfully',
        variant: 'default',
      })
      router.push(`/test-cases`)
    }
    if (response.status === 500) {
      toast({
        title: 'Error',
        description: getActionErrorMessage(response),
        variant: 'destructive',
      })
    }
  }, [description, nodesOrder, selectedTestSuites, selectedTags, title, router, onSubmitAction, id, templateStepParams])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between gap-8" id="meta">
        <div className="w-1/2">
          <Card className="h-full dark:border-gray-700 dark:bg-gray-500/10">
            <CardHeader className="mb-4">
              <CardTitle className="text-xl font-bold text-primary">Test Case Details</CardTitle>
              <CardDescription>Enter the core details of your test scenario</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6 flex flex-col gap-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" value={title} onChange={onTitleChange} />
                {renderError(errors.title)}
              </div>
              <div className="mb-6 flex flex-col gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={description}
                  onChange={onDescriptionChange}
                  className="bg-background"
                />
                {renderError(errors.description)}
              </div>
              <div className="mb-6 flex flex-col gap-2">
                <Label htmlFor="test-suites">Test Suites</Label>
                <MultiSelect
                  options={testSuites.map(testSuite => {
                    return {
                      label: testSuite.name,
                      value: testSuite.id,
                    }
                  })}
                  selected={selectedTestSuites}
                  onChange={onTestSuiteChange}
                />
                {renderError(errors.testSuiteIds)}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="tags">Filter Tags</Label>
                <MultiSelect
                  options={tags.map(tag => {
                    return {
                      label: tag.name,
                      value: tag.id,
                    }
                  })}
                  selected={selectedTags}
                  onChange={onTagChange}
                />
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="w-1/2">
          <Card className="mb-4 border-gray-700 bg-gray-500/10">
            <CardHeader className="mb-2">
              <CardTitle className="flex items-center gap-2 text-xl text-primary">
                <Info className="h-5 w-5" />
                <span className="font-bold">Quick Tips</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {testCaseQuickTips.map((tip, index) => (
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
          <TestScenarioPreview
            title="Test Scenario(Preview)"
            description="Preview of the test scenario in Gherkin syntax"
            scenario={scenarioPreview}
          />
        </div>
      </div>
      <Card className="mb-4 border-gray-700 bg-gray-500/10">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-primary">Test Case Flow</CardTitle>
          <CardDescription>Build your test scenario step by step visually</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[500px] flex-col gap-2">
            <Label htmlFor="test-case-flow">Test Case Flow</Label>
            <TestCaseFlow
              initialNodesOrder={nodesOrder}
              templateStepParams={templateStepParams}
              templateSteps={templateSteps}
              onNodeOrderChange={onNodeOrderChange}
              locators={locators}
              locatorGroups={locatorGroups}
            />
          </div>
        </CardContent>
      </Card>
      {renderError(errors.steps)}
      <div className="mb-4 flex flex-col gap-2">
        <Button onClick={handleSubmit} className="w-fit px-6 hover:bg-emerald-500">
          <Save className="h-4 w-4" />
          <span className="font-bold">Save</span>
        </Button>
      </div>
    </div>
  )
}

export default TestCaseForm
