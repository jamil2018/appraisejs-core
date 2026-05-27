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
  if (!id?.trim()) {
    return <div>Error: Invalid template step id.</div>
  }

  const templateStepResponse = await getTemplateStepByIdAction(id)
  if (templateStepResponse.error) {
    return <div>Error: {templateStepResponse.error}</div>
  }

  const templateStep = getEditableTemplateStep(templateStepResponse.data)
  if (!templateStep) {
    return <div>Error: Invalid template step</div>
  }

  const templateStepGroupsResponse = await getAllTemplateStepGroupsAction()
  if (templateStepGroupsResponse.error) {
    return <div>Error: {templateStepGroupsResponse.error}</div>
  }

  const templateStepGroups = getTemplateStepGroupRows(templateStepGroupsResponse.data)
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
