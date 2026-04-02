import {
  StepParameterType,
  TemplateStepIcon,
  TemplateStepType,
  type TemplateStep as PrismaTemplateStep,
  type TemplateStepParameter,
} from '@prisma/client'

import {
  templateStepSchema,
  type TemplateStep as TemplateStepFormValues,
} from '@/constants/form-opts/template-test-step-form-opts'
import type { ActionResponse, ActionResponseData } from '@/types/form/actionHandler'

export type TemplateStepGroupOption = {
  id: string
  name: string
}

export type EditableTemplateStep = PrismaTemplateStep & {
  parameters: TemplateStepParameter[]
}

export type TemplateStepTableRow = PrismaTemplateStep & {
  parameters: TemplateStepParameter[]
}

export type TemplateStepFormSubmitAction = (
  _prev: unknown,
  value: TemplateStepFormValues,
  id?: string,
) => Promise<ActionResponse>

export const templateStepFieldValidators = {
  name: templateStepSchema.shape.name,
  templateStepGroupId: templateStepSchema.shape.templateStepGroupId,
  type: templateStepSchema.shape.type,
  signature: templateStepSchema.shape.signature,
}

export function getInitialFunctionDefinition() {
  return `When('', async function(this:CustomWorld){});`
}

export function getFieldErrorMessage(error: unknown) {
  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  return String(error)
}

export function getActionErrorMessage(response: ActionResponse) {
  return response.error || 'An error occurred'
}

export function buildFunctionDefinitionPreview(
  currentDefinition: string,
  signature: string,
  type: TemplateStepType,
  params: Array<{ name: string; type: string }>,
  quoteType: `'` | `"` | '`' = `'`,
) {
  const updatedSignature = currentDefinition.replace(/(When|Then)\((['"`])(.*?)\2/, () => {
    const keyword = type === TemplateStepType.ASSERTION ? 'Then' : 'When'
    return `${keyword}(${quoteType}${signature}${quoteType}`
  })

  const paramsString = params
    .map(param => `${param.name}: ${param.type.toLowerCase() === 'locator' ? 'SelectorName' : param.type.toLowerCase()}`)
    .join(', ')

  return updatedSignature.replace(
    /async function\s*\(\s*this:CustomWorld(?:,\s*.*?)?\s*\)/,
    `async function(this:CustomWorld${params.length > 0 ? ', ' : ''}${paramsString})`,
  )
}

export function getTemplateStepFormDefaults(defaultValues?: TemplateStepFormValues) {
  return {
    signature: defaultValues?.signature ?? '',
    functionDefinition: defaultValues?.functionDefinition ?? getInitialFunctionDefinition(),
    type: (defaultValues?.type as TemplateStepType) ?? TemplateStepType.ACTION,
    params: defaultValues?.params ?? [],
  }
}

function isNamedRow(value: unknown): value is TemplateStepGroupOption {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value
}

function isTemplateStepParameterRow(value: unknown): value is TemplateStepParameter {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    'type' in value &&
    'order' in value
  )
}

function isEditableTemplateStep(value: unknown): value is EditableTemplateStep {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    'createdAt' in value &&
    'updatedAt' in value &&
    'type' in value &&
    'signature' in value &&
    'icon' in value &&
    'templateStepGroupId' in value &&
    'parameters' in value &&
    Array.isArray(value.parameters) &&
    value.parameters.every(isTemplateStepParameterRow)
  )
}

export function getTemplateStepGroupRows(data: ActionResponseData | undefined): TemplateStepGroupOption[] {
  return Array.isArray(data) ? data.filter(isNamedRow) : []
}

export function getEditableTemplateStep(data: ActionResponseData | undefined) {
  return isEditableTemplateStep(data) ? data : null
}

export function getTemplateStepRows(data: ActionResponseData | undefined): TemplateStepTableRow[] {
  return Array.isArray(data) ? data.filter(isEditableTemplateStep) : []
}

export function getTemplateStepIconOptions() {
  return Object.values(TemplateStepIcon)
}

export function getTemplateStepTypeOptions() {
  return Object.values(TemplateStepType)
}

export function getTemplateStepParameterTypes() {
  return Object.values(StepParameterType)
}
