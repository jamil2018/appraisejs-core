import { deleteLocatorGroupAction } from '@/actions/locator-groups/locator-group-actions'
import { DataTable } from '@/components/ui/data-table'
import type { LocatorGroup, Module } from '@prisma/client'

import { locatorGroupTableCols } from './locator-group-table-columns'

export default function LocatorGroupTable({ rows }: { rows: (LocatorGroup & { module: Module })[] }) {
  return (
    <DataTable
      tableLabel="Locator groups"
      columns={locatorGroupTableCols}
      data={rows}
      filterColumn="name"
      filterPlaceholder="Search locator groups"
      modifyLink="/locator-groups/modify"
      deleteAction={deleteLocatorGroupAction}
      density="compact"
      initialColumnVisibility={{ createdAt: false }}
      key={`locator-groups:${rows[0].targetProjectId}`}
      viewKey={`locator-groups:${rows[0].targetProjectId}`}
    />
  )
}
