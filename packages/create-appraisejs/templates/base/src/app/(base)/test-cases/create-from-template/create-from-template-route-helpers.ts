import { getAllTemplateTestCasesAction } from '@/actions/template-test-case/template-test-case-actions'

import { getConvertedTemplateTestCaseData, getTemplateTestCasesWithSteps } from './create-from-template-helpers'
import { loadTestCaseFormResourceResponses } from '../test-case-route-resource-helpers'

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
