import { getAllStepBlocksAction } from '@/actions/step-block/step-block-actions'
import EmptyState from '@/components/data-state/empty-state'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Metadata } from 'next'
import { Suspense } from 'react'
import { Blocks } from 'lucide-react'

import { getStepBlockRows } from './step-block-helpers'
import StepBlockTable from './step-block-table'

export const metadata: Metadata = {
  title: 'Appraise | Step Blocks',
  description: 'Create reusable step blocks from ordered template step sequences',
}

const StepBlocks = async () => {
  const { data, error } = await getAllStepBlocksAction()

  if (error) {
    return <div>Error: {error}</div>
  }

  const stepBlocks = getStepBlockRows(data)

  if (stepBlocks.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-20rem)] items-center justify-center">
        <EmptyState
          icon={<Blocks className="size-8" />}
          title="No step blocks found"
          description="Create a reusable ordered block from existing template steps"
          createRoute="/step-blocks/create"
          createText="Create Step Block"
        />
      </div>
    )
  }

  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Blocks className="mr-2 size-8" />
            Step Blocks
          </span>
        </PageHeader>
        <HeaderSubtitle>Reusable ordered template-step sequences for validation authoring</HeaderSubtitle>
      </div>
      <Suspense fallback={<DataTableSkeleton />}>
        <StepBlockTable />
      </Suspense>
    </>
  )
}

export default StepBlocks
