import { updateTemplateStepAction } from '@/actions/template-step/template-step-actions'
import { getTemplateStepByIdAction } from '@/actions/template-step/template-step-actions'
import { TemplateStepForm } from '../../template-step-form'
import { getAllTemplateStepGroupsAction } from '@/actions/template-step-group/template-step-group-actions'
import { Metadata } from 'next'

import { getEditableTemplateStep, getTemplateStepGroupRows } from '../../template-step-helpers'

export const metadata: Metadata = {
  title: 'Appraise | Modify Template Step',
  description: 'Update template step configuration',
}

export default async function ModifyTemplateStepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [templateStepResponse, templateStepGroupsResponse] = await Promise.all([
    getTemplateStepByIdAction(id),
    getAllTemplateStepGroupsAction(),
  ])

  if (templateStepResponse.error || templateStepGroupsResponse.error) {
    return <div>Error: {templateStepResponse.error || templateStepGroupsResponse.error}</div>
  }

  const templateStep = getEditableTemplateStep(templateStepResponse.data)
  const templateStepGroups = getTemplateStepGroupRows(templateStepGroupsResponse.data)
  if (!templateStep) {
    return <div>Error: Invalid template step</div>
  }
  return (
    <TemplateStepForm
      successTitle="Template step modified"
      successMessage="The template step has been modified"
      onSubmitAction={updateTemplateStepAction}
      defaultValues={{
        name: templateStep.name,
        type: templateStep.type,
        signature: templateStep.signature,
        icon: templateStep.icon,
        description: templateStep.description || '',
        functionDefinition: templateStep.functionDefinition || '',
        params: templateStep.parameters.map(param => ({
          id: param.id,
          name: param.name,
          type: param.type,
          order: param.order,
        })),
        templateStepGroupId: templateStep.templateStepGroupId || '',
      }}
      id={id}
      templateStepGroups={templateStepGroups}
    />
  )
}
