import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Tag } from 'lucide-react'
import React, { Suspense } from 'react'
import TagTable from './tag-table'
import { getAllTagsAction } from '@/actions/tags/tag-actions'
import EmptyState from '@/components/data-state/empty-state'
import { Tag as TagModel } from '@prisma/client'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Appraise | Tags',
  description: 'Manage tags for categorizing test cases and test runs',
}

const Tags = async () => {
  const { data: tags, error: tagsError } = await getAllTagsAction()

  if (tagsError) {
    return <div>Error: {tagsError}</div>
  }

  const tagsData = tags as TagModel[]

  if (!tagsData || tagsData.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-20rem)] items-center justify-center">
        <EmptyState
          icon={<Tag className="h-8 w-8" />}
          title="No tags found"
          description="Get started by creating a tag to categorize your test cases and test runs"
          createRoute="/tags/create"
          createText="Create Tag"
        />
      </div>
    )
  }

  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Tag className="mr-2 h-8 w-8" />
            Tags
          </span>
        </PageHeader>
        <HeaderSubtitle>Tags are used to categorize test cases and test runs</HeaderSubtitle>
      </div>
      <Suspense fallback={<DataTableSkeleton />}>
        <TagTable />
      </Suspense>
    </>
  )
}

export default Tags
