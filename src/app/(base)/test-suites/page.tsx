import { getAllTestSuitesAction } from '@/actions/test-suite/test-suite-actions'
import EmptyTube from '@/assets/icons/empty-tube'
import { TubePlus } from '@/assets/icons/tube-plus'
import { CollectionEmpty, CollectionHeader } from '@/components/data-state/collection-layout'
import InfoGrid from '@/components/data-visualization/info-grid'
import { Button } from '@/components/ui/button'
import { Plus, Tag } from 'lucide-react'
import Link from 'next/link'
import { requireActiveProjectForMutation } from '@/lib/active-project'
import { withProjectScope } from '@/lib/project-scope'
import type { Metadata } from 'next'

import { buildTestSuiteInfoCards, getTestSuiteTableRows } from './test-suite-helpers'
import TestSuiteTable from './test-suite-table'

export const metadata: Metadata = {
  title: 'Appraise | Test Suites',
  description: 'Manage test suites and their configurations',
}

export default async function TestSuites() {
  const project = await requireActiveProjectForMutation()
  const { data, error } = await getAllTestSuitesAction()
  const rows = getTestSuiteTableRows(data)

  if (error) return <div role="alert">Error: {error}</div>

  const infoCards = buildTestSuiteInfoCards(rows).map(card => ({
    ...card,
    icon:
      card.legend === 'Empty test suite(s)' ? (
        <EmptyTube className="size-12 rounded-sm bg-muted p-2" />
      ) : card.legend === 'Latest test suite' ? (
        <TubePlus className="size-12 rounded-sm bg-muted p-2" />
      ) : (
        <Tag className="size-12 rounded-sm bg-muted p-2" />
      ),
  }))

  return (
    <div className="min-w-0 space-y-4">
      <CollectionHeader title="Test Suites">
        <Button render={<Link href={withProjectScope('/test-suites/create', project.id)} />} nativeButton={false}>
          <Plus aria-hidden="true" /> New test suite
        </Button>
      </CollectionHeader>
      {rows.length === 0 ? (
        <CollectionEmpty title="No test suites yet" />
      ) : (
        <>
          <details className="rounded-xl border border-border bg-card px-4 py-2 text-sm">
            <summary className="app-focus cursor-pointer font-medium">Suite overview</summary>
            <InfoGrid infoCards={infoCards} />
          </details>
          <TestSuiteTable rows={rows} />
        </>
      )}
    </div>
  )
}
