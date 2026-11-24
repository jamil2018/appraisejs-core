import { getAllLocatorGroupsAction } from '@/actions/locator-groups/locator-group-actions'
import { CollectionHeader, CollectionResults, collectionLoadError } from '@/components/data-state/collection-layout'
import { Button } from '@/components/ui/button'
import type { LocatorGroup, Module } from '@prisma/client'
import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import LocatorGroupTable from './locator-group-table'

export const metadata: Metadata = {
  title: 'Appraise | Locator Groups',
  description: 'Manage locator groups for organizing locators',
}

export default async function LocatorGroups() {
  const response = await getAllLocatorGroupsAction()
  const rows = Array.isArray(response.data) ? (response.data as (LocatorGroup & { module: Module })[]) : []

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <CollectionHeader title="Locator Groups">
        <Button render={<Link href="/locator-groups/create" />} nativeButton={false} className="rounded-xl">
          <Plus aria-hidden="true" data-icon="inline-start" />
          New locator group
        </Button>
      </CollectionHeader>
      <CollectionResults
        emptyTitle="No locator groups yet"
        errorTitle="Couldn’t load locator groups"
        error={collectionLoadError(response)}
      >
        {rows.length > 0 ? <LocatorGroupTable rows={rows} /> : null}
      </CollectionResults>
    </div>
  )
}
