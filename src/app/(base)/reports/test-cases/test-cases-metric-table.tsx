import { DataTable } from '@/components/ui/data-table'
import { testCasesMetricTableCols } from './test-cases-metric-table-columns'
import { TestCaseMetrics, TestCase, Tag } from '@prisma/client'
import { getAllTestCaseMetricsAction } from '@/actions/reports/report-actions'
import { deleteTestCaseAction } from '@/actions/test-case/test-case-actions'

const TestCasesMetricTable = async ({ filter, projectId }: { filter: 'repeatedlyFailing' | 'flaky'; projectId: string }) => {
  const { data: testCaseMetrics, error: testCaseMetricsError } = await getAllTestCaseMetricsAction(filter)

  if (testCaseMetricsError) {
    return <div>Error: {testCaseMetricsError}</div>
  }

  return (
    <>
      <DataTable
        tableLabel="Test case metrics"
        columns={testCasesMetricTableCols}
        data={testCaseMetrics as (TestCaseMetrics & { testCase: TestCase & { tags: Tag[] } })[]}
        filterColumn="testCase.title"
        filterPlaceholder="Filter by name..."
        deleteAction={deleteTestCaseAction}
        density="compact"
        viewKey={`report-cases:${projectId}:${filter}`}
      />
    </>
  )
}

export default TestCasesMetricTable
