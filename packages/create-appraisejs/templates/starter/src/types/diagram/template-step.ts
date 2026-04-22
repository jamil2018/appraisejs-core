import { TemplateStep, TemplateStepGroup, TemplateStepParameter } from '@prisma/client'

export type TemplateStepParameterSummary = Pick<TemplateStepParameter, 'id' | 'name'>

/** Template step with optional group relation (e.g. from getAllTemplateStepsAction). */
export type TemplateStepWithGroup = TemplateStep & {
  templateStepGroup?: TemplateStepGroup | null
  parameters?: TemplateStepParameterSummary[]
}

/** Returns the group name in title case for display (e.g. "navigation" -> "Navigation"). */
export function capitalizeGroupName(name: string): string {
  return name.replace(/\b\w/g, c => c.toUpperCase())
}
