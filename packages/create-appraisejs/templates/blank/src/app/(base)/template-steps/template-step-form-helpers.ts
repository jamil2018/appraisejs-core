import { TemplateStepType } from '@prisma/client'

import {
  templateStepSchema,
  type TemplateStep as TemplateStepFormValues,
} from '@/constants/form-opts/template-test-step-form-opts'
import type { ActionResponse } from '@/types/form/actionHandler'

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
    .map(
      param => `${param.name}: ${param.type.toLowerCase() === 'locator' ? 'SelectorName' : param.type.toLowerCase()}`,
    )
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
