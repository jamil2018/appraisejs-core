import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { FileCheck } from 'lucide-react'
import { Metadata } from 'next'
import ReportTable from './report-table'

export const metadata: Metadata = {
  title: 'Appraise | Reports',
  description: 'Manage reports for test runs',
}

const Reports = () => {
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
