import type { NodeFormData } from '@/constants/form-opts/diagram/node-form'
import type { TemplateStepParameter, TemplateStep } from '@prisma/client'

import {
  createInitialParametersForTemplateStep,
  getGherkinPreview,
  getSelectedTemplateStep,
  getSelectedTemplateStepParams,
} from './node-form-helpers'

export function getTemplateStepSelectionUpdates(
  templateStepId: string,
  templateSteps: TemplateStep[],
  templateStepParams: TemplateStepParameter[],
) {
  const step = getSelectedTemplateStep(templateSteps, templateStepId)
  if (!step) {
    return null
  }

  const newParams = getSelectedTemplateStepParams(templateStepParams, step.id)
  const initialParamsForStep = createInitialParametersForTemplateStep(newParams)

  return {
    step,
    newParams,
    initialParamsForStep,
    gherkinStep: getGherkinPreview(step, initialParamsForStep),
  }
}

export function getParameterPreviewUpdates(templateStep: TemplateStep | null, values: NodeFormData['parameters']) {
  return {
    parameters: [...values],
    gherkinStep: getGherkinPreview(templateStep, values),
  }
}
