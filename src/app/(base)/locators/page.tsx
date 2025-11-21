import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import React from 'react'
import { Code } from 'lucide-react'
import LocatorTable from './locator-table'
import { Suspense } from 'react'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import { getAllLocatorsAction } from '@/actions/locator/locator-actions'
import EmptyState from '@/components/data-state/empty-state'
import { Locator, LocatorGroup } from '@prisma/client'
import { Metadata } from 'next'
import { SyncLocatorsButton } from './sync-locators-button'

export const metadata: Metadata = {
  title: 'Appraise | Locators',
  description: 'Manage locators for identifying elements on pages',
}

const Locators = async () => {
  const { data: locators, error: locatorsError } = await getAllLocatorsAction()

  if (locatorsError) {
    return <div>Error: {locatorsError}</div>
  }

  const locatorsData = locators as (Locator & { locatorGroup: LocatorGroup })[]

  if (!locatorsData || locatorsData.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-20rem)] items-center justify-center">
        <EmptyState
          icon={<Code className="h-8 w-8" />}
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
        <div className="flex items-center justify-between">
          <div>
            <PageHeader>
              <span className="flex items-center">
                <Code className="mr-2 h-8 w-8" />
                Locators
              </span>
            </PageHeader>
            <HeaderSubtitle>Locators are the elements that are used to identify the elements on the page</HeaderSubtitle>
          </div>
          <SyncLocatorsButton />
        </div>
      </div>
      <Suspense fallback={<DataTableSkeleton />}>
        <LocatorTable />
      </Suspense>
    </>
  )
}

export default Locators
