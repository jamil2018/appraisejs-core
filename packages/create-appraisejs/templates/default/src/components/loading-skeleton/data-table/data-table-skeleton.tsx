import React from 'react'
import IconButtonSkeleton from '../form/icon-button-skeleton'
import TextInputSkeleton from '../form/text-input-skeleton'
import ButtonSkeleton from '../form/button-skeleton'
import { Search } from 'lucide-react'
import TableSkeleton from '../visualization/table-skeleton'

const DataTableSkeleton = () => {
  return (
    <>
      <div className="flex justify-end">
        <div className="flex gap-2">
          <IconButtonSkeleton />
          <IconButtonSkeleton />
          <IconButtonSkeleton />
        </div>
      </div>
      <div className="mb-6 mt-4 flex justify-between">
        <div className="flex items-center gap-2">
          <Search className="mr-2 h-5 w-5" />
          <TextInputSkeleton />
        </div>
        <ButtonSkeleton />
      </div>
      <TableSkeleton />
    </>
  )
}

export default DataTableSkeleton
