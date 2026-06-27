import { StepParameterType, TemplateStepIcon, TemplateStepType } from '@prisma/client'

export function getTemplateStepIconOptions() {
  return Object.values(TemplateStepIcon)
}

export function getTemplateStepTypeOptions() {
  return Object.values(TemplateStepType)
}

export function getTemplateStepParameterTypes() {
  return Object.values(StepParameterType)
}
