'use client'

import { Sheet, SheetContent } from '@/components/ui/sheet'
import type { NodeFormData } from '@/constants/form-opts/diagram/node-form'
import { useCallback, useRef, useState } from 'react'
import type { TemplateStep } from '@prisma/client'

import type { DynamicFormFieldsRef } from './dynamic-parameters'
import { NodeFormFieldsContent } from './node-form-fields-content'
import type { NodeFormFieldsProps } from './node-form-fields-props'
import { handleNodeFormSubmit } from './node-form-submit'
import {
  getGherkinPreview,
  getSelectedTemplateStep,
  getSelectedTemplateStepParams,
  type NodeFormProps,
} from './node-form-helpers'
import { getTemplateStepSelectionUpdates } from './node-form-template-step-selection'

function buildFormResetKey(
  initialValues: NodeFormProps['initialValues'],
  mode: NodeFormProps['mode'],
  showAddNodeDialog: boolean,
) {
  return JSON.stringify({
    label: initialValues.label,
    gherkinStep: initialValues.gherkinStep,
    templateStepId: initialValues.templateStepId,
    parameters: initialValues.parameters ?? [],
    mode,
    dialog: mode === 'add' ? showAddNodeDialog : 'edit',
  })
}

function NodeFormFields({
  onSubmitAction,
  initialValues,
  mode = 'add',
  templateSteps,
  templateStepParams,
  locators,
  locatorGroups,
  environments,
  modules,
  onLocatorCreated,
  defaultValueInput = false,
  parameterMode = 'values',
}: NodeFormFieldsProps) {
  const fieldClassName = 'border-border bg-background'
  const dynamicFormRef = useRef<DynamicFormFieldsRef>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialValues.templateStepId)
  const [selectedTemplateStep, setSelectedTemplateStep] = useState<TemplateStep | null>(() =>
    getSelectedTemplateStep(templateSteps, initialValues.templateStepId),
  )
  const [selectedTemplateStepParams, setSelectedTemplateStepParams] = useState(() =>
    getSelectedTemplateStepParams(templateStepParams, initialValues.templateStepId),
  )
  const [parameters, setParameters] = useState<NodeFormData['parameters']>(initialValues.parameters ?? [])
  const [gherkinStep, setGherkinStep] = useState(initialValues.gherkinStep ?? '')
  const [errors, setErrors] = useState({})

  const handleTemplateStepChange = useCallback(
    (value: string) => {
      setErrors(prev => ({
        ...prev,
        templateStepId: value ? undefined : ['Template step is required'],
      }))
      setSelectedTemplateId(value)

      const selection = getTemplateStepSelectionUpdates(value, templateSteps, templateStepParams)
      if (!selection) {
        return
      }

      setSelectedTemplateStep(selection.step)
      setSelectedTemplateStepParams(selection.newParams)
      setParameters(parameterMode === 'hidden' ? [] : selection.initialParamsForStep)
      setGherkinStep(parameterMode === 'hidden' ? getGherkinPreview(selection.step, []) : selection.gherkinStep)
    },
    [parameterMode, templateStepParams, templateSteps],
  )

  return (
    <form
      onSubmit={event =>
        handleNodeFormSubmit(event, {
          dynamicFormRef,
          selectedTemplateId,
          parameters: parameterMode === 'hidden' ? [] : parameters,
          gherkinStep,
          parameterMode,
          onSubmitAction,
          setErrors,
        })
      }
      className="flex h-full flex-col overflow-hidden"
    >
      <NodeFormFieldsContent
        mode={mode}
        initialValues={initialValues}
        templateSteps={templateSteps}
        templateStepParams={templateStepParams}
        locators={locators}
        locatorGroups={locatorGroups}
        environments={environments}
        modules={modules}
        onLocatorCreated={onLocatorCreated}
        defaultValueInput={defaultValueInput}
        parameterMode={parameterMode}
        onSubmitAction={onSubmitAction}
        fieldClassName={fieldClassName}
        dynamicFormRef={dynamicFormRef}
        selectedTemplateId={selectedTemplateId}
        selectedTemplateStep={selectedTemplateStep}
        selectedTemplateStepParams={selectedTemplateStepParams}
        parameters={parameters}
        gherkinStep={gherkinStep}
        errors={errors}
        onLabelChange={value => {
          setErrors(prev => ({
            ...prev,
            label: value ? undefined : ['Label is required'],
          }))
        }}
        onTemplateStepChange={handleTemplateStepChange}
        onParametersChange={(nextParameters, nextGherkinStep) => {
          setParameters(nextParameters)
          setGherkinStep(nextGherkinStep)
        }}
      />
    </form>
  )
}

function NodeForm({ showAddNodeDialog, setShowAddNodeDialog, initialValues, mode, ...fieldsProps }: NodeFormProps) {
  const formResetKey = buildFormResetKey(initialValues, mode ?? 'add', showAddNodeDialog)

  return (
    <Sheet open={showAddNodeDialog} onOpenChange={setShowAddNodeDialog}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <NodeFormFields key={formResetKey} initialValues={initialValues} mode={mode} {...fieldsProps} />
      </SheetContent>
    </Sheet>
  )
}

export default NodeForm
