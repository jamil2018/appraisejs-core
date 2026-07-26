import { createTestCaseAction } from '@/actions/test-case/test-case-actions'
import { createTagAction } from '@/actions/tags/tag-actions'
import { createTestSuiteAction } from '@/actions/test-suite/test-suite-actions'

import TestCaseForm from '../test-case-form'
import type { TestCaseFormRouteResources } from '../test-case-route-resource-helpers'
import type { TemplateTestCaseWithSteps } from './create-from-template-types'
import type { getConvertedTemplateTestCaseData } from './create-from-template-conversion-helpers'

type CreateFromTemplateFormProps = {
  resources: TestCaseFormRouteResources
  templateTestCases: TemplateTestCaseWithSteps[]
  selectedTemplateTestCase: TemplateTestCaseWithSteps | null
  convertedTemplateData: ReturnType<typeof getConvertedTemplateTestCaseData>['convertedData'] | null
}

export function CreateFromTemplateForm({
  resources,
  templateTestCases,
  selectedTemplateTestCase,
  convertedTemplateData,
}: CreateFromTemplateFormProps) {
  return (
    <TestCaseForm
      defaultNodesOrder={convertedTemplateData?.nodesOrder ?? {}}
      {...resources}
      onSubmitAction={createTestCaseAction}
      onCreateTestSuiteAction={createTestSuiteAction}
      onCreateTagAction={createTagAction}
      templateTestCases={templateTestCases}
      defaultTemplateTestCaseId={selectedTemplateTestCase?.id}
      defaultTitle={selectedTemplateTestCase?.name || ''}
      defaultDescription={selectedTemplateTestCase?.description || ''}
      defaultTestSuiteIds={convertedTemplateData?.testSuiteIds}
    />
  )
}
