import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import React from 'react'
import { Group } from 'lucide-react'
import LocatorGroupTable from './locator-group-table'
import { Suspense } from 'react'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'

const LocatorGroups = () => {
  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Group className="mr-2 h-8 w-8" />
            Locator Groups
          </span>
        </PageHeader>
        <HeaderSubtitle>
          Locator groups are used to group locators together. They are used to identify the elements on the page.
        </HeaderSubtitle>
      </div>
      <Suspense fallback={<DataTableSkeleton />}>
        <LocatorGroupTable />
      </Suspense>
    </>
  )
}

export default LocatorGroups
