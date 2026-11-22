import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { FileCheck } from 'lucide-react'
import { Metadata } from 'next'
import ReportTable from './report-table'
import EmptyState from '@/components/data-state/empty-state'
import { getAllReportsAction } from '@/actions/reports/report-actions'
import { isValidReportList } from './report-detail-helpers'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Appraise | Reports',
  description: 'Manage reports for test runs',
}

const Reports = async () => {
  const { data: reports, error: reportsError } = await getAllReportsAction()

  if (reportsError) {
    return <div>Error: {reportsError}</div>
  }

  if (!reports || !isValidReportList(reports)) {
    return <div>Error: Invalid report data format</div>
  }

  return (
    <>
      <div className="mb-4">
        <PageHeader>
          <span className="flex items-center">
            <FileCheck className="mr-2 size-8 shrink-0" />
            Reports
          </span>
        </PageHeader>
        <HeaderSubtitle>Review test execution details, identify patterns, and optimize performance</HeaderSubtitle>
      </div>
      {reports.length === 0 ? (
        <EmptyState
          icon={<FileCheck className="size-5" />}
          title="No completed-run reports yet"
          description="Reports appear after a run completes. Start with a guided Quality Journey, or prepare an independent manual run if tests already exist."
          createRoute="/quality-journeys/new"
          createText="Start a Quality Journey"
        >
          <Button variant="outline" render={<Link href="/test-runs/create" />} nativeButton={false}>
            Prepare an independent run
          </Button>
        </EmptyState>
      ) : (
        <ReportTable reports={reports} />
      )}
    </>
  )
}

export default Reports
