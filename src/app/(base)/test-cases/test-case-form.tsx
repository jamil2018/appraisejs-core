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
import { ArrowLeft, ArrowRight, Info, Plus, Save } from 'lucide-react'
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

type TestCaseFormErrors = {
  title?: string[]
  description?: string[]
  testSuiteIds?: string[]
  tagIds?: string[]
  steps?: string[]
}

const detailsStepSchema = testCaseSubmitSchema.omit({ steps: true })

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
  const [currentStep, setCurrentStep] = useState(0)
  const [isCreateSuiteDialogOpen, setIsCreateSuiteDialogOpen] = useState(false)
  const [isCreateTagDialogOpen, setIsCreateTagDialogOpen] = useState(false)
  const [errors, setErrors] = useState<TestCaseFormErrors>({})

  const scenarioPreview = buildScenarioPreview(title, description, nodesOrder)
  const renderError = (message?: string[]) => <ErrorMessage message={message?.[0] || ''} visible={!!message} />

  const onNodeOrderChange = useCallback((nodesOrder: NodeOrderMap) => {
    setNodesOrder(nodesOrder)
    setErrors(current => ({ ...current, steps: undefined }))
  }, [])

  const onTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value)
    setErrors(current => ({ ...current, title: undefined }))
  }, [])

  const onDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value)
    setErrors(current => ({ ...current, description: undefined }))
  }, [])

  const onTestSuiteChange = useCallback((selectedTestSuites: string[]) => {
    setSelectedTestSuites(selectedTestSuites)
    setErrors(current => ({ ...current, testSuiteIds: undefined }))
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
    setErrors(current => ({ ...current, tagIds: undefined }))
  }, [])

  const handleInlineTagSuccess = useCallback(async (createdTag: Tag) => {
    setAvailableTags(current => (current.some(tag => tag.id === createdTag.id) ? current : [...current, createdTag]))
    setSelectedTags(current => (current.includes(createdTag.id) ? current : [...current, createdTag.id]))
    setIsCreateTagDialogOpen(false)
  }, [])

  const goToFlowStep = useCallback(() => {
    const result = detailsStepSchema.safeParse({
      title,
      description,
      testSuiteIds: selectedTestSuites,
      tagIds: selectedTags,
    })

    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors
      setErrors(current => ({
        ...current,
        title: fieldErrors.title,
        description: fieldErrors.description,
        testSuiteIds: fieldErrors.testSuiteIds,
        tagIds: fieldErrors.tagIds,
      }))
      return
    }

    setErrors(current => ({
      ...current,
      title: undefined,
      description: undefined,
      testSuiteIds: undefined,
      tagIds: undefined,
    }))
    setCurrentStep(1)
  }, [description, selectedTags, selectedTestSuites, title])

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
      const fieldErrors = result.error.flatten().fieldErrors
      setErrors(fieldErrors)
      if (fieldErrors.title || fieldErrors.description || fieldErrors.testSuiteIds || fieldErrors.tagIds) {
        setCurrentStep(0)
      }
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
      <div className="mb-4 px-1 pt-1">
        <div className="relative">
          <div className="pointer-events-none absolute left-3 right-3 top-[calc(100%-0.375rem)] z-0 h-px -translate-y-1/2 bg-border md:left-[calc(25%_+_0.375rem)] md:right-[calc(25%_+_0.375rem)]" />
          <div
            className={`pointer-events-none absolute left-3 top-[calc(100%-0.375rem)] z-0 h-px -translate-y-1/2 bg-primary transition-all duration-200 md:left-[calc(25%_+_0.375rem)] ${
              currentStep === 0 ? 'w-0' : 'w-[calc(100%-1.5rem)] md:w-[calc(50%-0.75rem)]'
            }`}
          />
          <div className="grid gap-3 md:grid-cols-2">
            {[
              {
                title: 'Test Case Details',
              },
              {
                title: 'Test Case Flow',
              },
            ].map((step, index) => {
              const isActive = currentStep === index
              const isComplete = currentStep > index
              const isFilled = isComplete || (index === 0 && isActive)

              return (
                <button
                  key={step.title}
                  type="button"
                  className="flex flex-col items-center gap-2 px-2 text-center"
                  onClick={() => {
                    if (index <= currentStep) {
                      setCurrentStep(index)
                    }
                  }}
                  aria-current={isActive ? 'step' : undefined}
                >
                  <span
                    className={`text-xs font-medium transition-colors sm:text-sm ${
                      isActive || isComplete ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    {step.title}
                  </span>
                  <span
                    className={`relative z-10 h-3 w-3 rounded-full border transition-colors ${
                      isFilled
                        ? 'border-primary bg-primary'
                        : isActive
                          ? 'border-primary bg-background'
                          : 'border-border bg-background'
                    }`}
                  />
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {currentStep === 0 ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 xl:flex-row" id="meta">
            <div className="xl:w-1/2">
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
            <div className="xl:w-1/2">
              <Card className="h-full border-gray-700 bg-gray-500/10">
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
            </div>
          </div>
          <div className="mb-4 flex flex-col gap-2">
            <Button onClick={goToFlowStep} className="w-fit px-6 hover:bg-emerald-500">
              <span className="font-bold">Continue</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 xl:flex-row">
            <div className="xl:w-2/3">
              <Card className="border-gray-700 bg-gray-500/10">
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
            </div>
            <div className="xl:w-1/3">
              <TestScenarioPreview
                title="Test Scenario(Preview)"
                description="Preview of the test scenario in Gherkin syntax"
                scenario={scenarioPreview}
              />
            </div>
          </div>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setCurrentStep(0)} className="w-fit px-6">
              <ArrowLeft className="h-4 w-4" />
              <span className="font-bold">Back</span>
            </Button>
            <Button onClick={handleSubmit} className="w-fit px-6 hover:bg-emerald-500">
              <Save className="h-4 w-4" />
              <span className="font-bold">Save</span>
            </Button>
          </div>
        </div>
      )}

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
    </div>
  )
}

export default TestCaseForm
