import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NodeData } from '@/constants/form-opts/diagram/node-form'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import TemplateStepCombobox from './template-step-combobox'
import { type TemplateStepWithGroup } from '@/types/diagram/template-step'
import DynamicFormFields, { DynamicFormFieldsRef } from './dynamic-parameters'
import ErrorMessage from '@/components/form/error-message'
import {
  buildNodeFormSubmitValue,
  createInitialParametersForTemplateStep,
  getGherkinPreview,
  getSelectedTemplateIcon,
  getSelectedTemplateStep,
  getSelectedTemplateStepParams,
  type NodeFormErrors,
  type NodeFormProps,
  validateNodeFormValues,
} from './node-form-helpers'

const NodeForm = ({
  onSubmitAction,
  initialValues,
  templateSteps,
  templateStepParams,
  showAddNodeDialog,
  locators,
  locatorGroups,
  setShowAddNodeDialog,
  defaultValueInput = false,
}: NodeFormProps) => {
  const dynamicFormRef = useRef<DynamicFormFieldsRef>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialValues.templateStepId)
  const [selectedTemplateStep, setSelectedTemplateStep] = useState(() =>
    getSelectedTemplateStep(templateSteps, initialValues.templateStepId),
  )
  const [selectedTemplateStepParams, setSelectedTemplateStepParams] = useState(() =>
    getSelectedTemplateStepParams(templateStepParams, initialValues.templateStepId),
  )
  const [parameters, setParameters] = useState<
    {
      name: string
      value: string
      type: NodeData['parameters'][number]['type']
      order: number
    }[]
  >(initialValues.parameters ?? [])
  const [gherkinStep, setGherkinStep] = useState<string>(initialValues.gherkinStep ?? '')
  const [errors, setErrors] = useState<NodeFormErrors>({})

  useEffect(() => {
    queueMicrotask(() => {
      setSelectedTemplateId(initialValues.templateStepId)
      const step = getSelectedTemplateStep(templateSteps, initialValues.templateStepId)
      setSelectedTemplateStep(step)
      setSelectedTemplateStepParams(getSelectedTemplateStepParams(templateStepParams, initialValues.templateStepId))
      setParameters(initialValues.parameters ?? [])
      setGherkinStep(initialValues.gherkinStep ?? '')
    })
  }, [
    initialValues.templateStepId,
    initialValues.parameters,
    initialValues.gherkinStep,
    templateSteps,
    templateStepParams,
  ])

  const handleTemplateStepChange = useCallback(
    (value: string) => {
      setErrors(prev => ({
        ...prev,
        templateStepId: value ? undefined : ['Template step is required'],
      }))
      setSelectedTemplateId(value)
      const step = getSelectedTemplateStep(templateSteps, value)
      if (step) {
        setSelectedTemplateStep(step)
        const newParams = getSelectedTemplateStepParams(templateStepParams, step.id)
        setSelectedTemplateStepParams(newParams)
        const initialParamsForStep = createInitialParametersForTemplateStep(newParams)
        setParameters(initialParamsForStep)
        setGherkinStep(getGherkinPreview(step, initialParamsForStep))
      }
    },
    [templateStepParams, templateSteps],
  )

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const isDynamicFormValid = dynamicFormRef.current?.validate()

    const formData = new FormData(e.currentTarget)
    const formValues = Object.fromEntries(formData.entries())

    const parsed = validateNodeFormValues(formValues.label, selectedTemplateId)

    if (!parsed.success || !isDynamicFormValid) {
      if (!parsed.success) {
        setErrors(parsed.error.flatten().fieldErrors)
      }
      return
    }

    setErrors({})
    onSubmitAction(buildNodeFormSubmitValue(formValues, parameters, gherkinStep, selectedTemplateId))
  }

  return (
    <Dialog open={showAddNodeDialog} onOpenChange={setShowAddNodeDialog}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Node</DialogTitle>
          </DialogHeader>
          <DialogDescription>Insert a new node to the diagram</DialogDescription>
          <div className="my-4">
            <div className="mb-4 flex flex-col gap-2">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                name="label"
                defaultValue={initialValues.label}
                onChange={e => {
                  setErrors(prev => ({
                    ...prev,
                    label: e.target.value ? undefined : ['Label is required'],
                  }))
                }}
              />
              <ErrorMessage message={errors.label?.[0] ?? ''} visible={!!errors.label} />
            </div>
            <div className="mb-4 flex flex-col gap-2">
              <Label htmlFor="templateStepId">Template Step</Label>
              <TemplateStepCombobox
                id="templateStepId"
                value={selectedTemplateId}
                onValueChange={handleTemplateStepChange}
                templateSteps={templateSteps as TemplateStepWithGroup[]}
                placeholder="Select a template step"
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
                initialParameterValues={initialValues.parameters}
                onChange={values => {
                  setParameters([...values])
                  setGherkinStep(getGherkinPreview(selectedTemplateStep, values))
                }}
                defaultValueInput={defaultValueInput}
              />
            </div>
            {selectedTemplateStep && (
              <div className="mb-4 flex flex-col gap-2">
                <Label htmlFor="gherkinStep">Gherkin Step</Label>
                <Input disabled id="gherkinStep" name="gherkinStep" value={gherkinStep} />
              </div>
            )}
            <input
              type="hidden"
              name="icon"
              value={getSelectedTemplateIcon(selectedTemplateStep)}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default NodeForm
