import { format } from 'date-fns'
import {
  StepParameterType,
  TemplateStepIcon,
  type Locator,
  type LocatorGroup,
  type TemplateStep,
  type TemplateStepParameter,
} from '@prisma/client'
import { z } from 'zod'

import type { NodeData } from '@/constants/form-opts/diagram/node-form'
import { generateGherkinStep } from '@/lib/transformers/gherkin-converter'

export const nodeFormErrorSchema = z.object({
  label: z.string().min(3, { message: 'Label must be at least 3 characters' }),
  templateStepId: z.string().min(1, { message: 'Template step is required' }),
})

export type NodeFormErrors = z.inferFlattenedErrors<typeof nodeFormErrorSchema>['fieldErrors']

export type NodeFormProps = {
  onSubmitAction: (values: NodeData) => void
  initialValues: NodeData
  templateSteps: TemplateStep[]
  templateStepParams: TemplateStepParameter[]
  showAddNodeDialog: boolean
  locators: Array<Pick<Locator, 'id' | 'name' | 'locatorGroupId'>>
  locatorGroups: Array<Pick<LocatorGroup, 'id' | 'name'>>
  setShowAddNodeDialog: (show: boolean) => void
  defaultValueInput?: boolean
}

export function getSelectedTemplateStep(templateSteps: TemplateStep[], templateStepId: string) {
  return templateSteps.find(step => step.id === templateStepId) ?? null
}

export function getSelectedTemplateStepParams(templateStepParams: TemplateStepParameter[], templateStepId: string) {
  return templateStepParams.filter(parameter => parameter.templateStepId === templateStepId)
}

function getDefaultParameterValue(type: StepParameterType) {
  switch (type) {
    case StepParameterType.NUMBER:
      return '0'
    case StepParameterType.STRING:
    case StepParameterType.LOCATOR:
      return ''
    case StepParameterType.BOOLEAN:
      return 'false'
    case StepParameterType.DATE:
      return format(new Date(), 'PPP')
  }
}

export function createInitialParametersForTemplateStep(templateStepParams: TemplateStepParameter[]) {
  return templateStepParams.map(parameter => ({
    name: parameter.name,
    value: getDefaultParameterValue(parameter.type),
    type: parameter.type,
    order: parameter.order,
  }))
}

export function getGherkinPreview(
  templateStep: TemplateStep | null,
  parameters: NodeData['parameters'],
) {
  if (!templateStep?.signature) {
    return ''
  }

  return generateGherkinStep(templateStep.type, templateStep.signature, parameters)
}

export function validateNodeFormValues(label: FormDataEntryValue | undefined, templateStepId: string) {
  return nodeFormErrorSchema.safeParse({
    label,
    templateStepId,
  })
}

export function buildNodeFormSubmitValue(
  formValues: Record<string, FormDataEntryValue>,
  parameters: NodeData['parameters'],
  gherkinStep: string,
  templateStepId: string,
) {
  return {
    ...formValues,
    parameters,
    label: String(formValues.label ?? ''),
    gherkinStep,
    templateStepId,
  } satisfies NodeData
}

export function getSelectedTemplateIcon(templateStep: TemplateStep | null) {
  return templateStep?.icon ?? TemplateStepIcon.MOUSE
}
