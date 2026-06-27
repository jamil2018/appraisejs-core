import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Component } from 'lucide-react'
import TemplateStepGroupTable from './template-step-group-table'
import { Suspense } from 'react'
import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import { getAllTemplateStepGroupsAction } from '@/actions/template-step-group/template-step-group-actions'
import EmptyState from '@/components/data-state/empty-state'
import { Metadata } from 'next'
import { getTemplateStepGroupRows } from './template-step-group-helpers'

export const metadata: Metadata = {
  title: 'Appraise | Template Step Groups',
  description: 'Manage template step groups for organizing related template steps',
}

const TemplateStepGroups = async () => {
  const { data: templateStepGroups, error: templateStepGroupsError } = await getAllTemplateStepGroupsAction()

  if (templateStepGroupsError) {
    return <div>Error: {templateStepGroupsError}</div>
  }

  const templateStepGroupsData = getTemplateStepGroupRows(templateStepGroups)

  if (!templateStepGroupsData || templateStepGroupsData.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-20rem)] items-center justify-center">
        <EmptyState
          icon={<Component className="size-8" />}
          title="No template step groups found"
          description="Get started by creating a template step group to organize related template steps"
          createRoute="/template-step-groups/create"
          createText="Create Template Step Group"
        />
      </div>
    )
  }

  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Component className="mr-2 size-8" />
            Template Step Groups
          </span>
        </PageHeader>
        <HeaderSubtitle>
          Template step groups organize related template steps for better management and reusability
        </HeaderSubtitle>
      </div>
      <Suspense fallback={<DataTableSkeleton />}>
        <TemplateStepGroupTable />
      </Suspense>
    </>
  )
}

export default TemplateStepGroups
