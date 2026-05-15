import { createTestRunAction } from '@/actions/test-run/test-run-actions'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import React from 'react'
import TestRunForm from '../test-run-form'
import { Metadata } from 'next'

import { loadCreateTestRunPageData } from '../create-test-run-page-data'

export const metadata: Metadata = {
  title: 'Appraise | Create Test Run',
  description: 'Create a new test run to execute your selected suites or tagged tests',
}

const CreateTestRun = async () => {
  const pageData = await loadCreateTestRunPageData()

  if (pageData.status === 'error') {
    return <div>Error: {pageData.message}</div>
  }

  return (
    <>
      <div className="mb-8">
        <PageHeader>Create Test Run</PageHeader>
        <HeaderSubtitle>Create a new test run to execute selected suites or tagged tests</HeaderSubtitle>
      </div>
      <TestRunForm
        testSuites={pageData.testSuites}
        environments={pageData.environments}
        tags={pageData.tags}
        onSubmitAction={createTestRunAction}
        successTitle="Test Run Created"
        successMessage="The test run has been created successfully"
      />
    </>
  )
}

export default CreateTestRun
