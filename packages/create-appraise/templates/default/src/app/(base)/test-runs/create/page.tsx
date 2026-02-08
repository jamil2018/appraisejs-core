import { createTestRunAction, getAllTestSuiteTestCasesAction } from '@/actions/test-run/test-run-actions'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Environment, Tag, TestCase, TestSuite } from '@prisma/client'
import React from 'react'
import TestRunForm from '../test-run-form'
import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'
import { getAllTagsAction } from '@/actions/tags/tag-actions'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Appraise | Create Test Run',
  description: 'Create a new test run to execute your test cases',
}

const CreateTestRun = async () => {
  const { data: testSuiteTestCases, error: testSuiteTestCasesError } = await getAllTestSuiteTestCasesAction()
  const { data: environments, error: environmentsError } = await getAllEnvironmentsAction()
  const { data: tags, error: tagsError } = await getAllTagsAction()

  if (testSuiteTestCasesError || environmentsError || tagsError) {
    return <div>Error: {testSuiteTestCasesError || environmentsError || tagsError}</div>
  }

  const testSuiteTestCasesData = testSuiteTestCases as (TestSuite & { testCases: TestCase[] })[]
  const environmentsData = environments as Environment[]
  const tagsData = tags as Tag[]

  return (
    <>
      <div className="mb-8">
        <PageHeader>Create Test Run</PageHeader>
        <HeaderSubtitle>Create a new test run to execute your test cases</HeaderSubtitle>
      </div>
      <TestRunForm
        testSuiteTestCases={testSuiteTestCasesData}
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
