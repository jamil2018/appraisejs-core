import { createTestSuiteAction } from '@/actions/test-suite/test-suite-actions'
import { TestSuiteForm } from '../test-suite-form'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { getAllTestCasesAction } from '@/actions/test-case/test-case-actions'
import { Module, TestCase } from '@prisma/client'
import { getAllModulesAction } from '@/actions/modules/module-actions'

const CreateTestSuite = async () => {
  const { data: testCases, error: testCasesError } = await getAllTestCasesAction()

  const { data: moduleList, error: moduleListError } = await getAllModulesAction()

  if (testCasesError || moduleListError) {
    return <div>Error: {testCasesError || moduleListError}</div>
  }

  return (
    <>
      <div className="mb-8">
        <PageHeader>Create Test Suite</PageHeader>
        <HeaderSubtitle>Create a new test suite to run your tests against</HeaderSubtitle>
      </div>
      <TestSuiteForm
        successTitle="Suite created"
        successMessage="Test suite created successfully"
        onSubmitAction={createTestSuiteAction}
        testCases={testCases as TestCase[]}
        moduleList={moduleList as Module[]}
      />
    </>
  )
}

export default CreateTestSuite
