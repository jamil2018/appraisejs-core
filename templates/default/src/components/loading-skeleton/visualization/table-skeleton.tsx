import { Skeleton } from '@/components/ui/skeleton'
import React from 'react'

const TableSkeleton = () => {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}

export default TableSkeleton
