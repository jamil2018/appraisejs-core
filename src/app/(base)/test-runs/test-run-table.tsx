import { deleteTestRunAction, getAllTestRunsAction } from '@/actions/test-run/test-run-actions'
import { DataTable } from '@/components/ui/data-table'
import { Environment, Tag, TestRun, TestRunTestCase } from '@prisma/client'
import React from 'react'
import { testRunTableCols } from './test-run-table-columns'

const TestRunTable = async () => {
  const { data: testRuns, error: testRunsError } = await getAllTestRunsAction()

  if (testRunsError) {
    return <div>Error: {testRunsError}</div>
  }

  return (
    <>
      <DataTable
        columns={testRunTableCols}
        data={testRuns as (TestRun & { testCases: TestRunTestCase[]; tags: Tag[]; environment: Environment })[]}
        filterColumn="runId"
        filterPlaceholder="Filter by run ID..."
        deleteAction={deleteTestRunAction}
        createLink="/test-runs/create"
        viewLink="/test-runs/view"
      />
    </>
  )
}

export default TestRunTable
