import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NodeData } from '@/constants/form-opts/diagram/node-form'
import { Locator, LocatorGroup, StepParameterType, TemplateStep, TemplateStepIcon } from '@prisma/client'
import { TemplateStepParameter } from '@prisma/client'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import TemplateStepCombobox from './template-step-combobox'
import { type TemplateStepWithGroup } from '@/types/diagram/template-step'
import DynamicFormFields, { DynamicFormFieldsRef } from './dynamic-parameters'
import { generateGherkinStep } from '@/lib/transformers/gherkin-converter'
import { z } from 'zod'
import ErrorMessage from '@/components/form/error-message'
import { format } from 'date-fns'

const errorSchema = z.object({
  label: z.string().min(3, { message: 'Label must be at least 3 characters' }),
  templateStepId: z.string().min(1, { message: 'Template step is required' }),
})

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
}: {
  onSubmitAction: (values: NodeData) => void
  initialValues: NodeData
  templateSteps: TemplateStep[]
  templateStepParams: TemplateStepParameter[]
  showAddNodeDialog: boolean
  locators: Locator[]
  locatorGroups: LocatorGroup[]
  setShowAddNodeDialog: (show: boolean) => void
  defaultValueInput?: boolean
}) => {
  const dynamicFormRef = useRef<DynamicFormFieldsRef>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialValues.templateStepId)
  // states for dynamic form fields
  const [selectedTemplateStep, setSelectedTemplateStep] = useState<TemplateStep | null>(
    templateSteps.find(step => step.id === initialValues.templateStepId) ?? null,
  )
  const [selectedTemplateStepParams, setSelectedTemplateStepParams] = useState<TemplateStepParameter[]>(
    templateStepParams.filter(param => param.templateStepId === initialValues.templateStepId) ?? [],
  )
  const [parameters, setParameters] = useState<
    {
      name: string
      value: string
      type: StepParameterType
      order: number
    }[]
  >(initialValues.parameters ?? [])
  const [gherkinStep, setGherkinStep] = useState<string>(initialValues.gherkinStep ?? '')
  const [errors, setErrors] = useState<z.inferFlattenedErrors<typeof errorSchema>['fieldErrors']>({})
  // Synchronize state with initialValues when they change
  useEffect(() => {
    setSelectedTemplateId(initialValues.templateStepId)
    const step = templateSteps.find(step => step.id === initialValues.templateStepId) ?? null
    setSelectedTemplateStep(step)
    setSelectedTemplateStepParams(
      templateStepParams.filter(param => param.templateStepId === initialValues.templateStepId),
    )
    setParameters(initialValues.parameters ?? [])
    setGherkinStep(initialValues.gherkinStep ?? '')
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
      const step = templateSteps.find(s => s.id === value)
      if (step) {
        setSelectedTemplateStep(step)
        const newParams = templateStepParams.filter(param => param.templateStepId === step.id)
        setSelectedTemplateStepParams(newParams)
        const initialParamsForStep = newParams.map(param => {
          let defaultValue = ''
          switch (param.type) {
            case 'NUMBER':
              defaultValue = '0'
              break
            case 'STRING':
              defaultValue = ''
              break
            case 'LOCATOR':
              defaultValue = ''
              break
            case 'BOOLEAN':
              defaultValue = 'false'
              break
            case 'DATE':
              defaultValue = format(new Date(), 'PPP')
              break
          }
          return {
            name: param.name,
            value: defaultValue,
            type: param.type,
            order: param.order,
          }
        })
        setParameters(initialParamsForStep)
        if (step.signature) {
          const gherkin = generateGherkinStep(step.type, step.signature, initialParamsForStep)
          setGherkinStep(gherkin)
        }
      }
    },
    [
      templateSteps,
      templateStepParams,
    ],
  )

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const isDynamicFormValid = dynamicFormRef.current?.validate()

    const formData = new FormData(e.currentTarget)
    const formValues = Object.fromEntries(formData.entries())

    const dataToValidate = {
      label: formValues.label,
      templateStepId: selectedTemplateId,
    }

    const parsed = errorSchema.safeParse(dataToValidate)

    if (!parsed.success || !isDynamicFormValid) {
      if (!parsed.success) {
        setErrors(parsed.error.flatten().fieldErrors)
      }
      return
    }

    setErrors({})
    const nodeData: NodeData = {
      ...formValues,
      parameters: parameters,
      label: formValues.label as string,
      gherkinStep: gherkinStep,
      templateStepId: selectedTemplateId as string,
    }
    onSubmitAction(nodeData)
  }

  return (
    <Dialog open={showAddNodeDialog} onOpenChange={setShowAddNodeDialog}>
      <DialogTrigger asChild>
        <Button type="button" onClick={e => e.preventDefault()}>
          Add Node
        </Button>
      </DialogTrigger>
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
                  // Generate gherkin step directly when parameters change
                  if (selectedTemplateStep && selectedTemplateStep.signature) {
                    const gherkin = generateGherkinStep(
                      selectedTemplateStep.type,
                      selectedTemplateStep.signature,
                      values,
                    )
                    setGherkinStep(gherkin)
                  }
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
              value={selectedTemplateStep?.icon ? selectedTemplateStep.icon : TemplateStepIcon.MOUSE}
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
