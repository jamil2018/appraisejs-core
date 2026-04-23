'use client'
import React, { useCallback, useEffect, useState } from 'react'

import {
  getConvertedTemplateTestCaseData,
  getFieldErrorMessage,
  getTemplateSelectionOptions,
  templateSelectionFieldValidator,
  type TemplateTestCaseWithSteps,
} from './create-from-template/create-from-template-helpers'
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
import { ArrowLeft, ArrowRight, Info, Maximize2, Minimize2, Plus, Save } from 'lucide-react'
import { motion } from 'motion/react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { testCaseSchema } from '@/constants/form-opts/test-case-form-opts'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
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
  templateTestCases?: TemplateTestCaseWithSteps[]
  defaultTemplateTestCaseId?: string
}

type TestCaseFormErrors = {
  templateTestCaseId?: string[]
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
  templateTestCases,
  defaultTemplateTestCaseId,
  onSubmitAction,
  onCreateTestSuiteAction,
  onCreateTagAction,
}: TestCaseFormProps) => {
  const router = useRouter()
  const hasTemplateSelectionStep = Array.isArray(templateTestCases)
  const detailsStepIndex = hasTemplateSelectionStep ? 1 : 0
  const flowStepIndex = hasTemplateSelectionStep ? 2 : 1
  const wizardSteps = hasTemplateSelectionStep
    ? ['Template Selection', 'Test Case Details', 'Test Case Flow']
    : ['Test Case Details', 'Test Case Flow']
  const templateOptions = getTemplateSelectionOptions(templateTestCases || [])

  const [nodesOrder, setNodesOrder] = useState<NodeOrderMap>(defaultNodesOrder)
  const [title, setTitle] = useState(defaultTitle || '')
  const [description, setDescription] = useState(defaultDescription || '')
  const [availableTestSuites, setAvailableTestSuites] = useState(testSuites)
  const [availableTags, setAvailableTags] = useState(tags)
  const [selectedTestSuites, setSelectedTestSuites] = useState(defaultTestSuiteIds || [])
  const [selectedTags, setSelectedTags] = useState(defaultTagIds || [])
  const [selectedTemplateId, setSelectedTemplateId] = useState(defaultTemplateTestCaseId || '')
  const [appliedTemplateId, setAppliedTemplateId] = useState(defaultTemplateTestCaseId || '')
  const [currentStep, setCurrentStep] = useState(hasTemplateSelectionStep ? (defaultTemplateTestCaseId ? detailsStepIndex : 0) : 0)
  const [isCreateSuiteDialogOpen, setIsCreateSuiteDialogOpen] = useState(false)
  const [isCreateTagDialogOpen, setIsCreateTagDialogOpen] = useState(false)
  const [isFlowImmersive, setIsFlowImmersive] = useState(false)
  const [errors, setErrors] = useState<TestCaseFormErrors>({})
  const selectedTemplateTestCase =
    templateTestCases?.find(templateTestCase => templateTestCase.id === selectedTemplateId) ?? null
  const selectedTemplateStepCount = selectedTemplateTestCase?.steps.length ?? 0
  const selectedTemplatePreviewSteps =
    selectedTemplateTestCase?.steps
      .slice()
      .sort((left, right) => left.order - right.order)
      .slice(0, 3)
      .map(step => step.label) ?? []
  const stepLineInset = `${50 / wizardSteps.length}%`
  const stepProgressWidth = wizardSteps.length > 1 ? `${(currentStep / (wizardSteps.length - 1)) * 100}%` : '0%'

  const scenarioPreview = buildScenarioPreview(title, description, nodesOrder)
  const renderError = (message?: string[]) => <ErrorMessage message={message?.[0] || ''} visible={Boolean(message?.[0])} />

  const onNodeOrderChange = useCallback((nodesOrder: NodeOrderMap) => {
    setNodesOrder(nodesOrder)
    setErrors(current => ({ ...current, steps: undefined }))
  }, [])

  const onTemplateChange = useCallback((value: string) => {
    setSelectedTemplateId(value)
    setErrors(current => ({ ...current, templateTestCaseId: undefined }))
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
  }, [setIsCreateSuiteDialogOpen])

  const onTagChange = useCallback((selectedTags: string[]) => {
    setSelectedTags(selectedTags)
    setErrors(current => ({ ...current, tagIds: undefined }))
  }, [])

  const handleInlineTagSuccess = useCallback(async (createdTag: Tag) => {
    setAvailableTags(current => (current.some(tag => tag.id === createdTag.id) ? current : [...current, createdTag]))
    setSelectedTags(current => (current.includes(createdTag.id) ? current : [...current, createdTag.id]))
    setIsCreateTagDialogOpen(false)
  }, [setIsCreateTagDialogOpen])

  const goToDetailsStep = useCallback(() => {
    if (!hasTemplateSelectionStep || !templateTestCases) {
      setCurrentStep(detailsStepIndex)
      return
    }

    const validation = templateSelectionFieldValidator.safeParse(selectedTemplateId)

    if (!validation.success) {
      setErrors(current => ({
        ...current,
        templateTestCaseId: validation.error.flatten().formErrors,
      }))
      return
    }

    const templateTestCase = templateTestCases.find(option => option.id === selectedTemplateId)

    if (!templateTestCase) {
      setErrors(current => ({
        ...current,
        templateTestCaseId: ['Template test case not found'],
      }))
      return
    }

    if (selectedTemplateId !== appliedTemplateId) {
      const { convertedData, error } = getConvertedTemplateTestCaseData(templateTestCase)

      if (!convertedData || error) {
        toast({
          title: 'Validation Error',
          description: error || 'Invalid template test case',
          variant: 'destructive',
        })
        return
      }

      setTitle(templateTestCase.name || '')
      setDescription(templateTestCase.description || '')
      setNodesOrder(convertedData.nodesOrder)
      setAppliedTemplateId(selectedTemplateId)
      setErrors(current => ({
        ...current,
        steps: undefined,
      }))
    }

    setErrors(current => ({
      ...current,
      templateTestCaseId: undefined,
    }))
    setCurrentStep(detailsStepIndex)
  }, [appliedTemplateId, detailsStepIndex, hasTemplateSelectionStep, selectedTemplateId, templateTestCases])

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
    setCurrentStep(flowStepIndex)
  }, [description, flowStepIndex, selectedTags, selectedTestSuites, title])

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
        setCurrentStep(detailsStepIndex)
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
  }, [
    description,
    detailsStepIndex,
    nodesOrder,
    selectedTestSuites,
    selectedTags,
    title,
    router,
    onSubmitAction,
    id,
    templateStepParams,
  ])

  useEffect(() => {
    if (!isFlowImmersive) return
    const { body } = document
    const previousOverflow = body.style.overflow
    body.style.overflow = 'hidden'

    return () => {
      body.style.overflow = previousOverflow
    }
  }, [isFlowImmersive])

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-4 px-1 pt-1">
        <div className="relative">
          <div
            className="pointer-events-none absolute z-0 h-px -translate-y-1/2 bg-border"
            style={{
              left: stepLineInset,
              right: stepLineInset,
              top: 'calc(100% - 0.375rem)',
            }}
          />
          <div
            className="pointer-events-none absolute z-0 h-px -translate-y-1/2 overflow-hidden"
            style={{
              left: stepLineInset,
              right: stepLineInset,
              top: 'calc(100% - 0.375rem)',
            }}
          >
            <div className="h-full bg-primary transition-all duration-200" style={{ width: stepProgressWidth }} />
          </div>
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${wizardSteps.length}, minmax(0, 1fr))`,
            }}
          >
            {wizardSteps.map((step, index) => {
              const isActive = currentStep === index
              const isComplete = currentStep > index
              const isFilled = isComplete || (index === 0 && isActive)

              return (
                <button
                  key={step}
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
                    {step}
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

      {hasTemplateSelectionStep && currentStep === 0 ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 xl:flex-row">
            <div className="xl:w-1/2">
              <Card className="h-full dark:border-gray-700 dark:bg-gray-500/10">
                <CardHeader className="mb-4">
                  <CardTitle className="text-xl font-bold text-primary">Template Selection</CardTitle>
                  <CardDescription>Choose the template that should seed the new test case</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="templateTestCaseId">Template Test Case</Label>
                    <Select onValueChange={onTemplateChange} value={selectedTemplateId}>
                      <SelectTrigger id="templateTestCaseId" aria-label="Template Test Case">
                        <SelectValue placeholder="Select a template test case" />
                      </SelectTrigger>
                      <SelectContent isEmpty={templateOptions.length === 0}>
                        {templateOptions.map(templateOption => (
                          <SelectItem key={templateOption.value} value={templateOption.value}>
                            {templateOption.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {renderError(
                      errors.templateTestCaseId?.map(error => getFieldErrorMessage(error)),
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="xl:w-1/2">
              <Card className="h-full border-gray-700 bg-gray-500/10">
                <CardHeader className="mb-2">
                  <CardTitle className="text-xl font-bold text-primary">Selected Template</CardTitle>
                  <CardDescription>Review what will be prefilled before moving into the form</CardDescription>
                </CardHeader>
                <CardContent className="flex h-full flex-col gap-3">
                  <div className="rounded-lg border border-dashed border-border p-4">
                    <div className="text-sm font-semibold text-foreground">
                      {selectedTemplateTestCase?.name || 'No template selected'}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {selectedTemplateTestCase?.description ||
                        'The selected template will prefill the title, description, and test flow for the next steps.'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-dashed border-border p-4">
                    {selectedTemplateTestCase ? (
                      <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                        <div className="flex flex-wrap gap-2">
                          <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground">
                            {selectedTemplateStepCount} {selectedTemplateStepCount === 1 ? 'step' : 'steps'}
                          </span>
                          <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground">
                            {selectedTemplateTestCase.description ? 'Description included' : 'No description'}
                          </span>
                          <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground">
                            Title will be prefilled
                          </span>
                        </div>
                        <p>
                          Continuing will load this template into the details and flow steps so you can edit before
                          saving.
                        </p>
                        {selectedTemplatePreviewSteps.length > 0 ? (
                          <div className="flex flex-col gap-2">
                            <span className="text-xs font-medium uppercase tracking-wide text-foreground/80">
                              Flow Preview
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {selectedTemplatePreviewSteps.map(stepLabel => (
                                <span
                                  key={stepLabel}
                                  className="rounded-full bg-muted px-3 py-1 text-xs text-foreground"
                                >
                                  {stepLabel}
                                </span>
                              ))}
                              {selectedTemplateStepCount > selectedTemplatePreviewSteps.length ? (
                                <span className="rounded-full bg-muted px-3 py-1 text-xs text-foreground">
                                  +{selectedTemplateStepCount - selectedTemplatePreviewSteps.length} more
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Select a template to preview what will be prefilled in the next two steps.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          <div className="mb-4 flex flex-col gap-2">
            <Button onClick={goToDetailsStep} className="w-fit px-6 hover:bg-emerald-500">
              <span className="font-bold">Continue</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : currentStep === detailsStepIndex ? (
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
          <div className="mb-4 flex flex-row flex-wrap items-center justify-start gap-2">
            {hasTemplateSelectionStep ? (
              <Button variant="outline" onClick={() => setCurrentStep(0)} className="w-fit px-6">
                <ArrowLeft className="h-4 w-4" />
                <span className="font-bold">Back</span>
              </Button>
            ) : null}
            <Button onClick={goToFlowStep} className="w-fit px-6 hover:bg-emerald-500">
              <span className="font-bold">Continue</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="w-full min-w-0 overflow-x-hidden">
            <motion.div
              layout
              transition={{ duration: 0.28, ease: 'easeInOut' }}
              className={cn(
                isFlowImmersive &&
                  'fixed inset-0 z-[70] flex min-h-screen w-screen items-stretch bg-background px-4 pb-4 pt-20 sm:px-6',
              )}
            >
              <Card
                className={cn(
                  'flex min-h-0 flex-col border-gray-700 bg-gray-500/10',
                  isFlowImmersive ? 'h-full w-full rounded-xl' : 'h-[max(22rem,calc(100dvh-12rem))]',
                )}
              >
                <CardHeader className="shrink-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-xl font-bold text-primary">Test Case Flow</CardTitle>
                      <CardDescription>Build your test scenario step by step visually</CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => setIsFlowImmersive(current => !current)}
                      aria-label={isFlowImmersive ? 'Exit immersive flow editing' : 'Enter immersive flow editing'}
                    >
                      {isFlowImmersive ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 flex-col">
                  <div className="flex min-h-0 flex-1 flex-col gap-2">
                    <Label className="shrink-0" htmlFor="test-case-flow">
                      Test Case Flow
                    </Label>
                    <div className="min-h-0 flex-1">
                      <TestCaseFlow
                        initialNodesOrder={nodesOrder}
                        templateStepParams={templateStepParams}
                        templateSteps={templateSteps}
                        onNodeOrderChange={onNodeOrderChange}
                        locators={locators}
                        locatorGroups={locatorGroups}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
            {renderError(errors.steps)}
          </div>
          {!isFlowImmersive && (
            <div className="flex flex-col gap-4">
              <TestScenarioPreview
                title="Test Scenario(Preview)"
                description="Preview of the test scenario in Gherkin syntax"
                scenario={scenarioPreview}
              />
              <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={() => setCurrentStep(detailsStepIndex)} className="w-fit px-6">
                  <ArrowLeft className="h-4 w-4" />
                  <span className="font-bold">Back</span>
                </Button>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  className="w-fit px-6 hover:bg-emerald-500"
                  aria-label="Save test case"
                >
                  <Save className="h-4 w-4" aria-hidden />
                  <span className="font-bold">Save</span>
                </Button>
              </div>
            </div>
          )}
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
