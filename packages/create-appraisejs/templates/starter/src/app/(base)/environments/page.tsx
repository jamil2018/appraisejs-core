import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import React from 'react'
import { Server } from 'lucide-react'
import EnvironmentTable from './environment-table'
import { Suspense } from 'react'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'
import EmptyState from '@/components/data-state/empty-state'
import { Metadata } from 'next'
import { getEnvironmentTableRows } from './environment-helpers'

export const metadata: Metadata = {
  title: 'Appraise | Environments',
  description: 'Manage test environments and their configurations',
}

const Environments = async () => {
  const { data: environments, error: environmentsError } = await getAllEnvironmentsAction()

  if (environmentsError) {
    return <div>Error: {environmentsError}</div>
  }

  const environmentsData = getEnvironmentTableRows(environments)

  if (!environmentsData || environmentsData.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-20rem)] items-center justify-center">
        <EmptyState
          icon={<Server className="size-8" />}
          title="No environments found"
          description="Get started by creating an environment to manage your test configurations"
          createRoute="/environments/create"
          createText="Create Environment"
        />
      </div>
    )
  }

  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Server className="mr-2 size-8" />
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
