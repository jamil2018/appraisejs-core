import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Button } from '@/components/ui/button'
import { FileCheck } from 'lucide-react'
import Link from 'next/link'

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
      <Button asChild>
        <Link href="/reports/1">View Report</Link>
      </Button>
    </>
  )
}

export default Reports
