import { getAllLocatorsAction } from '@/actions/locator/locator-actions'
import { CollectionHeader, CollectionResults, collectionLoadError } from '@/components/data-state/collection-layout'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { getLocatorTableRows } from './locator-helpers'
import LocatorTable from './locator-table'

export const metadata: Metadata = {
  title: 'Appraise | Locators',
  description: 'Manage locators for identifying elements on pages',
}

export default async function Locators() {
  const response = await getAllLocatorsAction()
  const rows = getLocatorTableRows(response.data)

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <CollectionHeader title="Locators">
        <Button render={<Link href="/locators/create" />} nativeButton={false} className="rounded-xl">
          <Plus aria-hidden="true" data-icon="inline-start" />
          New locator
        </Button>
      </CollectionHeader>
      <CollectionResults
        emptyTitle="No locators yet"
        errorTitle="Couldn’t load locators"
        error={collectionLoadError(response)}
      >
        {rows.length > 0 ? <LocatorTable rows={rows} /> : null}
      </CollectionResults>
    </div>
  )
}
