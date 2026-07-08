'use client'

import { useMemo, useRef, useState } from 'react'
import type { TemplateStep } from '@prisma/client'
import { Blocks, Save, X } from 'lucide-react'

import type { InlineLocatorSaveResult } from '@/app/(base)/locators/create/create-locator-workspace-helpers'
import type { NodeFormData } from '@/constants/form-opts/diagram/node-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import DynamicFormFields, { type DynamicFormFieldsRef } from './dynamic-parameters'
import type { FlowDiagramProps, FlowDiagramStepBlock } from './flow-diagram-types'
import { createInitialParametersForTemplateStep, getGherkinPreview } from './node-form-helpers'

export type StepBlockEditorStep = NodeFormData & {
  id: string
  templateStep: FlowDiagramStepBlock['steps'][number]['templateStep']
}

export type StepBlockSubmitValue = {
  name: string
  steps: NodeFormData[]
}

type FlowDiagramStepBlockSheetProps = {
  open: boolean
  mode: 'add' | 'edit'
  stepBlocks: FlowDiagramStepBlock[]
  initialBlockName?: string
  initialSteps?: StepBlockEditorStep[]
  locators: FlowDiagramProps['locators']
  locatorGroups: FlowDiagramProps['locatorGroups']
  environments: FlowDiagramProps['environments']
  modules: FlowDiagramProps['modules']
  onLocatorCreated?: (result: InlineLocatorSaveResult) => void
  onOpenChange: (open: boolean) => void
  onSubmit: (value: StepBlockSubmitValue) => void
}

type StepBlockSheetContentProps = Omit<FlowDiagramStepBlockSheetProps, 'open'>

const EMPTY_STEPS: StepBlockEditorStep[] = []

function createStepsFromBlock(block: FlowDiagramStepBlock | undefined): StepBlockEditorStep[] {
  return (
    block?.steps
      .slice()
      .sort((left, right) => left.order - right.order)
      .map(step => {
        const parameters = createInitialParametersForTemplateStep(step.templateStep.parameters)

        return {
          id: step.id,
          label: step.templateStep.name,
          templateStepId: step.templateStep.id,
          templateStep: step.templateStep,
          parameters,
          gherkinStep: getGherkinPreview(step.templateStep, parameters),
        }
      }) ?? EMPTY_STEPS
  )
}

function getValidatedName(name: string, selectedBlock: FlowDiagramStepBlock | undefined) {
  return name.trim() || selectedBlock?.name || 'Untitled block'
}

function toSubmitStep(step: StepBlockEditorStep): NodeFormData {
  return {
    label: step.label,
    gherkinStep: step.gherkinStep,
    templateStepId: step.templateStepId,
    parameters: step.parameters,
  }
}

function StepBlockSheetContent({
  mode,
  stepBlocks,
  initialBlockName = '',
  initialSteps = EMPTY_STEPS,
  locators,
  locatorGroups,
  environments,
  modules,
  onLocatorCreated,
  onOpenChange,
  onSubmit,
}: StepBlockSheetContentProps) {
  const [selectedBlockId, setSelectedBlockId] = useState('')
  const [blockName, setBlockName] = useState(initialBlockName)
  const [steps, setSteps] = useState<StepBlockEditorStep[]>(initialSteps)
  const parameterRefs = useRef<Record<string, DynamicFormFieldsRef | null>>({})
  const selectedBlock = useMemo(
    () => stepBlocks.find(block => block.id === selectedBlockId),
    [selectedBlockId, stepBlocks],
  )

  const handleBlockChange = (blockId: string) => {
    const block = stepBlocks.find(option => option.id === blockId)
    setSelectedBlockId(blockId)
    setBlockName(block?.name ?? '')
    setSteps(createStepsFromBlock(block))
    parameterRefs.current = {}
  }

  const handleStepParametersChange = (stepId: string, values: NodeFormData['parameters']) => {
    setSteps(current =>
      current.map(step =>
        step.id === stepId
          ? {
              ...step,
              parameters: values,
              gherkinStep: getGherkinPreview(step.templateStep as TemplateStep, values),
            }
          : step,
      ),
    )
  }

  const handleStepLabelChange = (stepId: string, label: string) => {
    setSteps(current => current.map(step => (step.id === stepId ? { ...step, label } : step)))
  }

  const handleSubmit = () => {
    const isValid = steps.every(step => parameterRefs.current[step.id]?.validate() ?? true)
    if (!isValid || steps.length === 0) {
      return
    }

    onSubmit({
      name: getValidatedName(blockName, selectedBlock),
      steps: steps.map(toSubmitStep),
    })
    onOpenChange(false)
  }

  return (
    <>
      <SheetHeader className="shrink-0">
        <SheetTitle>{mode === 'edit' ? 'Edit block' : 'Add block'}</SheetTitle>
        <SheetDescription>
          {mode === 'edit'
            ? 'Update this block instance in the test case.'
            : 'Insert a saved block and set values for this test case.'}
        </SheetDescription>
      </SheetHeader>

      <div className="my-4 flex-1 overflow-y-auto px-1">
        {mode === 'add' ? (
          <div className="mb-4 flex flex-col gap-2">
            <Label htmlFor="stepBlockId">Step Block</Label>
            <Select value={selectedBlockId} onValueChange={handleBlockChange}>
              <SelectTrigger id="stepBlockId">
                <SelectValue placeholder="Select a step block" />
              </SelectTrigger>
              <SelectContent isEmpty={stepBlocks.length === 0}>
                {stepBlocks.map(block => (
                  <SelectItem key={block.id} value={block.id}>
                    {block.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="mb-4 flex flex-col gap-2">
          <Label htmlFor="stepBlockName">Block Name</Label>
          <Input id="stepBlockName" value={blockName} onChange={event => setBlockName(event.target.value)} />
        </div>

        <div className="flex flex-col gap-4">
          {steps.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Select a block to configure its steps.
            </div>
          ) : (
            steps.map((step, index) => (
              <div key={step.id} className="rounded-md border p-3">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
                  <Blocks className="size-4" aria-hidden />
                  <span>Step {index + 1}</span>
                </div>
                <div className="mb-3 flex flex-col gap-2">
                  <Label htmlFor={`block-step-${step.id}-label`}>Label</Label>
                  <Input
                    id={`block-step-${step.id}-label`}
                    value={step.label}
                    onChange={event => handleStepLabelChange(step.id, event.target.value)}
                  />
                </div>
                <DynamicFormFields
                  ref={instance => {
                    parameterRefs.current[step.id] = instance
                  }}
                  templateStepParams={step.templateStep.parameters}
                  locators={locators}
                  locatorGroups={locatorGroups}
                  environments={environments}
                  modules={modules}
                  onLocatorCreated={onLocatorCreated}
                  initialParameterValues={step.parameters}
                  onChange={values => handleStepParametersChange(step.id, values)}
                />
                <div className="mt-3 flex flex-col gap-2">
                  <Label htmlFor={`block-step-${step.id}-gherkin`}>Gherkin Step</Label>
                  <Input id={`block-step-${step.id}-gherkin`} value={step.gherkinStep} disabled />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <SheetFooter className="shrink-0 border-t pt-4">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          <X className="size-4" aria-hidden />
          <span>Cancel</span>
        </Button>
        <Button type="button" disabled={steps.length === 0} onClick={handleSubmit}>
          <Save className="size-4" aria-hidden />
          <span className="font-bold">Save</span>
        </Button>
      </SheetFooter>
    </>
  )
}

export function FlowDiagramStepBlockSheet({ open, onOpenChange, ...contentProps }: FlowDiagramStepBlockSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col overflow-hidden sm:max-w-xl">
        {open ? <StepBlockSheetContent {...contentProps} onOpenChange={onOpenChange} /> : null}
      </SheetContent>
    </Sheet>
  )
}
