import { DataTable } from '@/components/ui/data-table'
import { deleteTagAction, getAllTagsAction } from '@/actions/tags/tag-actions'
import { Tag } from '@prisma/client'
import React from 'react'
import { tagTableCols } from './tag-table-columns'

const TagTable = async () => {
  const { data: tags, error: tagsError } = await getAllTagsAction()

  if (tagsError) {
    return <div>Error: {tagsError}</div>
  }

  return (
    <>
      <DataTable
        columns={tagTableCols}
        data={tags as Tag[]}
        filterColumn="name"
        filterPlaceholder="Filter by name..."
        createLink="/tags/create"
        modifyLink="/tags/modify"
        deleteAction={deleteTagAction}
      />
    </>
  )
}

export default TagTable
