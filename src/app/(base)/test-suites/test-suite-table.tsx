import { DataTable } from '@/components/ui/data-table'
import React from 'react'
import { testSuiteTableCols } from './test-suite-table-columns'
import { getAllTestSuitesAction, deleteTestSuiteAction } from '@/actions/test-suite/test-suite-actions'

import { getTestSuiteTableRows } from './test-suite-helpers'

const TestSuiteTable = async () => {
  const { data: testSuites, error: testSuitesError } = await getAllTestSuitesAction()

  if (testSuitesError) {
    return <div>Error: {testSuitesError}</div>
  }

  const rows = getTestSuiteTableRows(testSuites)

  return (
    <>
      <DataTable
        columns={testSuiteTableCols}
        data={rows}
        filterColumn="name"
        filterPlaceholder="Filter by name..."
        createLink="/test-suites/create"
        modifyLink="/test-suites/modify"
        deleteAction={deleteTestSuiteAction}
      />
    </>
  )
}

export default TestSuiteTable
