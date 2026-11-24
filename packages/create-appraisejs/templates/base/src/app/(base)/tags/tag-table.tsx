import type { Tag } from '@prisma/client'
import { deleteTagAction } from '@/actions/tags/tag-actions'
import { DataTable } from '@/components/ui/data-table'

import { tagTableCols } from './tag-table-columns'

export default function TagTable({ rows }: { rows: Tag[] }) {
  const projectId = rows[0]?.targetProjectId
  const viewKey = typeof projectId === 'string' && projectId ? `tags:${projectId}` : undefined

  return (
    <DataTable
      key={viewKey}
      viewKey={viewKey}
      tableLabel="Tags"
      columns={tagTableCols}
      data={rows}
      filterColumn="name"
      filterPlaceholder="Search tags"
      modifyLink="/tags/modify"
      deleteAction={deleteTagAction}
      density="compact"
      initialColumnVisibility={{ createdAt: false }}
    />
  )
}
