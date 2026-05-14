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
import type { FlowBlock, NodeOrderMap } from '@/types/diagram/diagram'
import type { TestCasePickerRow } from '@/types/test-case-picker'
import {
  type Locator,
  type LocatorGroup,
  type Environment,
  type Module,
  type TemplateStep,
  type TemplateStepParameter,
  type TestSuite,
  type Tag,
} from '@prisma/client'
import { ArrowLeft, ArrowRight, Info, Maximize2, Minimize2, Plus, Save } from 'lucide-react'
import { LayoutGroup, motion } from 'motion/react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'

import ErrorMessage from '@/components/form/error-message'
import { TestScenarioPreview } from '@/components/test-case/test-scenario-preview'
import {
  buildScenarioPreview,
  buildScenarioSteps,
  getNodesWithMissingMandatoryParams,
  handleTestCaseSaveResponse,
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
  locators: Array<Pick<Locator, 'id' | 'name' | 'locatorGroupId'>>
  locatorGroups: Array<Pick<LocatorGroup, 'id' | 'name' | 'route' | 'moduleId'>>
  environments: Array<Pick<Environment, 'id' | 'name'>>
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
  defaultFlowBlocks?: FlowBlock[]
}

const EMPTY_FLOW_BLOCKS: FlowBlock[] = []

type TestCaseFormErrors = {
  templateTestCaseId?: string[]
  title?: string[]
  description?: string[]
  testSuiteIds?: string[]
  tagIds?: string[]
  steps?: string[]
}

const detailsStepSchema = testCaseSubmitSchema.omit({ steps: true })

type TemplateSelectionResolution =
  | { status: 'skip' }
  | { status: 'invalid'; errors: string[] }
  | { status: 'not-found' }
  | { status: 'unchanged' }
  | {
      status: 'converted'
      templateTestCase: TemplateTestCaseWithSteps
      convertedData: NonNullable<ReturnType<typeof getConvertedTemplateTestCaseData>['convertedData']>
    }
  | { status: 'conversion-error'; error?: string }

function resolveTemplateSelection({
  hasTemplateSelectionStep,
  templateTestCases,
  selectedTemplateId,
  appliedTemplateId,
}: {
  hasTemplateSelectionStep: boolean
  templateTestCases?: TemplateTestCaseWithSteps[]
  selectedTemplateId: string
  appliedTemplateId: string
}): TemplateSelectionResolution {
  if (!hasTemplateSelectionStep || !templateTestCases) {
    return { status: 'skip' }
  }

  const validation = templateSelectionFieldValidator.safeParse(selectedTemplateId)

  if (!validation.success) {
    return { status: 'invalid', errors: validation.error.flatten().formErrors }
  }

  const templateTestCase = templateTestCases.find(option => option.id === selectedTemplateId)

  if (!templateTestCase) {
    return { status: 'not-found' }
  }

  if (selectedTemplateId === appliedTemplateId) {
    return { status: 'unchanged' }
  }

  const { convertedData, error } = getConvertedTemplateTestCaseData(templateTestCase)

  if (!convertedData || error) {
    return { status: 'conversion-error', error: error ?? undefined }
  }

  return { status: 'converted', templateTestCase, convertedData }
}

function isDetailFieldError(fieldErrors: TestCaseFormErrors): boolean {
  return Boolean(fieldErrors.title || fieldErrors.description || fieldErrors.testSuiteIds || fieldErrors.tagIds)
}

function getWizardSteps(hasTemplateSelectionStep: boolean): string[] {
  return hasTemplateSelectionStep
    ? ['Template Selection', 'Test Case Details', 'Test Case Flow']
    : ['Test Case Details', 'Test Case Flow']
}

function getWizardStepIndexes(hasTemplateSelectionStep: boolean): {
  detailsStepIndex: number
  flowStepIndex: number
} {
  return {
    detailsStepIndex: hasTemplateSelectionStep ? 1 : 0,
    flowStepIndex: hasTemplateSelectionStep ? 2 : 1,
  }
}

function getInitialWizardStep(
  hasTemplateSelectionStep: boolean,
  defaultTemplateTestCaseId: string | undefined,
  detailsStepIndex: number,
): number {
  if (!hasTemplateSelectionStep) {
    return 0
  }

  return defaultTemplateTestCaseId ? detailsStepIndex : 0
}

function appendUniqueById<T extends { id: string }>(items: T[], item: T): T[] {
  return items.some(currentItem => currentItem.id === item.id) ? items : [...items, item]
}

function appendUniqueId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id]
}

function buildTemplatePreviewSteps(templateTestCase: TemplateTestCaseWithSteps | null): string[] {
  return (
    templateTestCase?.steps
      .slice()
      .sort((left, right) => left.order - right.order)
      .slice(0, 3)
      .map(step => step.label) ?? []
  )
}

function getTemplateStepCount(templateTestCase: TemplateTestCaseWithSteps | null): number {
  return templateTestCase?.steps.length ?? 0
}

function renderFormError(message?: string[]) {
  return <ErrorMessage message={message?.[0] || ''} visible={Boolean(message?.[0])} />
}

type WizardProgressProps = {
  steps: string[]
  currentStep: number
  onStepClick: (stepIndex: number) => void
}

function WizardProgress({ steps, currentStep, onStepClick }: WizardProgressProps) {
  const stepLineInset = `${50 / steps.length}%`
  const stepProgressWidth = steps.length > 1 ? `${(currentStep / (steps.length - 1)) * 100}%` : '0%'

  return (
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
            gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
          }}
        >
          {steps.map((step, index) => {
            const isActive = currentStep === index
            const isComplete = currentStep > index
            const isFilled = isComplete || (index === 0 && isActive)

            return (
              <button
                key={step}
                type="button"
                className="flex flex-col items-center gap-2 px-2 text-center"
                onClick={() => onStepClick(index)}
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
                  className={`relative z-10 size-3 rounded-full border transition-colors ${
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
  )
}

type FlowPanelProps = {
  className: string
  nodesOrder: NodeOrderMap
  templateStepParams: TemplateStepParameter[]
  templateSteps: TemplateStep[]
  locators: Array<Pick<Locator, 'id' | 'name' | 'locatorGroupId'>>
  locatorGroups: Array<Pick<LocatorGroup, 'id' | 'name' | 'route' | 'moduleId'>>
  environments: Array<Pick<Environment, 'id' | 'name'>>
  moduleList: Module[]
  flowBlocks: FlowBlock[]
  isFlowImmersive: boolean
  onNodeOrderChange: (nodesOrder: NodeOrderMap) => void
  onFlowBlocksChange: (flowBlocks: FlowBlock[]) => void
  onToggleImmersive: () => void
}

function FlowPanel({
  className,
  nodesOrder,
  templateStepParams,
  templateSteps,
  locators,
  locatorGroups,
  environments,
  moduleList,
  flowBlocks,
  isFlowImmersive,
  onNodeOrderChange,
  onFlowBlocksChange,
  onToggleImmersive,
}: FlowPanelProps) {
  return (
    <motion.div
      layout
      layoutId="test-case-flow-panel"
      className={cn(
        'flex min-h-0 w-full flex-col overflow-hidden rounded-xl border border-zinc-700 text-card-foreground shadow-sm will-change-transform',
        className,
      )}
      transition={{ layout: { duration: 0.3, ease: 'easeInOut' } }}
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
            className="size-9 shrink-0"
            onClick={onToggleImmersive}
            aria-label={isFlowImmersive ? 'Exit immersive flow editing' : 'Enter immersive flow editing'}
          >
            {isFlowImmersive ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="min-h-0 flex-1">
            <TestCaseFlow
              initialNodesOrder={nodesOrder}
              templateStepParams={templateStepParams}
              templateSteps={templateSteps}
              onNodeOrderChange={onNodeOrderChange}
              locators={locators}
              locatorGroups={locatorGroups}
              environments={environments}
              modules={moduleList}
              flowBlocks={flowBlocks}
              layoutRefreshKey={isFlowImmersive}
              onFlowBlocksChange={onFlowBlocksChange}
            />
          </div>
        </div>
      </CardContent>
    </motion.div>
  )
}

type RenderError = (message?: string[]) => React.ReactNode

type TemplateSelectionStepProps = {
  templateOptions: ReturnType<typeof getTemplateSelectionOptions>
  selectedTemplateId: string
  selectedTemplateTestCase: TemplateTestCaseWithSteps | null
  selectedTemplateStepCount: number
  selectedTemplatePreviewSteps: string[]
  errors: TestCaseFormErrors
  renderError: RenderError
  onTemplateChange: (value: string) => void
  onContinue: () => void
}

function TemplateSelectionStep({
  templateOptions,
  selectedTemplateId,
  selectedTemplateTestCase,
  selectedTemplateStepCount,
  selectedTemplatePreviewSteps,
  errors,
  renderError,
  onTemplateChange,
  onContinue,
}: TemplateSelectionStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="xl:w-1/2">
          <Card className="h-full dark:border-zinc-700 dark:bg-zinc-500/10">
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
                {renderError(errors.templateTestCaseId?.map(error => getFieldErrorMessage(error)))}
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="xl:w-1/2">
          <Card className="h-full border-zinc-700 bg-zinc-500/10">
            <CardHeader className="mb-2">
              <CardTitle className="text-xl font-bold text-primary">Selected Template</CardTitle>
              <CardDescription>Review what will be prefilled before moving into the form</CardDescription>
            </CardHeader>
            <CardContent className="flex h-full flex-col gap-3">
              <SelectedTemplateSummary
                selectedTemplateTestCase={selectedTemplateTestCase}
                selectedTemplateStepCount={selectedTemplateStepCount}
                selectedTemplatePreviewSteps={selectedTemplatePreviewSteps}
              />
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="mb-4 flex flex-col gap-2">
        <Button onClick={onContinue} className="w-fit px-6 hover:bg-emerald-500">
          <span className="font-bold">Continue</span>
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

type SelectedTemplateSummaryProps = {
  selectedTemplateTestCase: TemplateTestCaseWithSteps | null
  selectedTemplateStepCount: number
  selectedTemplatePreviewSteps: string[]
}

function SelectedTemplateSummary({
  selectedTemplateTestCase,
  selectedTemplateStepCount,
  selectedTemplatePreviewSteps,
}: SelectedTemplateSummaryProps) {
  const hasOverflowPreviewSteps = selectedTemplateStepCount > selectedTemplatePreviewSteps.length

  return (
    <>
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
          <SelectedTemplateDetails
            hasDescription={Boolean(selectedTemplateTestCase.description)}
            hasOverflowPreviewSteps={hasOverflowPreviewSteps}
            selectedTemplateStepCount={selectedTemplateStepCount}
            selectedTemplatePreviewSteps={selectedTemplatePreviewSteps}
          />
        ) : (
          <NoSelectedTemplateMessage />
        )}
      </div>
    </>
  )
}

type SelectedTemplateDetailsProps = {
  hasDescription: boolean
  hasOverflowPreviewSteps: boolean
  selectedTemplateStepCount: number
  selectedTemplatePreviewSteps: string[]
}

function SelectedTemplateDetails({
  hasDescription,
  hasOverflowPreviewSteps,
  selectedTemplateStepCount,
  selectedTemplatePreviewSteps,
}: SelectedTemplateDetailsProps) {
  return (
    <div className="flex flex-col gap-3 text-sm text-muted-foreground">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground">
          {selectedTemplateStepCount} {selectedTemplateStepCount === 1 ? 'step' : 'steps'}
        </span>
        <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground">
          {hasDescription ? 'Description included' : 'No description'}
        </span>
        <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground">
          Title will be prefilled
        </span>
      </div>
      <p>Continuing will load this template into the details and flow steps so you can edit before saving.</p>
      <TemplatePreviewSteps
        hasOverflowPreviewSteps={hasOverflowPreviewSteps}
        selectedTemplateStepCount={selectedTemplateStepCount}
        selectedTemplatePreviewSteps={selectedTemplatePreviewSteps}
      />
    </div>
  )
}

type TemplatePreviewStepsProps = {
  hasOverflowPreviewSteps: boolean
  selectedTemplateStepCount: number
  selectedTemplatePreviewSteps: string[]
}

function TemplatePreviewSteps({
  hasOverflowPreviewSteps,
  selectedTemplateStepCount,
  selectedTemplatePreviewSteps,
}: TemplatePreviewStepsProps) {
  if (selectedTemplatePreviewSteps.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-foreground/80 text-xs font-medium uppercase tracking-wide">Flow Preview</span>
      <div className="flex flex-wrap gap-2">
        {selectedTemplatePreviewSteps.map(stepLabel => (
          <span key={stepLabel} className="rounded-full bg-muted px-3 py-1 text-xs text-foreground">
            {stepLabel}
          </span>
        ))}
        {hasOverflowPreviewSteps ? (
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-foreground">
            +{selectedTemplateStepCount - selectedTemplatePreviewSteps.length} more
          </span>
        ) : null}
      </div>
    </div>
  )
}

function NoSelectedTemplateMessage() {
  return (
    <p className="text-sm text-muted-foreground">
      Select a template to preview what will be prefilled in the next two steps.
    </p>
  )
}

type DetailsStepProps = {
  hasTemplateSelectionStep: boolean
  title: string
  description: string
  availableTestSuites: TestSuite[]
  availableTags: Tag[]
  selectedTestSuites: string[]
  selectedTags: string[]
  errors: TestCaseFormErrors
  renderError: RenderError
  onTitleChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onDescriptionChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void
  onTestSuiteChange: (selectedTestSuites: string[]) => void
  onTagChange: (selectedTags: string[]) => void
  onBack: () => void
  onContinue: () => void
  onCreateSuiteClick: () => void
  onCreateTagClick: () => void
}

function DetailsStep({
  hasTemplateSelectionStep,
  title,
  description,
  availableTestSuites,
  availableTags,
  selectedTestSuites,
  selectedTags,
  errors,
  renderError,
  onTitleChange,
  onDescriptionChange,
  onTestSuiteChange,
  onTagChange,
  onBack,
  onContinue,
  onCreateSuiteClick,
  onCreateTagClick,
}: DetailsStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 xl:flex-row" id="meta">
        <div className="xl:w-1/2">
          <Card className="h-full dark:border-zinc-700 dark:bg-zinc-500/10">
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
              <TestSuiteSelectionField
                availableTestSuites={availableTestSuites}
                selectedTestSuites={selectedTestSuites}
                errorMessage={errors.testSuiteIds}
                renderError={renderError}
                onChange={onTestSuiteChange}
                onCreateClick={onCreateSuiteClick}
              />
              <TagSelectionField
                availableTags={availableTags}
                selectedTags={selectedTags}
                onChange={onTagChange}
                onCreateClick={onCreateTagClick}
              />
            </CardContent>
          </Card>
        </div>
        <QuickTipsPanel />
      </div>
      <div className="mb-4 flex flex-row flex-wrap items-center justify-start gap-2">
        {hasTemplateSelectionStep ? (
          <Button variant="outline" onClick={onBack} className="w-fit px-6">
            <ArrowLeft className="size-4" />
            <span className="font-bold">Back</span>
          </Button>
        ) : null}
        <Button onClick={onContinue} className="w-fit px-6 hover:bg-emerald-500">
          <span className="font-bold">Continue</span>
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

type TestSuiteSelectionFieldProps = {
  availableTestSuites: TestSuite[]
  selectedTestSuites: string[]
  errorMessage?: string[]
  renderError: RenderError
  onChange: (selectedTestSuites: string[]) => void
  onCreateClick: () => void
}

function TestSuiteSelectionField({
  availableTestSuites,
  selectedTestSuites,
  errorMessage,
  renderError,
  onChange,
  onCreateClick,
}: TestSuiteSelectionFieldProps) {
  return (
    <div className="mb-6 flex flex-col gap-2">
      <Label htmlFor="test-suites">Test Suites</Label>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <MultiSelect
            options={availableTestSuites.map(testSuite => ({
              label: testSuite.name,
              value: testSuite.id,
            }))}
            selected={selectedTestSuites}
            onChange={onChange}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10 shrink-0"
          aria-label="Create test suite"
          onClick={onCreateClick}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      {renderError(errorMessage)}
    </div>
  )
}

type TagSelectionFieldProps = {
  availableTags: Tag[]
  selectedTags: string[]
  onChange: (selectedTags: string[]) => void
  onCreateClick: () => void
}

function TagSelectionField({ availableTags, selectedTags, onChange, onCreateClick }: TagSelectionFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="tags">Filter Tags</Label>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <MultiSelect
            options={availableTags.map(tag => ({
              label: tag.name,
              value: tag.id,
            }))}
            selected={selectedTags}
            onChange={onChange}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10 shrink-0"
          aria-label="Create filter tag"
          onClick={onCreateClick}
        >
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  )
}

function QuickTipsPanel() {
  return (
    <div className="xl:w-1/2">
      <Card className="h-full border-zinc-700 bg-zinc-500/10">
        <CardHeader className="mb-2">
          <CardTitle className="flex items-center gap-2 text-xl text-primary">
            <Info className="size-5" />
            <span className="font-bold">Quick Tips</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ol className="flex list-none flex-col gap-3">
            {testCaseQuickTips.map((tip, index) => (
              <li key={tip.title} className="grid grid-cols-[1.5rem_1fr] gap-4">
                <span className="flex size-6 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                  {index + 1}
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-base font-bold">{tip.title}</span>
                  <span className="text-sm text-muted-foreground">{tip.description}</span>
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}

type FlowStepProps = {
  isFlowImmersive: boolean
  scenarioPreview: string
  errors: TestCaseFormErrors
  renderError: RenderError
  renderFlowPanel: (className: string) => React.ReactNode
  onBack: () => void
  onSubmit: () => void
}

function FlowStep({
  isFlowImmersive,
  scenarioPreview,
  errors,
  renderError,
  renderFlowPanel,
  onBack,
  onSubmit,
}: FlowStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <LayoutGroup id="test-case-flow-panel-layout">
        <div className="w-full min-w-0 overflow-x-hidden">
          {isFlowImmersive ? (
            <div className="fixed inset-0 z-40 bg-background p-3 sm:p-4">{renderFlowPanel('h-full bg-background')}</div>
          ) : (
            renderFlowPanel('relative h-[max(22rem,calc(100dvh-12rem))] bg-zinc-500/10')
          )}
          {renderError(errors.steps)}
        </div>
      </LayoutGroup>
      {!isFlowImmersive && (
        <div className="flex flex-col gap-4">
          <TestScenarioPreview
            title="Test Scenario(Preview)"
            description="Preview of the test scenario in Gherkin syntax"
            scenario={scenarioPreview}
          />
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={onBack} className="w-fit px-6">
              <ArrowLeft className="size-4" />
              <span className="font-bold">Back</span>
            </Button>
            <Button
              type="button"
              onClick={onSubmit}
              className="w-fit px-6 hover:bg-emerald-500"
              aria-label="Save test case"
            >
              <Save className="size-4" aria-hidden />
              <span className="font-bold">Save</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

type WizardStepContentProps = {
  details: {
    availableTags: Tag[]
    availableTestSuites: TestSuite[]
    description: string
    selectedTags: string[]
    selectedTestSuites: string[]
    title: string
  }
  flow: {
    isFlowImmersive: boolean
    renderFlowPanel: (className: string) => React.ReactNode
    scenarioPreview: string
  }
  navigation: {
    currentStep: number
    detailsStepIndex: number
    hasTemplateSelectionStep: boolean
  }
  template: {
    options: ReturnType<typeof getTemplateSelectionOptions>
    previewSteps: string[]
    selectedId: string
    selectedTestCase: TemplateTestCaseWithSteps | null
    stepCount: number
  }
  actions: {
    goToDetailsStep: () => void
    goToFlowStep: () => void
    handleSubmit: () => void
    onDescriptionChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void
    onTagChange: (selectedTags: string[]) => void
    onTemplateChange: (value: string) => void
    onTestSuiteChange: (selectedTestSuites: string[]) => void
    onTitleChange: (event: React.ChangeEvent<HTMLInputElement>) => void
    setCurrentStep: React.Dispatch<React.SetStateAction<number>>
    setIsCreateSuiteDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
    setIsCreateTagDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  }
  errors: TestCaseFormErrors
  renderError: RenderError
}

function WizardStepContent({
  actions,
  details,
  errors,
  flow,
  navigation,
  renderError,
  template,
}: WizardStepContentProps) {
  const { currentStep, detailsStepIndex, hasTemplateSelectionStep } = navigation

  if (hasTemplateSelectionStep && currentStep === 0) {
    return (
      <TemplateSelectionStep
        templateOptions={template.options}
        selectedTemplateId={template.selectedId}
        selectedTemplateTestCase={template.selectedTestCase}
        selectedTemplateStepCount={template.stepCount}
        selectedTemplatePreviewSteps={template.previewSteps}
        errors={errors}
        renderError={renderError}
        onTemplateChange={actions.onTemplateChange}
        onContinue={actions.goToDetailsStep}
      />
    )
  }

  if (currentStep === detailsStepIndex) {
    return (
      <DetailsStep
        hasTemplateSelectionStep={hasTemplateSelectionStep}
        title={details.title}
        description={details.description}
        availableTestSuites={details.availableTestSuites}
        availableTags={details.availableTags}
        selectedTestSuites={details.selectedTestSuites}
        selectedTags={details.selectedTags}
        errors={errors}
        renderError={renderError}
        onTitleChange={actions.onTitleChange}
        onDescriptionChange={actions.onDescriptionChange}
        onTestSuiteChange={actions.onTestSuiteChange}
        onTagChange={actions.onTagChange}
        onBack={() => actions.setCurrentStep(0)}
        onContinue={actions.goToFlowStep}
        onCreateSuiteClick={() => actions.setIsCreateSuiteDialogOpen(true)}
        onCreateTagClick={() => actions.setIsCreateTagDialogOpen(true)}
      />
    )
  }

  return (
    <FlowStep
      isFlowImmersive={flow.isFlowImmersive}
      scenarioPreview={flow.scenarioPreview}
      errors={errors}
      renderError={renderError}
      renderFlowPanel={flow.renderFlowPanel}
      onBack={() => actions.setCurrentStep(detailsStepIndex)}
      onSubmit={actions.handleSubmit}
    />
  )
}

function useTemplateStepNavigation({
  appliedTemplateId,
  detailsStepIndex,
  hasTemplateSelectionStep,
  selectedTemplateId,
  templateTestCases,
  setAppliedTemplateId,
  setCurrentStep,
  setDescription,
  setErrors,
  setFlowBlocks,
  setNodesOrder,
  setTitle,
}: {
  appliedTemplateId: string
  detailsStepIndex: number
  hasTemplateSelectionStep: boolean
  selectedTemplateId: string
  templateTestCases?: TemplateTestCaseWithSteps[]
  setAppliedTemplateId: React.Dispatch<React.SetStateAction<string>>
  setCurrentStep: React.Dispatch<React.SetStateAction<number>>
  setDescription: React.Dispatch<React.SetStateAction<string>>
  setErrors: React.Dispatch<React.SetStateAction<TestCaseFormErrors>>
  setFlowBlocks: React.Dispatch<React.SetStateAction<FlowBlock[]>>
  setNodesOrder: React.Dispatch<React.SetStateAction<NodeOrderMap>>
  setTitle: React.Dispatch<React.SetStateAction<string>>
}) {
  return useCallback(() => {
    const resolution = resolveTemplateSelection({
      hasTemplateSelectionStep,
      templateTestCases,
      selectedTemplateId,
      appliedTemplateId,
    })

    if (resolution.status === 'skip') {
      setCurrentStep(detailsStepIndex)
      return
    }

    if (resolution.status === 'invalid') {
      setErrors(current => ({
        ...current,
        templateTestCaseId: resolution.errors,
      }))
      return
    }

    if (resolution.status === 'not-found') {
      setErrors(current => ({
        ...current,
        templateTestCaseId: ['Template test case not found'],
      }))
      return
    }

    if (resolution.status === 'conversion-error') {
      toast({
        title: 'Validation Error',
        description: resolution.error || 'Invalid template test case',
        variant: 'destructive',
      })
      return
    }

    if (resolution.status === 'converted') {
      setTitle(resolution.templateTestCase.name || '')
      setDescription(resolution.templateTestCase.description || '')
      setNodesOrder(resolution.convertedData.nodesOrder)
      setFlowBlocks(resolution.convertedData.flowBlocks)
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
  }, [
    appliedTemplateId,
    detailsStepIndex,
    hasTemplateSelectionStep,
    selectedTemplateId,
    setAppliedTemplateId,
    setCurrentStep,
    setDescription,
    setErrors,
    setFlowBlocks,
    setNodesOrder,
    setTitle,
    templateTestCases,
  ])
}

function useTestCaseSubmitHandler({
  description,
  detailsStepIndex,
  flowBlocks,
  id,
  nodesOrder,
  onSubmitAction,
  push,
  selectedTags,
  selectedTestSuites,
  templateStepParams,
  title,
  setCurrentStep,
  setErrors,
}: {
  description: string
  detailsStepIndex: number
  flowBlocks: FlowBlock[]
  id?: string
  nodesOrder: NodeOrderMap
  onSubmitAction: TestCaseFormProps['onSubmitAction']
  push: ReturnType<typeof useRouter>['push']
  selectedTags: string[]
  selectedTestSuites: string[]
  templateStepParams: TemplateStepParameter[]
  title: string
  setCurrentStep: React.Dispatch<React.SetStateAction<number>>
  setErrors: React.Dispatch<React.SetStateAction<TestCaseFormErrors>>
}) {
  return useCallback(async () => {
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
      flowBlocks,
    })

    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors
      setErrors(fieldErrors)
      if (isDetailFieldError(fieldErrors)) {
        setCurrentStep(detailsStepIndex)
      }
      return
    }
    setErrors({})
    const response = await onSubmitAction(result.data, id)
    handleTestCaseSaveResponse({ response, redirectPath: '/test-cases', push, toast })
  }, [
    description,
    detailsStepIndex,
    flowBlocks,
    id,
    nodesOrder,
    onSubmitAction,
    push,
    selectedTags,
    selectedTestSuites,
    setCurrentStep,
    setErrors,
    templateStepParams,
    title,
  ])
}

function useFlowStepNavigation({
  description,
  flowStepIndex,
  selectedTags,
  selectedTestSuites,
  title,
  setCurrentStep,
  setErrors,
}: {
  description: string
  flowStepIndex: number
  selectedTags: string[]
  selectedTestSuites: string[]
  title: string
  setCurrentStep: React.Dispatch<React.SetStateAction<number>>
  setErrors: React.Dispatch<React.SetStateAction<TestCaseFormErrors>>
}) {
  return useCallback(() => {
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
  }, [description, flowStepIndex, selectedTags, selectedTestSuites, setCurrentStep, setErrors, title])
}

function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return
    const { body } = document
    const previousOverflow = body.style.overflow
    body.style.overflow = 'hidden'

    return () => {
      body.style.overflow = previousOverflow
    }
  }, [isLocked])
}

function useWizardStepClick(currentStep: number, setCurrentStep: React.Dispatch<React.SetStateAction<number>>) {
  return useCallback(
    (stepIndex: number) => {
      if (stepIndex <= currentStep) {
        setCurrentStep(stepIndex)
      }
    },
    [currentStep, setCurrentStep],
  )
}

const TestCaseForm = ({
  defaultNodesOrder,
  templateStepParams,
  templateSteps,
  locators,
  locatorGroups,
  environments,
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
  defaultFlowBlocks = EMPTY_FLOW_BLOCKS,
  onSubmitAction,
  onCreateTestSuiteAction,
  onCreateTagAction,
}: TestCaseFormProps) => {
  const { push } = useRouter()
  const hasTemplateSelectionStep = Array.isArray(templateTestCases)
  const { detailsStepIndex, flowStepIndex } = getWizardStepIndexes(hasTemplateSelectionStep)
  const wizardSteps = getWizardSteps(hasTemplateSelectionStep)
  const templateOptions = getTemplateSelectionOptions(templateTestCases ?? [])

  const [nodesOrder, setNodesOrder] = useState<NodeOrderMap>(defaultNodesOrder)
  const [flowBlocks, setFlowBlocks] = useState<FlowBlock[]>(defaultFlowBlocks)
  const [title, setTitle] = useState(defaultTitle ?? '')
  const [description, setDescription] = useState(defaultDescription ?? '')
  const [availableTestSuites, setAvailableTestSuites] = useState(testSuites)
  const [availableTags, setAvailableTags] = useState(tags)
  const [selectedTestSuites, setSelectedTestSuites] = useState(defaultTestSuiteIds ?? [])
  const [selectedTags, setSelectedTags] = useState(defaultTagIds ?? [])
  const [selectedTemplateId, setSelectedTemplateId] = useState(defaultTemplateTestCaseId ?? '')
  const [appliedTemplateId, setAppliedTemplateId] = useState(defaultTemplateTestCaseId ?? '')
  const [currentStep, setCurrentStep] = useState(
    getInitialWizardStep(hasTemplateSelectionStep, defaultTemplateTestCaseId, detailsStepIndex),
  )
  const [isCreateSuiteDialogOpen, setIsCreateSuiteDialogOpen] = useState(false)
  const [isCreateTagDialogOpen, setIsCreateTagDialogOpen] = useState(false)
  const [isFlowImmersive, setIsFlowImmersive] = useState(false)
  const [errors, setErrors] = useState<TestCaseFormErrors>({})
  const selectedTemplateTestCase =
    templateTestCases?.find(templateTestCase => templateTestCase.id === selectedTemplateId) ?? null
  const selectedTemplateStepCount = getTemplateStepCount(selectedTemplateTestCase)
  const selectedTemplatePreviewSteps = buildTemplatePreviewSteps(selectedTemplateTestCase)

  const scenarioPreview = buildScenarioPreview(title, description, nodesOrder)
  const renderError = renderFormError

  const onNodeOrderChange = useCallback(
    (nodesOrder: NodeOrderMap) => {
      setNodesOrder(nodesOrder)
      setErrors(current => ({ ...current, steps: undefined }))
    },
    [setErrors, setNodesOrder],
  )

  const onTemplateChange = useCallback(
    (value: string) => {
      setSelectedTemplateId(value)
      setErrors(current => ({ ...current, templateTestCaseId: undefined }))
    },
    [setErrors, setSelectedTemplateId],
  )

  const onTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTitle(e.target.value)
      setErrors(current => ({ ...current, title: undefined }))
    },
    [setErrors, setTitle],
  )

  const onDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDescription(e.target.value)
      setErrors(current => ({ ...current, description: undefined }))
    },
    [setDescription, setErrors],
  )

  const onWizardStepClick = useWizardStepClick(currentStep, setCurrentStep)

  const onToggleFlowImmersive = useCallback(() => {
    setIsFlowImmersive(current => !current)
  }, [])

  const onTestSuiteChange = useCallback(
    (selectedTestSuites: string[]) => {
      setSelectedTestSuites(selectedTestSuites)
      setErrors(current => ({ ...current, testSuiteIds: undefined }))
    },
    [setErrors, setSelectedTestSuites],
  )

  const handleInlineTestSuiteSuccess = useCallback(
    async (createdTestSuite: TestSuite) => {
      setAvailableTestSuites(current => appendUniqueById(current, createdTestSuite))
      setSelectedTestSuites(current => appendUniqueId(current, createdTestSuite.id))
      setIsCreateSuiteDialogOpen(false)
    },
    [setAvailableTestSuites, setIsCreateSuiteDialogOpen, setSelectedTestSuites],
  )

  const onTagChange = useCallback(
    (selectedTags: string[]) => {
      setSelectedTags(selectedTags)
      setErrors(current => ({ ...current, tagIds: undefined }))
    },
    [setErrors, setSelectedTags],
  )

  const handleInlineTagSuccess = useCallback(
    async (createdTag: Tag) => {
      setAvailableTags(current => appendUniqueById(current, createdTag))
      setSelectedTags(current => appendUniqueId(current, createdTag.id))
      setIsCreateTagDialogOpen(false)
    },
    [setAvailableTags, setIsCreateTagDialogOpen, setSelectedTags],
  )

  const goToDetailsStep = useTemplateStepNavigation({
    appliedTemplateId,
    detailsStepIndex,
    hasTemplateSelectionStep,
    selectedTemplateId,
    templateTestCases,
    setAppliedTemplateId,
    setCurrentStep,
    setDescription,
    setErrors,
    setFlowBlocks,
    setNodesOrder,
    setTitle,
  })

  const goToFlowStep = useFlowStepNavigation({
    description,
    flowStepIndex,
    selectedTags,
    selectedTestSuites,
    title,
    setCurrentStep,
    setErrors,
  })

  const handleSubmit = useTestCaseSubmitHandler({
    description,
    detailsStepIndex,
    flowBlocks,
    id,
    nodesOrder,
    onSubmitAction,
    push,
    selectedTags,
    selectedTestSuites,
    templateStepParams,
    title,
    setCurrentStep,
    setErrors,
  })

  useBodyScrollLock(isFlowImmersive)

  const renderFlowPanel = (className: string) => (
    <FlowPanel
      className={className}
      nodesOrder={nodesOrder}
      templateStepParams={templateStepParams}
      templateSteps={templateSteps}
      locators={locators}
      locatorGroups={locatorGroups}
      environments={environments}
      moduleList={moduleList}
      flowBlocks={flowBlocks}
      isFlowImmersive={isFlowImmersive}
      onNodeOrderChange={onNodeOrderChange}
      onFlowBlocksChange={setFlowBlocks}
      onToggleImmersive={onToggleFlowImmersive}
    />
  )

  const wizardStepContentProps: WizardStepContentProps = {
    details: {
      availableTags,
      availableTestSuites,
      description,
      selectedTags,
      selectedTestSuites,
      title,
    },
    flow: {
      isFlowImmersive,
      renderFlowPanel,
      scenarioPreview,
    },
    navigation: {
      currentStep,
      detailsStepIndex,
      hasTemplateSelectionStep,
    },
    template: {
      options: templateOptions,
      previewSteps: selectedTemplatePreviewSteps,
      selectedId: selectedTemplateId,
      selectedTestCase: selectedTemplateTestCase,
      stepCount: selectedTemplateStepCount,
    },
    actions: {
      goToDetailsStep,
      goToFlowStep,
      handleSubmit,
      onDescriptionChange,
      onTagChange,
      onTemplateChange,
      onTestSuiteChange,
      onTitleChange,
      setCurrentStep,
      setIsCreateSuiteDialogOpen,
      setIsCreateTagDialogOpen,
    },
    errors,
    renderError,
  }

  return (
    <div className="flex flex-col gap-4">
      <WizardProgress steps={wizardSteps} currentStep={currentStep} onStepClick={onWizardStepClick} />

      <WizardStepContent {...wizardStepContentProps} />

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
