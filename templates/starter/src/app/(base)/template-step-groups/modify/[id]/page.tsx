import {
  getTemplateStepGroupByIdAction,
  updateTemplateStepGroupAction,
} from '@/actions/template-step-group/template-step-group-actions'
import { TemplateStepGroupForm } from '../../template-step-group-form'
import React from 'react'
import { Metadata } from 'next'
import { getTemplateStepGroupRows } from '../../template-step-group-helpers'

export const metadata: Metadata = {
  title: 'Appraise | Modify Template Step Group',
  description: 'Update template step group configuration',
}

const ModifyTemplateStepGroup = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const { data: templateStepGroup, error } = await getTemplateStepGroupByIdAction(id)

  if (error) {
    return <div>Error: {error}</div>
  }

  const [templateStepGroupData] = getTemplateStepGroupRows([templateStepGroup])
  if (!templateStepGroupData) {
    return <div>Error: Template step group data is unavailable.</div>
  }

  return (
    <TemplateStepGroupForm
      defaultValues={{
        name: templateStepGroupData.name ?? '',
        description: templateStepGroupData.description ?? '',
        type: templateStepGroupData.type,
      }}
      successTitle="Group updated"
      successMessage="Template step group updated successfully"
      onSubmitAction={updateTemplateStepGroupAction}
      id={id}
    />
  )
}

export default ModifyTemplateStepGroup
