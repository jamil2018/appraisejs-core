import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Code } from 'lucide-react'
import LocatorTable from './locator-table'
import { Suspense } from 'react'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import { getAllLocatorsAction } from '@/actions/locator/locator-actions'
import EmptyState from '@/components/data-state/empty-state'
import { Metadata } from 'next'
import { getLocatorTableRows } from './locator-helpers'

export const metadata: Metadata = {
  title: 'Appraise | Locators',
  description: 'Manage locators for identifying elements on pages',
}

const Locators = async () => {
  const { data: locators, error: locatorsError } = await getAllLocatorsAction()

  if (locatorsError) {
    return <div>Error: {locatorsError}</div>
  }

  const locatorsData = getLocatorTableRows(locators)

  return (
    <div className="min-w-0 space-y-4">
      <div className="min-w-0">
        <div>
          <PageHeader>
            <span className="flex items-center gap-2">
              <Code className="size-7 shrink-0 sm:size-8" />
              Locators
            </span>
          </PageHeader>
          <HeaderSubtitle>Locators are the elements that are used to identify the elements on the page</HeaderSubtitle>
        </div>
      </div>
      {!locatorsData || locatorsData.length === 0 ? (
        <EmptyState
          icon={<Code className="size-5" />}
          title="No locators found"
          description="Get started by creating a locator to identify elements on your pages"
          createRoute="/locators/create"
          createText="Create Locator"
        />
      ) : (
        <Suspense fallback={<DataTableSkeleton />}>
          <LocatorTable />
        </Suspense>
      )}
    </div>
  )
}

export default Locators
