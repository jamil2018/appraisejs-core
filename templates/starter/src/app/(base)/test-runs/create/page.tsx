import { createTestRunAction } from '@/actions/test-run/test-run-actions'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import React from 'react'
import TestRunForm from '../test-run-form'
import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'
import { getAllTagsAction } from '@/actions/tags/tag-actions'
import { Metadata } from 'next'
import { getAllTestSuiteTestCasesAction } from '@/actions/test-run/test-run-actions'
import { getEnvironmentRows, getTagRows, getTestSuitePickerRows } from '../test-run-form-helpers'

export const metadata: Metadata = {
  title: 'Appraise | Create Test Run',
  description: 'Create a new test run to execute your selected suites or tagged tests',
}

const CreateTestRun = async () => {
  const { data: testSuites, error: testSuitesError } = await getAllTestSuiteTestCasesAction()
  if (testSuitesError) {
    return <div>Error: {testSuitesError}</div>
  }

  const [{ data: environments, error: environmentsError }, { data: tags, error: tagsError }] = await Promise.all([
    getAllEnvironmentsAction(),
    getAllTagsAction(),
  ])

  if (environmentsError || tagsError) {
    return <div>Error: {environmentsError || tagsError}</div>
  }

  const testSuitesData = getTestSuitePickerRows(testSuites)
  const environmentsData = getEnvironmentRows(environments)
  const tagsData = getTagRows(tags)

  return (
    <>
      <div className="mb-8">
        <PageHeader>Create Test Run</PageHeader>
        <HeaderSubtitle>Create a new test run to execute selected suites or tagged tests</HeaderSubtitle>
      </div>
      <TestRunForm
        testSuites={testSuitesData}
        environments={environmentsData}
        tags={tagsData}
        onSubmitAction={createTestRunAction}
        successTitle="Test Run Created"
        successMessage="The test run has been created successfully"
      />
    </>
  )
}

export default CreateTestRun
