import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import React from 'react'
import TemplateStepTable from './template-step-table'
import { LayoutTemplate } from 'lucide-react'
import { Suspense } from 'react'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'

const TemplateSteps = () => {
  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <LayoutTemplate className="mr-2 h-8 w-8" />
            Template Steps
          </span>
        </PageHeader>
        <HeaderSubtitle>Template steps are the steps that are used to define a reusable test step</HeaderSubtitle>
      </div>
      <Suspense fallback={<DataTableSkeleton />}>
        <TemplateStepTable />
      </Suspense>
    </>
  )
}

export default TemplateSteps
