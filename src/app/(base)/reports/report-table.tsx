import { DataTable } from '@/components/ui/data-table'
import { reportTableCols } from './report-table-columns'
import { getAllReportsAction } from '@/actions/reports/report-actions'
import { TestCase, Tag, TestRun, ReportTestCase, TestRunTestCase, Report } from '@prisma/client'

const ReportTable = async () => {
  const { data: reports, error: reportsError } = await getAllReportsAction()

  if (reportsError) {
    return <div>Error: {reportsError}</div>
  }

  return (
    <>
      <DataTable
        columns={reportTableCols}
        data={
          reports as (Report & {
            testRun: TestRun
            tags?: Tag[]
            reportTestCases: (ReportTestCase & {
              testRunTestCase: TestRunTestCase
              testCase: TestCase & { tags?: Tag[] }
            })[]
          })[]
        }
        filterColumn="Test Case"
        filterPlaceholder="Filter by title..."
      />
    </>
  )
}

export default ReportTable
