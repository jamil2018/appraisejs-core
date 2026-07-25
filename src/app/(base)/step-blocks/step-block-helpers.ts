import type { StepBlockFormValues } from '@/constants/form-opts/step-block-form-opts'
import { stepBlockSchema } from '@/constants/form-opts/step-block-form-opts'
import type { NodeOrderMap } from '@/types/diagram/diagram'
import type { StepDefinitionOption } from '@/types/step-definition-option'
import type { ActionResponse, ActionResponseData } from '@/types/form/actionHandler'

export type StepBlockStepRow = {
  id: string
  order: number
  parameterMap: string
  invocationJson: string
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

export function toStepBlockFormValues(row: StepBlockRow): StepBlockFormValues {
  return {
    name: row.name,
    description: row.description ?? '',
    intent: row.intent ?? '',
    steps: [...row.steps]
      .sort((left, right) => left.order - right.order)
      .map(step => ({ invocation: JSON.parse(step.invocationJson) })),
  }
}

export function getStepBlockNodeOrder(
  values: StepBlockFormValues | undefined,
  stepDefinitions: StepDefinitionOption[],
): NodeOrderMap {
  const stepByReference = new Map(stepDefinitions.map(step => [`${step.reference.id}@${step.reference.version}`, step]))
  const nodes = (values?.steps ?? [])
    .map((step, index) => getStepBlockNode(step, index, stepByReference))
    .filter((node): node is [string, NodeOrderMap[string]] => node !== null)

  return Object.fromEntries(nodes) as NodeOrderMap
}

function getStepBlockNode(
  step: StepBlockFormValues['steps'][number],
  index: number,
  stepByReference: Map<string, StepDefinitionOption>,
): [string, NodeOrderMap[string]] | null {
  const definition = stepByReference.get(`${step.invocation.step.id}@${step.invocation.step.version}`)
  if (!definition) return null

  return [
    `step-block-node-${index}`,
    {
      order: index + 1,
      label: definition.title,
      gherkinStep: getStepBlockGherkinStep(step, definition),
      icon: 'MOUSE',
      parameters: [],
      invocation: step.invocation,
    },
  ]
}

function getStepBlockGherkinStep(step: StepBlockFormValues['steps'][number], definition: StepDefinitionOption): string {
  const presentation = step.invocation.presentation
  if (!presentation) return `${definition.keywordCompatibility[0]} ${definition.signature}`

  return `${presentation.keyword ?? definition.keywordCompatibility[0]} ${presentation.description ?? definition.signature}`
}
