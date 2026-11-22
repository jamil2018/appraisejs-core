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
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Appraise | Locator Groups',
  description: 'Manage locator groups for organizing locators',
}

const LocatorGroups = async () => {
  const { data: locatorGroups, error: locatorGroupsError } = await getAllLocatorGroupsAction()

  if (locatorGroupsError) {
    return <div>Error: {locatorGroupsError}</div>
  }

  const locatorGroupsData = locatorGroups as LocatorGroup[]

  return (
    <div className="min-w-0 space-y-4">
      <div className="min-w-0">
        <div>
          <PageHeader>
            <span className="flex items-center gap-2">
              <Group className="size-7 shrink-0 sm:size-8" />
              Locator Groups
            </span>
          </PageHeader>
          <HeaderSubtitle>Organize locators for better maintainability and reusability</HeaderSubtitle>
        </div>
      </div>
      {!locatorGroupsData || locatorGroupsData.length === 0 ? (
        <EmptyState
          icon={<Group className="size-5" />}
          title="No locator groups found"
          description="Get started by creating a locator group to organize your locators"
          createRoute="/locator-groups/create"
          createText="Create Locator Group"
        />
      ) : (
        <Suspense fallback={<DataTableSkeleton />}>
          <LocatorGroupTable />
        </Suspense>
      )}
    </div>
  )
}

export default LocatorGroups
