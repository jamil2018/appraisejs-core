import { createTagAction } from '@/actions/tags/tag-actions'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Tag } from 'lucide-react'
import React from 'react'
import TagForm from '../tag-form'
import { Metadata } from 'next'
import { requireActiveProjectForMutation } from '@/lib/active-project'
import { withProjectScope } from '@/lib/project-scope'

export const metadata: Metadata = {
  title: 'Appraise | Create Tag',
  description: 'Create a new tag to be used in your test cases',
}

const CreateTag = async () => {
  const project = await requireActiveProjectForMutation()
  return (
    <div className="min-w-0 space-y-4">
      <div className="min-w-0">
        <PageHeader>
          <span className="flex items-center gap-2">
            <Tag className="size-7 shrink-0 sm:size-8" />
            Create Tag
          </span>
        </PageHeader>
        <HeaderSubtitle>Create a new tag to be used in your test cases.</HeaderSubtitle>
      </div>
      <TagForm
        successTitle="Tag created"
        successMessage="Tag created successfully"
        onSubmitAction={createTagAction}
        redirectPath={withProjectScope('/tags', project.id)}
        defaultValues={{
          name: '',
          tagExpression: '',
        }}
      />
    </div>
  )
}

export default CreateTag
