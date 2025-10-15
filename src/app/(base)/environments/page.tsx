import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import React from 'react'
import { Server } from 'lucide-react'
import EnvironmentTable from './environment-table'
import { Suspense } from 'react'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'

const Environments = () => {
  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Server className="mr-2 h-8 w-8" />
            Environments
          </span>
        </PageHeader>
        <HeaderSubtitle>Manage test environments and their configurations</HeaderSubtitle>
      </div>
      <Suspense fallback={<DataTableSkeleton />}>
        <EnvironmentTable />
      </Suspense>
    </>
  )
}

export default Environments
