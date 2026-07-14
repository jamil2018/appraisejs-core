import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import TemplateStepLibrary from './template-step-library'
import { Blocks, LayoutTemplate } from 'lucide-react'
import { getAllTemplateStepsAction } from '@/actions/template-step/template-step-actions'
import EmptyState from '@/components/data-state/empty-state'
import { Metadata } from 'next'

import { getTemplateStepRows } from './template-step-helpers'

export const metadata: Metadata = {
  title: 'Appraise | Template Steps',
  description: 'Manage template steps for reusable test steps',
}

const TemplateSteps = async () => {
  const { data: templateSteps, error: templateStepsError } = await getAllTemplateStepsAction()

  if (templateStepsError) {
    return <div>Error: {templateStepsError}</div>
  }

  const templateStepsData = getTemplateStepRows(templateSteps)

  if (!templateStepsData || templateStepsData.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-20rem)] items-center justify-center">
        <EmptyState
          icon={<LayoutTemplate className="size-8" />}
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
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader>
          <span className="flex items-center">
            <Blocks className="mr-2 size-8 text-primary" />
            Template Steps
          </span>
        </PageHeader>
        <HeaderSubtitle>Build a shared vocabulary for clear, consistent test authoring.</HeaderSubtitle>
      </div>
      <TemplateStepLibrary steps={templateStepsData} />
    </>
  )
}

export default TemplateSteps
