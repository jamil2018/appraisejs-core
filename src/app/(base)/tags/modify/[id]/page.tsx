import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import React from 'react'
import TagForm from '../../tag-form'
import { getTagByIdAction, updateTagAction } from '@/actions/tags/tag-actions'
import { Tag } from 'lucide-react'
import { Tag as TagType } from '@prisma/client'

const ModifyTag = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const { data: tagToBeEditedData, error: tagToBeEditedError } = await getTagByIdAction(id)

  if (tagToBeEditedError) {
    return <div>Error: {tagToBeEditedError}</div>
  }

  const tagData = tagToBeEditedData as TagType

  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Tag className="mr-2 h-8 w-8" />
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
      />
    </>
  )
}

export default ModifyTag
