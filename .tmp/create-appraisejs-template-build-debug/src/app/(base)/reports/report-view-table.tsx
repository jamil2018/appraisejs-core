import { DataTable } from '@/components/ui/data-table'
import { reportViewTableCols } from './report-view-table-columns'
import { Prisma } from '@prisma/client'

type ReportDetailWithRelations = Prisma.ReportGetPayload<{
  include: {
    testRun: {
      include: {
        environment: true
        tags: true
      }
    }
    features: {
      include: {
        tags: true
        scenarios: {
          include: {
            tags: true
            steps: true
            hooks: true
          }
        }
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
            tags: true
            steps: {
              orderBy: {
                order: 'asc'
              }
            }
            hooks: true
          }
        }
      }
    }
  }
}>

interface ReportViewTableProps {
  report: ReportDetailWithRelations
}

const ReportViewTable = ({ report }: ReportViewTableProps) => {
  // Type guard to validate the data structure
  const isValidReportTestCaseData = (testCases: unknown): testCases is ReportDetailWithRelations['testCases'] => {
    if (!Array.isArray(testCases)) return false
    return testCases.every(
      item => item && typeof item === 'object' && 'id' in item && 'testRunTestCase' in item && 'reportScenario' in item,
    )
  }

  if (!isValidReportTestCaseData(report.testCases)) {
    return <div>Error: Invalid report test case data format</div>
  }

  return (
    <>
      <DataTable
        columns={reportViewTableCols}
        data={report.testCases}
        filterColumn="testCaseTitle"
        filterPlaceholder="Filter by test case title..."
        showSelectedRows={false}
      />
    </>
  )
}

export default ReportViewTable
