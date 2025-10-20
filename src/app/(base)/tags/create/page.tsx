import { createTagAction } from '@/actions/tags/tag-actions'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Tag } from 'lucide-react'
import React from 'react'
import TagForm from '../tag-form'

const CreateTag = () => {
  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Tag className="mr-2 h-8 w-8" />
            Create Tag
          </span>
        </PageHeader>
        <HeaderSubtitle>Create a new tag to be used in your test cases.</HeaderSubtitle>
      </div>
      <TagForm
        successTitle="Tag created"
        successMessage="Tag created successfully"
        onSubmitAction={createTagAction}
        defaultValues={{
          name: '',
          tagExpression: '',
        }}
      />
    </>
  )
}

export default CreateTag
