import type { TemplateStep as PrismaTemplateStep, TemplateStepGroup, TemplateStepParameter } from '@prisma/client'

import type { TemplateStep as TemplateStepFormValues } from '@/constants/form-opts/template-test-step-form-opts'
import type { ActionResponse } from '@/types/form/actionHandler'

export type TemplateStepGroupOption = {
  id: string
  name: string
}

export type EditableTemplateStep = PrismaTemplateStep & {
  parameters: TemplateStepParameter[]
  templateStepGroup: TemplateStepGroup
}

export type TemplateStepParameterSummary = Pick<TemplateStepParameter, 'id' | 'name'>

export type TemplateStepTableRow = PrismaTemplateStep & {
  parameters: TemplateStepParameterSummary[]
  templateStepGroup: TemplateStepGroup
}

export type TemplateStepFormSubmitAction = (
  _prev: unknown,
  value: TemplateStepFormValues,
  id?: string,
) => Promise<ActionResponse>
