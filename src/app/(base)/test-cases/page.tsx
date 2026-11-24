import { getAllTestCasesAction } from '@/actions/test-case/test-case-actions'
import PageHeader from '@/components/typography/page-header'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Empty, EmptyHeader } from '@/components/ui/empty'
import { CircleAlert } from 'lucide-react'
import type { Metadata } from 'next'

import { NewTestCaseMenu } from './new-test-case-menu'
import { getTestCaseRows } from './test-case-row-helpers'
import TestCaseTable from './test-case-table'

export const metadata: Metadata = {
  title: 'Appraise | Test Cases',
  description: 'Manage test cases and their configurations',
}

export default async function TestCases() {
  const { data, success, error, message } = await getAllTestCasesAction()
  const rows = getTestCaseRows(data)

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <PageHeader>Test Cases</PageHeader>
        <NewTestCaseMenu />
      </div>
      <TestCaseResults rows={rows} error={success ? undefined : error || message || 'Try refreshing this page.'} />
    </div>
  )
}

function TestCaseResults({ rows, error }: { rows: ReturnType<typeof getTestCaseRows>; error?: string }) {
  if (error) {
    return (
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Couldn’t load test cases</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (rows.length === 0) {
    return (
      <Empty className="items-start rounded-xl border border-solid border-border bg-card p-4 text-left md:p-4">
        <EmptyHeader className="items-start text-left">
          <h2 className="text-sm font-medium">No test cases yet</h2>
        </EmptyHeader>
      </Empty>
    )
  }

  return <TestCaseTable rows={rows} />
}
