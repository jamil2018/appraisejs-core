import { getAllModulesAction } from '@/actions/modules/module-actions'
import { CollectionEmpty, CollectionHeader } from '@/components/data-state/collection-layout'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import type { Metadata } from 'next'

import { getModuleTableRows } from './module-helpers'
import ModuleTable from './module-table'

export const metadata: Metadata = {
  title: 'Appraise | Modules',
  description: 'Manage application modules and their configurations',
}

export default async function Modules() {
  const { data, error } = await getAllModulesAction()
  const rows = getModuleTableRows(data)

  if (error) return <div role="alert">Error: {error}</div>

  return (
    <div className="min-w-0 space-y-4">
      <CollectionHeader title="Modules">
        <Button render={<Link href="/modules/create" />} nativeButton={false}>
          <Plus aria-hidden="true" /> New module
        </Button>
      </CollectionHeader>
      {rows.length === 0 ? <CollectionEmpty title="No modules yet" /> : <ModuleTable rows={rows} />}
    </div>
  )
}
