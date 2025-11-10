import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import React from 'react'
import { Group } from 'lucide-react'
import LocatorGroupTable from './locator-group-table'
import { Suspense } from 'react'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import { getAllLocatorGroupsAction } from '@/actions/locator-groups/locator-group-actions'
import EmptyState from '@/components/data-state/empty-state'
import { LocatorGroup } from '@prisma/client'

const LocatorGroups = async () => {
  const { data: locatorGroups, error: locatorGroupsError } = await getAllLocatorGroupsAction()

  if (locatorGroupsError) {
    return <div>Error: {locatorGroupsError}</div>
  }

  const locatorGroupsData = locatorGroups as LocatorGroup[]

  if (!locatorGroupsData || locatorGroupsData.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-20rem)] items-center justify-center">
        <EmptyState
          icon={<Group className="h-8 w-8" />}
          title="No locator groups found"
          description="Get started by creating a locator group to organize your locators"
          createRoute="/locator-groups/create"
          createText="Create Locator Group"
        />
      </div>
    )
  }

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
