import type { StepBlockFormValues } from '@/constants/form-opts/step-block-form-opts'
import { stepBlockSchema } from '@/constants/form-opts/step-block-form-opts'
import type { ActionResponse, ActionResponseData } from '@/types/form/actionHandler'
import type { StepParameterType } from '@prisma/client'

export type StepBlockTemplateStepOption = {
  id: string
  name: string
  signature: string
  parameters?: Array<{ id: string; name: string; order: number; type: StepParameterType }>
  templateStepGroup?: { name: string } | null
}

type StepBlockTemplateStepParameter = NonNullable<StepBlockTemplateStepOption['parameters']>[number] & {
  templateStepId: string
}

function getParametersByTemplateStep(parameterData: ActionResponseData | undefined) {
  const parametersByStep = new Map<string, StepBlockTemplateStepParameter[]>()
  const parameters = Array.isArray(parameterData) ? (parameterData as StepBlockTemplateStepParameter[]) : []

  for (const parameter of parameters) {
    const current = parametersByStep.get(parameter.templateStepId) ?? []
    current.push(parameter)
    parametersByStep.set(parameter.templateStepId, current)
  }

  return parametersByStep
}

export type StepBlockStepRow = {
  id: string
  order: number
  parameterMap: string
  templateStep: StepBlockTemplateStepOption
}

export type StepBlockRow = {
  id: string
  name: string
  description: string | null
  intent: string | null
  createdAt: Date
  updatedAt: Date
  steps: StepBlockStepRow[]
}

export type StepBlockFormSubmitAction = (
  _prev: unknown,
  value: StepBlockFormValues,
  id?: string,
) => Promise<ActionResponse>

export const stepBlockFieldValidators = {
  name: stepBlockSchema.shape.name,
  description: stepBlockSchema.shape.description,
  intent: stepBlockSchema.shape.intent,
  steps: stepBlockSchema.shape.steps,
}

export function getActionErrorMessage(response: ActionResponse) {
  return response.error || response.message || 'Unable to save step block.'
}

export function getStepBlockRows(data: ActionResponseData | undefined): StepBlockRow[] {
  return Array.isArray(data) ? (data as StepBlockRow[]) : []
}

export function getStepBlockRow(data: ActionResponseData | undefined): StepBlockRow | null {
  return data ? (data as StepBlockRow) : null
}

export function getTemplateStepOptions(
  data: ActionResponseData | undefined,
  parameterData?: ActionResponseData | undefined,
): StepBlockTemplateStepOption[] {
  const templateSteps = Array.isArray(data) ? (data as StepBlockTemplateStepOption[]) : []
  const parametersByStep = getParametersByTemplateStep(parameterData)

  return templateSteps.map(templateStep => ({
    ...templateStep,
    parameters: (parametersByStep.get(templateStep.id) ?? []).sort((left, right) => left.order - right.order),
  }))
}

export function toStepBlockFormValues(row: StepBlockRow): StepBlockFormValues {
  return {
    name: row.name,
    description: row.description ?? '',
    intent: row.intent ?? '',
    steps: [...row.steps]
      .sort((left, right) => left.order - right.order)
      .map(step => ({
        templateStepId: step.templateStep.id,
      })),
  }
}
