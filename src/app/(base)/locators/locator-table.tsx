import { deleteLocatorAction } from '@/actions/locator/locator-actions'
import { DataTable } from '@/components/ui/data-table'

import type { LocatorTableRow } from './locator-helpers'
import { locatorTableCols } from './locator-table-columns'

export default function LocatorTable({ rows }: { rows: LocatorTableRow[] }) {
  return (
    <DataTable
      tableLabel="Locators"
      columns={locatorTableCols}
      data={rows}
      filterColumn="name"
      filterPlaceholder="Search locators"
      modifyLink="/locators/modify"
      deleteAction={deleteLocatorAction}
      density="compact"
      initialColumnVisibility={{ createdAt: false }}
      key={`locators:${rows[0].targetProjectId}`}
      viewKey={`locators:${rows[0].targetProjectId}`}
    />
  )
}
