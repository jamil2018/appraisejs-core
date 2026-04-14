import { deleteTestSuiteAction } from '@/actions/test-suite/test-suite-actions'
import { DataTable } from '@/components/ui/data-table'
import { TestCase, Tag, TestSuiteMetrics, TestSuite } from '@prisma/client'
import { getAllTestSuiteMetricsAction } from '@/actions/reports/report-actions'
import { testSuitesMetricTableCols } from './test-suites-metric-table-columns'

const TestSuitesMetricTable = async ({ filter }: { filter: 'notExecutedRecently' }) => {
  const { data: testSuiteMetrics, error: testSuiteMetricsError } = await getAllTestSuiteMetricsAction(filter)

  if (testSuiteMetricsError) {
    return <div>Error: {testSuiteMetricsError}</div>
  }

  return (
    <>
      <DataTable
        columns={testSuitesMetricTableCols}
        data={testSuiteMetrics as (TestSuiteMetrics & { testSuite: TestSuite & { tags: Tag[]; testCases: TestCase[] } })[]}
        filterColumn="testSuite.name"
        filterPlaceholder="Filter by name..."
        deleteAction={deleteTestSuiteAction}
      />
    </>
  )
}

export default TestSuitesMetricTable
