import { getAllTestSuiteTestCasesAction } from '@/actions/test-run/test-run-actions'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { TestCase, TestSuite } from '@prisma/client'
import React from 'react'
import TestRunForm from '../test-run-form'

const CreateTestRun = async () => {
  const { data: testSuiteTestCases, error: testSuiteTestCasesError } = await getAllTestSuiteTestCasesAction()

  if (testSuiteTestCasesError) {
    return <div>Error: {testSuiteTestCasesError}</div>
  }

  const testSuiteTestCasesData = testSuiteTestCases as (TestSuite & { testCases: TestCase[] })[]

  return (
    <>
      <PageHeader>Create Test Run</PageHeader>
      <HeaderSubtitle>Create a new test run to execute your test cases</HeaderSubtitle>
      {/* <TestRunForm
        testSuiteTestCases={testSuiteTestCasesData}
        onSubmitAction={createTestRunAction}
        successTitle="Test Run Created"
        successMessage="The test run has been created successfully"
      /> */}
    </>
  )
}

export default CreateTestRun
