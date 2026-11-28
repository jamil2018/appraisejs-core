import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import React from 'react'
import TagForm from '../../tag-form'
import { getTagByIdAction, updateTagAction } from '@/actions/tags/tag-actions'
import { Tag } from 'lucide-react'
import { Tag as TagType } from '@prisma/client'
import { Metadata } from 'next'
import { withProjectScope } from '@/lib/project-scope'

export const metadata: Metadata = {
  title: 'Appraise | Modify Tag',
  description: 'Modify a tag',
}

const ModifyTag = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const { data: tagToBeEditedData, error: tagToBeEditedError } = await getTagByIdAction(id)

  if (tagToBeEditedError) {
    return <div>Error: {tagToBeEditedError}</div>
  }

  const tagData = tagToBeEditedData as TagType

  return (
    <div className="min-w-0 space-y-4">
      <div className="min-w-0">
        <PageHeader>
          <span className="flex items-center gap-2">
            <Tag className="size-7 shrink-0 sm:size-8" />
            Modify Tag
          </span>
        </PageHeader>
        <HeaderSubtitle>Modify a tag.</HeaderSubtitle>
      </div>
      <TagForm
        successTitle="Tag modified"
        successMessage="Tag modified successfully"
        onSubmitAction={updateTagAction}
        defaultValues={{
          name: tagData.name,
          tagExpression: tagData.tagExpression,
        }}
        id={id}
        expectedUpdatedAt={tagData.updatedAt.toISOString()}
        redirectPath={withProjectScope('/tags', tagData.targetProjectId)}
      />
    </div>
  )
}

export default ModifyTag
