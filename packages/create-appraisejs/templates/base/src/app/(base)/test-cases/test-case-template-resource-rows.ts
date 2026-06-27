import type { TemplateStep, TemplateStepParameter } from '@prisma/client'

import type { ActionResponseData } from '@/types/form/actionHandler'

import { isNamedRow } from './test-case-shared-resource-rows'

function isTemplateStepParameterRow(value: unknown): value is TemplateStepParameter {
  return typeof value === 'object' && value !== null && 'id' in value && 'templateStepId' in value
}

function isTemplateStepRow(value: unknown): value is TemplateStep {
  return isNamedRow(value)
}

export function getTemplateStepParamRows(data: ActionResponseData | undefined): TemplateStepParameter[] {
  return Array.isArray(data) ? data.filter(isTemplateStepParameterRow) : []
}

export function getTemplateStepRows(data: ActionResponseData | undefined): TemplateStep[] {
  return Array.isArray(data) ? data.filter(isTemplateStepRow) : []
}
