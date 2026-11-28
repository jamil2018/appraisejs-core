import { getAllTestCasesAction } from '@/actions/test-case/test-case-actions'
import { CollectionEmpty, CollectionHeader } from '@/components/data-state/collection-layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { CircleAlert } from 'lucide-react'
import type { Metadata } from 'next'
import { requireActiveProjectForMutation } from '@/lib/active-project'

import { NewTestCaseMenu } from './new-test-case-menu'
import { getTestCaseRows } from './test-case-row-helpers'
import TestCaseTable from './test-case-table'

export const metadata: Metadata = {
  title: 'Appraise | Test Cases',
  description: 'Manage test cases and their configurations',
}

export default async function TestCases() {
  const project = await requireActiveProjectForMutation()
  const { data, success, error, message } = await getAllTestCasesAction()
  const rows = getTestCaseRows(data)

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <CollectionHeader title="Test Cases">
        <NewTestCaseMenu projectId={project.id} />
      </CollectionHeader>
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

  if (rows.length === 0) return <CollectionEmpty title="No test cases yet" />

  return <TestCaseTable rows={rows} />
}
