import { getAllTemplateTestCasesAction } from '@/actions/template-test-case/template-test-case-actions'
import { stepInvocationSchema } from '../../../../../packages/cucumber-runtime/src/step-definitions/contracts'

import { getConvertedTemplateTestCaseData, getTemplateTestCasesWithSteps } from './create-from-template-helpers'
import type { TemplateTestCaseWithSteps } from './create-from-template-types'
import { loadTestCaseFormResourceResponses } from '../test-case-route-resource-helpers'

export function collectTemplateStepReferences(templateTestCases: TemplateTestCaseWithSteps[]) {
  const references = templateTestCases.flatMap(templateTestCase =>
    templateTestCase.steps.flatMap(step => {
      try {
        const invocation = stepInvocationSchema.safeParse(JSON.parse(step.invocationJson))
        return invocation.success ? [invocation.data.step] : []
      } catch {
        return []
      }
    }),
  )
  return Array.from(
    new Map(
      references.map(reference => [`${reference.id}@${reference.version}@${reference.definitionHash}`, reference]),
    ).values(),
  )
}

export async function loadCreateFromTemplateRouteResources() {
  const [templateTestCasesResponse, resourceResponses] = await Promise.all([
    getAllTemplateTestCasesAction(),
    loadTestCaseFormResourceResponses(),
  ])

  return { templateTestCasesResponse, resourceResponses }
}

export function resolveTemplateTestCaseSelection(
  templateTestCases: ReturnType<typeof getTemplateTestCasesWithSteps>,
  id: string,
) {
  const selectedTemplateTestCase = templateTestCases.find(templateTestCase => templateTestCase.id === id) ?? null
  if (!selectedTemplateTestCase) return { selectedTemplateTestCase, convertedTemplateData: null, conversionError: null }

  const { convertedData, error } = getConvertedTemplateTestCaseData(selectedTemplateTestCase)
  return {
    selectedTemplateTestCase,
    convertedTemplateData: convertedData,
    conversionError: error,
  }
}
