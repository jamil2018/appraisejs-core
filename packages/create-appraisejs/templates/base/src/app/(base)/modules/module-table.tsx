import { deleteModuleAction } from '@/actions/modules/module-actions'
import { DataTable } from '@/components/ui/data-table'

import type { ModuleTableRow } from './module-helpers'
import { moduleTableCols } from './module-table-columns'

export default function ModuleTable({ rows }: { rows: ModuleTableRow[] }) {
  const projectId = rows[0]?.targetProjectId
  const viewKey = typeof projectId === 'string' && projectId ? `modules:${projectId}` : undefined

  return (
    <DataTable
      key={viewKey}
      viewKey={viewKey}
      tableLabel="Modules"
      columns={moduleTableCols}
      data={rows}
      filterColumn="name"
      filterPlaceholder="Search modules"
      modifyLink="/modules/modify"
      modifyLinkProjectId={projectId}
      deleteAction={deleteModuleAction}
      density="compact"
      initialColumnVisibility={{ createdAt: false }}
    />
  )
}
