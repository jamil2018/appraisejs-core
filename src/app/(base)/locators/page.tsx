import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import React from 'react'
import { Code } from 'lucide-react'
import LocatorTable from './locator-table'
import { Suspense } from 'react'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'

const Locators = () => {
  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Code className="mr-2 h-8 w-8" />
            Locators
          </span>
        </PageHeader>
        <HeaderSubtitle>Locators are the elements that are used to identify the elements on the page</HeaderSubtitle>
      </div>
      <Suspense fallback={<DataTableSkeleton />}>
        <LocatorTable />
      </Suspense>
    </>
  )
}

export default Locators
