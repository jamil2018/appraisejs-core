import { createTestRunAction } from '@/actions/test-run/test-run-actions'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Environment, Tag } from '@prisma/client'
import React from 'react'
import TestRunForm from '../test-run-form'
import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'
import { getAllTagsAction } from '@/actions/tags/tag-actions'
import { Metadata } from 'next'
import { getAllTestSuiteTestCasesAction } from '@/actions/test-run/test-run-actions'
import { TestSuitePickerRow } from '@/types/test-suite-picker'

export const metadata: Metadata = {
  title: 'Appraise | Create Test Run',
  description: 'Create a new test run to execute selected suites or tagged tests',
}

const CreateTestRun = async () => {
  const { data: testSuites, error: testSuitesError } = await getAllTestSuiteTestCasesAction()
  const { data: environments, error: environmentsError } = await getAllEnvironmentsAction()
  const { data: tags, error: tagsError } = await getAllTagsAction()

  if (testSuitesError || environmentsError || tagsError) {
    return <div>Error: {testSuitesError || environmentsError || tagsError}</div>
  }

  const testSuitesData = testSuites as TestSuitePickerRow[]
  const environmentsData = environments as Environment[]
  const tagsData = tags as Tag[]

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
