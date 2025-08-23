import React from 'react'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { TemplateStepForm } from '../template-step-form'
import { createTemplateStepAction } from '@/actions/template-step/template-step-actions'
import { getAllTemplateStepGroupsAction } from '@/actions/template-step-group/template-step-group-actions'

const CreateTemplateStep = async () => {
  const { data: templateStepGroups, error: templateStepGroupsError } = await getAllTemplateStepGroupsAction()

  if (templateStepGroupsError) {
    return <div>Error: {templateStepGroupsError}</div>
  }

  return (
    <>
      <div className="mb-8">
        <PageHeader>Create Template Step</PageHeader>
        <HeaderSubtitle>Create a new template step to be used in test cases</HeaderSubtitle>
      </div>
      <TemplateStepForm
        successTitle="Template Step Created"
        successMessage="The template step has been created successfully"
        onSubmitAction={createTemplateStepAction}
        templateStepGroups={templateStepGroups as Array<{ id: string; name: string }>}
      />
    </>
  )
}

export default CreateTemplateStep
