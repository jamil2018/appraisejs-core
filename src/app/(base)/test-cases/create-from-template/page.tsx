import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { LayoutPanelTop } from 'lucide-react'
import React from 'react'
import { Metadata } from 'next'
import { getTestCaseFormRouteResources, getTestCaseRouteLoadError } from '../test-case-route-resource-helpers'
import { listReferencedStepDefinitionOptionsAction } from '@/actions/step-definition/step-definition-actions'

import { CreateFromTemplateForm } from './create-from-template-form'
import {
  loadCreateFromTemplateRouteResources,
  collectTemplateStepReferences,
  resolveTemplateTestCaseSelection,
} from './create-from-template-route-helpers'
import { getTemplateTestCasesWithSteps } from './create-from-template-helpers'

export const metadata: Metadata = {
  title: 'Appraise | Create Test Case From Template',
  description: 'Select a template test case to create a new test case from',
}

const CreateTestCaseFromTemplate = async ({
  searchParams,
}: {
  searchParams?: Promise<{ templateTestCaseId?: string }>
}) => {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const selectedTemplateTestCaseId = resolvedSearchParams.templateTestCaseId ?? ''

  const { templateTestCasesResponse, resourceResponses } = await loadCreateFromTemplateRouteResources()
  const templateTestCases = getTemplateTestCasesWithSteps(templateTestCasesResponse.data)
  const editorDefinitionsResponse = await listReferencedStepDefinitionOptionsAction(
    collectTemplateStepReferences(templateTestCases),
  )
  const loadError = getTestCaseRouteLoadError([
    templateTestCasesResponse,
    ...Object.values(resourceResponses),
    editorDefinitionsResponse,
  ])

  if (loadError) {
    return <div>Error: {loadError}</div>
  }

  const { selectedTemplateTestCase, convertedTemplateData, conversionError } = resolveTemplateTestCaseSelection(
    templateTestCases,
    selectedTemplateTestCaseId,
  )

  if (selectedTemplateTestCase && (!convertedTemplateData || conversionError)) {
    return <div>{conversionError || 'Invalid template test case'}</div>
  }

  const resources = getTestCaseFormRouteResources({ ...resourceResponses, editorDefinitionsResponse })

  return (
    <div>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <LayoutPanelTop className="mr-2 size-8" />
            Create Test Case From Template
          </span>
        </PageHeader>
        <HeaderSubtitle>Select a template, add the test details, then refine the generated flow</HeaderSubtitle>
      </div>
      <CreateFromTemplateForm
        resources={resources}
        templateTestCases={templateTestCases}
        selectedTemplateTestCase={selectedTemplateTestCase}
        convertedTemplateData={convertedTemplateData}
      />
    </div>
  )
}

export default CreateTestCaseFromTemplate
