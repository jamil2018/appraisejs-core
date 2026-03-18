import { createTestRunAction } from '@/actions/test-run/test-run-actions'
import { getAllTestCasesAction } from '@/actions/test-case/test-case-actions'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { TestCasePickerRow } from '@/types/test-case-picker'
import { Environment, Tag } from '@prisma/client'
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
  const { data: testCases, error: testCasesError } = await getAllTestCasesAction()
  const { data: environments, error: environmentsError } = await getAllEnvironmentsAction()
  const { data: tags, error: tagsError } = await getAllTagsAction()

  if (testCasesError || environmentsError || tagsError) {
    return <div>Error: {testCasesError || environmentsError || tagsError}</div>
  }

  const testCasesData = testCases as TestCasePickerRow[]
  const environmentsData = environments as Environment[]
  const tagsData = tags as Tag[]

  return (
    <>
      <div className="mb-8">
        <PageHeader>Create Test Run</PageHeader>
        <HeaderSubtitle>Create a new test run to execute your test cases</HeaderSubtitle>
      </div>
      <TestRunForm
        testCases={testCasesData}
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
