import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { FileCheck } from 'lucide-react'
import { Metadata } from 'next'
import ReportTable from './report-table'
import EmptyState from '@/components/data-state/empty-state'
import { getAllReportsAction } from '@/actions/reports/report-actions'
import { Prisma } from '@prisma/client'

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

export const metadata: Metadata = {
  title: 'Appraise | Reports',
  description: 'Manage reports for test runs',
}

const Reports = async () => {
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

  if (!reports || reports.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-20rem)] items-center justify-center">
        <EmptyState
          icon={<FileCheck className="h-8 w-8" />}
          title="No reports found"
          description="Get started by creating a test run to generate reports"
          createRoute="/test-runs/create"
          createText="Create Test Run"
        />
      </div>
    )
  }
  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <FileCheck className="mr-2 h-8 w-8" />
            Reports
          </span>
        </PageHeader>
        <HeaderSubtitle>Reports are the reports of the test runs.</HeaderSubtitle>
      </div>
      <ReportTable />
    </>
  )
}

export default Reports
