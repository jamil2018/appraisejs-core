import { DataTable } from '@/components/ui/data-table'
import { reportTableCols } from './report-table-columns'
import { getAllReportsAction } from '@/actions/reports/report-actions'
import { Prisma } from '@prisma/client'
import { FileCheck } from 'lucide-react'
import EmptyState from '@/components/data-state/empty-state'

type ReportWithRelations = Prisma.ReportGetPayload<{
  include: {
    testRun: {
      include: {
        environment: true
        tags: true
      }
    }
    testCases: {
      include: {
        testRunTestCase: {
          include: {
            testCase: {
              include: {
                tags: true
              }
            }
          }
        }
        reportScenario: {
          include: {
            reportFeature: true
          }
        }
      }
    }
  }
}>

const ReportTable = async () => {
  const { data: reports, error: reportsError } = await getAllReportsAction()

  if (reportsError) {
    return <div>Error: {reportsError}</div>
  }

  // Type guard to validate the data structure
  const isValidReportData = (data: unknown): data is ReportWithRelations[] => {
    if (!Array.isArray(data)) return false
    return data.every(
      item =>
        item &&
        typeof item === 'object' &&
        'id' in item &&
        'testRun' in item &&
        'testCases' in item &&
        Array.isArray(item.testCases),
    )
  }

  if (!reports || !isValidReportData(reports)) {
    return <div>Error: Invalid report data format</div>
  }

  return (
    <>
      <DataTable
        columns={reportTableCols}
        data={reports}
        filterColumn="testRunName"
        filterPlaceholder="Filter by test run name..."
      />
    </>
  )
}

export default ReportTable
