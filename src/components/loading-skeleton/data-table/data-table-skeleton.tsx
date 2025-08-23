import React from 'react'
import IconButtonSkeleton from '../form/icon-button-skeleton'

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
    </>
  )
}

export default DataTableSkeleton
