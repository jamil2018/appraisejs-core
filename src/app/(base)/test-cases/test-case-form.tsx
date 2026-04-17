'use client'
import React, { useCallback, useState } from 'react'

import { InlineTagCreationDialog } from './inline-tag-creation-dialog'
import { InlineTestSuiteCreationDialog } from './inline-test-suite-creation-dialog'
import TestCaseFlow from './test-case-flow'
import type { TagFormSubmitAction } from '@/app/(base)/tags/tag-form-helpers'
import type { TestSuiteFormSubmitAction } from '@/app/(base)/test-suites/test-suite-helpers'
import type { NodeOrderMap } from '@/types/diagram/diagram'
import type { TestCasePickerRow } from '@/types/test-case-picker'
import {
  type Locator,
  type LocatorGroup,
  type Module,
  type TemplateStep,
  type TemplateStepParameter,
  type TestSuite,
  type Tag,
} from '@prisma/client'
import { Info, Plus, Save } from 'lucide-react'
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
  testCases: TestCasePickerRow[]
  moduleList: Module[]
  tags: Tag[]
  onSubmitAction: (value: z.infer<typeof testCaseSchema>, id?: string) => Promise<ActionResponse>
  onCreateTestSuiteAction: TestSuiteFormSubmitAction
  onCreateTagAction: TagFormSubmitAction
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
  testCases,
  moduleList,
  tags,
  id,
  defaultTitle,
  defaultDescription,
  defaultTestSuiteIds,
  defaultTagIds,
  onSubmitAction,
  onCreateTestSuiteAction,
  onCreateTagAction,
}: TestCaseFormProps) => {
  const router = useRouter()
  const [nodesOrder, setNodesOrder] = useState<NodeOrderMap>(defaultNodesOrder)
  const [title, setTitle] = useState(defaultTitle || '')
  const [description, setDescription] = useState(defaultDescription || '')
  const [availableTestSuites, setAvailableTestSuites] = useState(testSuites)
  const [availableTags, setAvailableTags] = useState(tags)
  const [selectedTestSuites, setSelectedTestSuites] = useState(defaultTestSuiteIds || [])
  const [selectedTags, setSelectedTags] = useState(defaultTagIds || [])
  const [isCreateSuiteDialogOpen, setIsCreateSuiteDialogOpen] = useState(false)
  const [isCreateTagDialogOpen, setIsCreateTagDialogOpen] = useState(false)
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

  const handleInlineTestSuiteSuccess = useCallback(async (createdTestSuite: TestSuite) => {
    setAvailableTestSuites(current =>
      current.some(testSuite => testSuite.id === createdTestSuite.id) ? current : [...current, createdTestSuite],
    )
    setSelectedTestSuites(current =>
      current.includes(createdTestSuite.id) ? current : [...current, createdTestSuite.id],
    )
    setIsCreateSuiteDialogOpen(false)
  }, [])

  const onTagChange = useCallback((selectedTags: string[]) => {
    setSelectedTags(selectedTags)
  }, [])

  const handleInlineTagSuccess = useCallback(async (createdTag: Tag) => {
    setAvailableTags(current => (current.some(tag => tag.id === createdTag.id) ? current : [...current, createdTag]))
    setSelectedTags(current => (current.includes(createdTag.id) ? current : [...current, createdTag.id]))
    setIsCreateTagDialogOpen(false)
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
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <MultiSelect
                      options={availableTestSuites.map(testSuite => {
                        return {
                          label: testSuite.name,
                          value: testSuite.id,
                        }
                      })}
                      selected={selectedTestSuites}
                      onChange={onTestSuiteChange}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    aria-label="Create test suite"
                    onClick={() => setIsCreateSuiteDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {renderError(errors.testSuiteIds)}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="tags">Filter Tags</Label>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <MultiSelect
                      options={availableTags.map(tag => {
                        return {
                          label: tag.name,
                          value: tag.id,
                        }
                      })}
                      selected={selectedTags}
                      onChange={onTagChange}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    aria-label="Create filter tag"
                    onClick={() => setIsCreateTagDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
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
      <InlineTestSuiteCreationDialog
        open={isCreateSuiteDialogOpen}
        onOpenChange={setIsCreateSuiteDialogOpen}
        onSubmitAction={onCreateTestSuiteAction}
        onSuccess={handleInlineTestSuiteSuccess}
        testCases={testCases}
        moduleList={moduleList}
        tags={availableTags}
      />
      <InlineTagCreationDialog
        open={isCreateTagDialogOpen}
        onOpenChange={setIsCreateTagDialogOpen}
        onSubmitAction={onCreateTagAction}
        onSuccess={handleInlineTagSuccess}
      />
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
