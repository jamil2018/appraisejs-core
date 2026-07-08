import type { StepBlockFormValues } from '@/constants/form-opts/step-block-form-opts'
import { stepBlockSchema } from '@/constants/form-opts/step-block-form-opts'
import type { ActionResponse, ActionResponseData } from '@/types/form/actionHandler'

export type StepBlockTemplateStepOption = {
  id: string
  name: string
  signature: string
  templateStepGroup?: { name: string } | null
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

export function getTemplateStepOptions(data: ActionResponseData | undefined): StepBlockTemplateStepOption[] {
  return Array.isArray(data) ? (data as StepBlockTemplateStepOption[]) : []
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
        parameterMap: step.parameterMap,
      })),
  }
}
