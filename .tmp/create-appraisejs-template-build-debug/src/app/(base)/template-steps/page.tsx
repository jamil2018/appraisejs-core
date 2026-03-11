import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import TemplateStepTable from './template-step-table'
import { LayoutTemplate } from 'lucide-react'
import { Suspense } from 'react'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import { getAllTemplateStepsAction } from '@/actions/template-step/template-step-actions'
import EmptyState from '@/components/data-state/empty-state'
import { TemplateStep } from '@prisma/client'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Appraise | Template Steps',
  description: 'Manage template steps for reusable test steps',
}

const TemplateSteps = async () => {
  const { data: templateSteps, error: templateStepsError } = await getAllTemplateStepsAction()

  if (templateStepsError) {
    return <div>Error: {templateStepsError}</div>
  }

  const templateStepsData = templateSteps as TemplateStep[]

  if (!templateStepsData || templateStepsData.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-20rem)] items-center justify-center">
        <EmptyState
          icon={<LayoutTemplate className="h-8 w-8" />}
          title="No template steps found"
          description="Get started by creating a template step to define reusable test steps"
          createRoute="/template-steps/create"
          createText="Create Template Step"
        />
      </div>
    )
  }

  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <LayoutTemplate className="mr-2 h-8 w-8" />
            Template Steps
          </span>
        </PageHeader>
        <HeaderSubtitle>Define reusable test steps for consistent and efficient test authoring</HeaderSubtitle>
      </div>
      <Suspense fallback={<DataTableSkeleton />}>
        <TemplateStepTable />
      </Suspense>
    </>
  )
}

export default TemplateSteps
