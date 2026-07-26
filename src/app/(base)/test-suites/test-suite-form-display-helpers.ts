import type { Module, Tag } from '@prisma/client'

export { getFieldErrorMessage } from '@/components/form/field-error-message'
import { testSuiteSchema } from '@/constants/form-opts/test-suite-form-opts'
import type { ActionResponse } from '@/types/form/actionHandler'

export const testSuiteFieldValidators = {
  name: testSuiteSchema.shape.name,
  moduleId: testSuiteSchema.shape.moduleId,
}

export const testSuiteQuickTips = [
  {
    title: 'Choose a descriptive name',
    description: 'Use clear, specific names that indicate the purpose',
  },
  {
    title: 'Group related tests',
    description: 'Organize tests that validate the same feature together',
  },
  {
    title: 'Use meaningful tags',
    description: 'Tags help filter and categorize effectively',
  },
] as const

export function getActionErrorMessage(response: ActionResponse) {
  return response.error || 'An error occurred'
}

export function getModuleOptions(modules: Module[]) {
  return modules.map(module => ({
    label: module.name,
    value: module.id,
  }))
}

export function getTagOptions(tags: Tag[]) {
  return tags.map(tag => ({
    label: tag.name,
    value: tag.id,
  }))
}
