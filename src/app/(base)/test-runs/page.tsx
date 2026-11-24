import { getAllTestRunsAction } from '@/actions/test-run/test-run-actions'
import { CollectionEmpty, CollectionHeader } from '@/components/data-state/collection-layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { Environment, Tag, TestRun, TestRunTestCase } from '@prisma/client'
import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import TestRunTable from './test-run-table'

export const metadata: Metadata = {
  title: 'Appraise | Test Runs',
  description: 'Manage test runs and their execution results',
}

type TestRunRow = TestRun & { testCases: TestRunTestCase[]; tags: Tag[]; environment: Environment }

export default async function TestRuns({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter } = await searchParams
  const { data, error, success, message } = await getAllTestRunsAction(filter)
  const rows =
    data && typeof data === 'object' && 'items' in data && Array.isArray(data.items) ? (data.items as TestRunRow[]) : []

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <CollectionHeader title="Test Runs">
        <Button render={<Link href="/test-runs/create" />} nativeButton={false} className="rounded-xl">
          <Plus aria-hidden="true" data-icon="inline-start" />
          Create Test Run
        </Button>
      </CollectionHeader>
      {filter === 'recentFailed' && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-lg border border-border bg-card px-2 py-1 text-muted-foreground">
            Recent failures
          </span>
          <Link href="/test-runs" className="app-focus rounded-md text-primary hover:underline">
            View all runs
          </Link>
        </div>
      )}
      {success === false || error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn’t load test runs</AlertTitle>
          <AlertDescription>{error || message || 'Try refreshing this page.'}</AlertDescription>
        </Alert>
      ) : rows.length === 0 ? (
        <CollectionEmpty title={filter === 'recentFailed' ? 'No recent failed runs' : 'No test runs yet'} />
      ) : (
        <TestRunTable initialData={rows} filter={filter === 'recentFailed' ? 'recentFailed' : 'all'} />
      )}
    </div>
  )
}
