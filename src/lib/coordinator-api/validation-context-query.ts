import { z } from 'zod'

const validationResourceTypeSchema = z.enum([
  'modules',
  'testSuites',
  'testCases',
  'stepDefinitions',
  'locatorGroups',
  'locators',
  'environments',
])

export function parseValidationResourceTypes(searchParams: URLSearchParams) {
  return z
    .array(validationResourceTypeSchema)
    .optional()
    .parse(searchParams.get('resourceTypes')?.split(',').filter(Boolean))
}
