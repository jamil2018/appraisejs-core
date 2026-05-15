'use client'

import type { RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { SheetClose, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { NodeFormData } from '@/constants/form-opts/diagram/node-form'
import type { TemplateStep } from '@prisma/client'

import DynamicFormFields, { type DynamicFormFieldsRef } from './dynamic-parameters'
import ErrorMessage from '@/components/form/error-message'
import TemplateStepCombobox from './template-step-combobox'
import { getSelectedTemplateIcon, type NodeFormErrors } from './node-form-helpers'
import { getParameterPreviewUpdates } from './node-form-template-step-selection'
import type { TemplateStepWithGroup } from '@/types/diagram/template-step'
import type { NodeFormFieldsProps } from './node-form-fields-props'

type NodeFormFieldsContentProps = NodeFormFieldsProps & {
  fieldClassName: string
  dynamicFormRef: RefObject<DynamicFormFieldsRef | null>
  selectedTemplateId: string
  selectedTemplateStep: TemplateStep | null
  selectedTemplateStepParams: NodeFormFieldsProps['templateStepParams']
  parameters: NodeFormData['parameters']
  gherkinStep: string
  errors: NodeFormErrors
  onLabelChange: (value: string) => void
  onTemplateStepChange: (value: string) => void
  onParametersChange: (values: NodeFormData['parameters'], gherkinStep: string) => void
}

export function NodeFormFieldsContent({
  mode = 'add',
  initialValues,
  templateSteps,
  locators,
  locatorGroups,
  environments,
  modules,
  onLocatorCreated,
  defaultValueInput = false,
  fieldClassName,
  dynamicFormRef,
  selectedTemplateId,
  selectedTemplateStep,
  selectedTemplateStepParams,
  gherkinStep,
  errors,
  onLabelChange,
  onTemplateStepChange,
  onParametersChange,
}: NodeFormFieldsContentProps) {
  return (
    <>
      <SheetHeader className="shrink-0">
        <SheetTitle>{mode === 'edit' ? 'Edit Node' : 'Add Node'}</SheetTitle>
        <SheetDescription>
          {mode === 'edit' ? 'Update this node in the diagram' : 'Insert a new node to the diagram'}
        </SheetDescription>
      </SheetHeader>
      <div className="my-4 flex-1 overflow-y-auto px-1">
        <div className="mb-4 flex flex-col gap-2">
          <Label htmlFor="label">Label</Label>
          <Input
            id="label"
            name="label"
            defaultValue={initialValues.label}
            className={fieldClassName}
            onChange={event => onLabelChange(event.target.value)}
          />
          <ErrorMessage message={errors.label?.[0] ?? ''} visible={!!errors.label} />
        </div>
        <div className="mb-4 flex flex-col gap-2">
          <Label htmlFor="templateStepId">Template Step</Label>
          <TemplateStepCombobox
            id="templateStepId"
            value={selectedTemplateId}
            onValueChange={onTemplateStepChange}
            templateSteps={templateSteps as TemplateStepWithGroup[]}
            placeholder="Select a template step"
            className={fieldClassName}
          />
          <input type="hidden" name="templateStepId" value={selectedTemplateId} />
          <ErrorMessage message={errors.templateStepId?.[0] ?? ''} visible={!!errors.templateStepId} />
        </div>
        <div className="mb-4 flex flex-col gap-2">
          <DynamicFormFields
            ref={dynamicFormRef}
            templateStepParams={selectedTemplateStepParams}
            locators={locators}
            locatorGroups={locatorGroups}
            environments={environments}
            modules={modules}
            onLocatorCreated={onLocatorCreated}
            initialParameterValues={initialValues.parameters}
            onChange={values => {
              const preview = getParameterPreviewUpdates(selectedTemplateStep, values)
              onParametersChange(preview.parameters, preview.gherkinStep)
            }}
            defaultValueInput={defaultValueInput}
          />
        </div>
        {selectedTemplateStep ? (
          <div className="mb-4 flex flex-col gap-2">
            <Label htmlFor="gherkinStep">Gherkin Step</Label>
            <Input disabled id="gherkinStep" name="gherkinStep" value={gherkinStep} className={fieldClassName} />
          </div>
        ) : null}
        <input type="hidden" name="icon" value={getSelectedTemplateIcon(selectedTemplateStep)} />
      </div>
      <SheetFooter className="shrink-0 border-t pt-4">
        <SheetClose asChild>
          <Button variant="outline">Cancel</Button>
        </SheetClose>
        <Button type="submit">Save</Button>
      </SheetFooter>
    </>
  )
}
