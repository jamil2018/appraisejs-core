import { getTestSuiteByIdAction, updateTestSuiteAction } from '@/actions/test-suite/test-suite-actions'
import { TestSuiteForm } from '../../test-suite-form'
import React from 'react'
import { TestSuite, Tag } from '@prisma/client'
import { getAllTestCasesAction } from '@/actions/test-case/test-case-actions'
import { Module, TestCase } from '@prisma/client'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import { getAllTagsAction } from '@/actions/tags/tag-actions'

const ModifyTestSuite = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const { data: testSuite, error } = await getTestSuiteByIdAction(id)
  const { data: testCases } = await getAllTestCasesAction()

  const { data: moduleList, error: moduleListError } = await getAllModulesAction()

  const { data: tags, error: tagsError } = await getAllTagsAction()

  if (error || moduleListError || tagsError) {
    return <div>Error: {error || moduleListError || tagsError}</div>
  }

  const testSuiteData = testSuite as TestSuite & {
    testCases: TestCase[]
    module: Module
    tags: Tag[]
  }

  return (
    <TestSuiteForm
      defaultValues={{
        name: testSuiteData.name ?? '',
        description: testSuiteData.description ?? '',
        testCases: testSuiteData.testCases.map(testCase => testCase.id),
        moduleId: testSuiteData.moduleId ?? '',
        tagIds: testSuiteData.tags?.map(tag => tag.id) || [],
      }}
      successTitle="Suite updated"
      successMessage="Test suite updated successfully"
      onSubmitAction={updateTestSuiteAction}
      id={id}
      testCases={testCases as TestCase[]}
      moduleList={moduleList as Module[]}
      tags={tags as Tag[]}
    />
  )
}

export default ModifyTestSuite
