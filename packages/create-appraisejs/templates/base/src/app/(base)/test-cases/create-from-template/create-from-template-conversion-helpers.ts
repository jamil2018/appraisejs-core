import {
  templateTestCaseToTestCaseConverter,
  validateConvertedTestCaseData,
  type ConvertedTestCaseData,
} from '@/lib/transformers/template-test-case-converter'

import type { TemplateTestCaseWithSteps } from './create-from-template-types'

export function getConvertedTemplateTestCaseData(templateTestCase: TemplateTestCaseWithSteps): {
  convertedData: ConvertedTestCaseData | null
  error: string | null
} {
  const convertedData = templateTestCaseToTestCaseConverter(templateTestCase)
  const validation = validateConvertedTestCaseData(convertedData)

  if (!validation.isValid) {
    return {
      convertedData: null,
      error: validation.errors[0] || 'Invalid test case',
    }
  }

  return {
    convertedData,
    error: null,
  }
}
