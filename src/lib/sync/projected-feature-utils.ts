import { StepParameterType, TemplateStepIcon } from '@prisma/client'
import { formatOrderedGherkinSteps } from '@/lib/gherkin-step-format'

type StoredProjectedStep = {
  order: number
  gherkinStep: string
}

type StoredProjectedDbStep = StoredProjectedStep & {
  TemplateStep: { signature: string } | null
  parameters: Array<{ name: string; value: string; order: number; type: StepParameterType }>
}

export type ProjectedDbTestCaseStep = {
  order: number
  keyword: string
  text: string
  gherkinStep: string
  label: string
  icon: TemplateStepIcon
  templateStepSignature: string | null
  parameters: Array<{ name: string; value: string; order: number; type: StepParameterType }>
}

export function getTestSuiteFilesystemKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
}

export function getTestSuiteSyncIdentity(name: string, modulePath: string): string {
  return `${getTestSuiteFilesystemKey(name)}::${modulePath}`
}

export function generateProjectedGherkinSteps(steps: StoredProjectedStep[]): string[] {
  if (!steps || steps.length === 0) {
    return []
  }

  return formatOrderedGherkinSteps(steps)
}

export function determineProjectedStepIcon(keyword: string): TemplateStepIcon {
  const lowerKeyword = keyword.toLowerCase().trim()

  if (lowerKeyword === 'given') return TemplateStepIcon.NAVIGATION
  if (lowerKeyword === 'then') return TemplateStepIcon.VALIDATION
  return TemplateStepIcon.MOUSE
}

export function normalizeProjectedDbTestCaseSteps(steps: StoredProjectedDbStep[]): ProjectedDbTestCaseStep[] {
  const sortedSteps = [...steps].sort((left, right) => left.order - right.order)
  const projectedGherkinSteps = generateProjectedGherkinSteps(sortedSteps)

  return sortedSteps.map((step, index) => {
    const gherkinStep = projectedGherkinSteps[index] ?? ''
    const [keyword = '', ...textParts] = gherkinStep.split(' ')
    const text = textParts.join(' ')

    return {
      order: step.order,
      keyword,
      text,
      gherkinStep,
      label: text,
      icon: determineProjectedStepIcon(keyword),
      templateStepSignature: step.TemplateStep?.signature ?? null,
      parameters: step.parameters,
    }
  })
}
