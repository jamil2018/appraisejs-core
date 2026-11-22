import DataTableSkeleton from '@/components/loading-skeleton/data-table/data-table-skeleton'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Tag } from 'lucide-react'
import { Suspense } from 'react'
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

  return (
    <div className="min-w-0 space-y-4">
      <div className="min-w-0">
        <PageHeader>
          <span className="flex items-center gap-2">
            <Tag className="size-7 shrink-0 sm:size-8" />
            Tags
          </span>
        </PageHeader>
        <HeaderSubtitle>Categorize test cases and test runs for better organization and filtering</HeaderSubtitle>
      </div>
      {!tagsData || tagsData.length === 0 ? (
        <EmptyState
          icon={<Tag className="size-5" />}
          title="No tags found"
          description="Get started by creating a tag to categorize your test cases and test runs"
          createRoute="/tags/create"
          createText="Create Tag"
        />
      ) : (
        <Suspense fallback={<DataTableSkeleton />}>
          <TagTable />
        </Suspense>
      )}
    </div>
  )
}

export default Tags
