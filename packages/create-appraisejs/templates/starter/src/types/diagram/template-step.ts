import { TemplateStep, TemplateStepGroup } from '@prisma/client'

/** Template step with optional group relation (e.g. from getAllTemplateStepsAction). */
export type TemplateStepWithGroup = TemplateStep & {
  templateStepGroup?: TemplateStepGroup
}

/** Returns the group name in title case for display (e.g. "navigation" -> "Navigation"). */
export function capitalizeGroupName(name: string): string {
  return name.replace(/\b\w/g, c => c.toUpperCase())
}
