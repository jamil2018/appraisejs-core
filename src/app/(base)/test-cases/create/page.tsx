import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import React from 'react'
import TestCaseForm from '../test-case-form'
import { createTestCaseAction } from '@/actions/test-case/test-case-actions'
import { createTagAction } from '@/actions/tags/tag-actions'
import { createTestSuiteAction } from '@/actions/test-suite/test-suite-actions'
import { Metadata } from 'next'

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
  const resourceResponses = await loadTestCaseFormResourceResponses()
  const loadError = getTestCaseRouteLoadError(Object.values(resourceResponses))

  if (loadError) {
    return <div>Error: {loadError}</div>
  }

  const resources = getTestCaseFormRouteResources(resourceResponses)

  return (
    <div>
      <div className="mb-8">
        <PageHeader>Create New Test Case</PageHeader>
        <HeaderSubtitle>Create a new test from scratch to execute against your application</HeaderSubtitle>
      </div>
      <TestCaseForm
        defaultNodesOrder={{}}
        {...resources}
        onSubmitAction={createTestCaseAction}
        onCreateTestSuiteAction={createTestSuiteAction}
        onCreateTagAction={createTagAction}
      />
    </div>
  )
}

export default CreateTestCase
