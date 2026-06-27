import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'
import { getAllTagsAction } from '@/actions/tags/tag-actions'
import { getAllTestSuiteTestCasesAction } from '@/actions/test-run/test-run-actions'

import { getEnvironmentRows, getTagRows, getTestSuitePickerRows } from './test-run-form-helpers'

export type CreateTestRunPageData =
  | { status: 'error'; message: string }
  | {
      status: 'success'
      testSuites: ReturnType<typeof getTestSuitePickerRows>
      environments: ReturnType<typeof getEnvironmentRows>
      tags: ReturnType<typeof getTagRows>
    }

export async function loadCreateTestRunPageData(): Promise<CreateTestRunPageData> {
  const [{ data: environments, error: environmentsError }, { data: tags, error: tagsError }] = await Promise.all([
    getAllEnvironmentsAction(),
    getAllTagsAction(),
  ])

  if (environmentsError || tagsError) {
    return { status: 'error', message: environmentsError || tagsError || 'Failed to load page data' }
  }

  const { data: testSuites, error: testSuitesError } = await getAllTestSuiteTestCasesAction()

  if (testSuitesError) {
    return { status: 'error', message: testSuitesError }
  }

  return {
    status: 'success',
    testSuites: getTestSuitePickerRows(testSuites),
    environments: getEnvironmentRows(environments),
    tags: getTagRows(tags),
  }
}
