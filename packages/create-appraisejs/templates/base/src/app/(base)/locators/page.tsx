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

  if (!locatorsData || locatorsData.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-20rem)] items-center justify-center">
        <EmptyState
          icon={<Code className="size-8" />}
          title="No locators found"
          description="Get started by creating a locator to identify elements on your pages"
          createRoute="/locators/create"
          createText="Create Locator"
        />
      </div>
    )
  }

  return (
    <>
      <div className="mb-8">
        <div>
          <PageHeader>
            <span className="flex items-center">
              <Code className="mr-2 size-8" />
              Locators
            </span>
          </PageHeader>
          <HeaderSubtitle>Locators are the elements that are used to identify the elements on the page</HeaderSubtitle>
        </div>
      </div>
      <Suspense fallback={<DataTableSkeleton />}>
        <LocatorTable />
      </Suspense>
    </>
  )
}

export default Locators
