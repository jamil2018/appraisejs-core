import AuthoringLoadError from '@/components/data-state/authoring-load-error'
import PageHeader from '@/components/typography/page-header'
import React from 'react'
import TestCaseForm from '../test-case-form'
import { createTestCaseAction } from '@/actions/test-case/test-case-actions'
import { createTagAction } from '@/actions/tags/tag-actions'
import { createTestSuiteAction } from '@/actions/test-suite/test-suite-actions'
import { Metadata } from 'next'
import { requireActiveProjectForMutation } from '@/lib/active-project'
import { withProjectScope } from '@/lib/project-scope'

import {
  getTestCaseFormRouteResources,
  getTestCaseRouteLoadError,
  loadTestCaseFormResourceResponses,
} from '../test-case-route-resource-helpers'

export const metadata: Metadata = {
  title: 'Appraise | Create Test Case',
  description: 'Create a new test from scratch to execute against your application',
}

const CreateTestCase = async () => {
  const project = await requireActiveProjectForMutation()
  const resourceResponses = await loadTestCaseFormResourceResponses()
  const loadError = getTestCaseRouteLoadError(Object.values(resourceResponses))

  if (loadError) {
    return (
      <AuthoringLoadError
        title="Create New Test Case"
        listHref="/test-cases"
        listLabel="Back to test cases"
        message={loadError}
      />
    )
  }

  const resources = getTestCaseFormRouteResources(resourceResponses)

  return (
    <div>
      <div className="mb-3">
        <PageHeader>Create New Test Case</PageHeader>
      </div>
      <TestCaseForm
        defaultNodesOrder={{}}
        {...resources}
        onSubmitAction={createTestCaseAction}
        returnPath={withProjectScope('/test-cases', project.id)}
        onCreateTestSuiteAction={createTestSuiteAction}
        onCreateTagAction={createTagAction}
      />
    </div>
  )
}

export default CreateTestCase
