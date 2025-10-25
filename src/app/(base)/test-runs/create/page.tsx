import { createTestRunAction, getAllTestSuiteTestCasesAction } from '@/actions/test-run/test-run-actions'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Environment, TestCase, TestSuite } from '@prisma/client'
import React from 'react'
import TestRunForm from '../test-run-form'
import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'

const CreateTestRun = async () => {
  const { data: testSuiteTestCases, error: testSuiteTestCasesError } = await getAllTestSuiteTestCasesAction()

  if (testSuiteTestCasesError) {
    return <div>Error: {testSuiteTestCasesError}</div>
  }

  const testSuiteTestCasesData = testSuiteTestCases as (TestSuite & { testCases: TestCase[] })[]

  const { data: environments, error: environmentsError } = await getAllEnvironmentsAction()

  if (environmentsError) {
    return <div>Error: {environmentsError}</div>
  }
  return (
    <>
      <div className="mb-8">
        <PageHeader>Create Test Run</PageHeader>
        <HeaderSubtitle>Create a new test run to execute your test cases</HeaderSubtitle>
      </div>
      <TestRunForm
        testSuiteTestCases={testSuiteTestCasesData}
        environments={environments as Environment[]}
        onSubmitAction={createTestRunAction}
        successTitle="Test Run Created"
        successMessage="The test run has been created successfully"
      />
    </>
  )
}

export default CreateTestRun
