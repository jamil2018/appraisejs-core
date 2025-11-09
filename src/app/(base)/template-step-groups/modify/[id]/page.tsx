import {
  getTemplateStepGroupByIdAction,
  updateTemplateStepGroupAction,
} from '@/actions/template-step-group/template-step-group-actions'
import { TemplateStepGroupForm } from '../../template-step-group-form'
import React from 'react'
import { TemplateStepGroup } from '@prisma/client'

const TemplateStepGroupType = {
  ACTION: 'ACTION',
  VALIDATION: 'VALIDATION',
} as const

const ModifyTemplateStepGroup = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const { data: templateStepGroup, error } = await getTemplateStepGroupByIdAction(id)

  if (error) {
    return <div>Error: {error}</div>
  }

  const templateStepGroupData = templateStepGroup as TemplateStepGroup

  return (
    <TemplateStepGroupForm
      defaultValues={{
        name: templateStepGroupData.name ?? '',
        description: templateStepGroupData.description ?? '',
        type: (templateStepGroupData as { type?: 'ACTION' | 'VALIDATION' }).type ?? TemplateStepGroupType.ACTION,
      }}
      successTitle="Group updated"
      successMessage="Template step group updated successfully"
      onSubmitAction={updateTemplateStepGroupAction}
      id={id}
    />
  )
}

export default ModifyTemplateStepGroup
