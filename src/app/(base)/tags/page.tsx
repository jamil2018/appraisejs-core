import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Tag } from 'lucide-react'
import React, { Suspense } from 'react'
import TagTable from './tag-table'

const Tags = () => {
  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Tag className="mr-2 h-8 w-8" />
            Tags
          </span>
        </PageHeader>
        <HeaderSubtitle>Tags are used to categorize test cases and test runs</HeaderSubtitle>
      </div>
      <Suspense fallback={<DataTableSkeleton />}>
        <TagTable />
      </Suspense>
    </>
  )
}

export default Tags
