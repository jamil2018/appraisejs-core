import React from 'react'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { TemplateStepForm } from '../template-step-form'
import { createTemplateStepAction } from '@/actions/template-step/template-step-actions'
import { getAllTemplateStepGroupsAction } from '@/actions/template-step-group/template-step-group-actions'
import { Metadata } from 'next'

import { getTemplateStepGroupRows } from '../template-step-helpers'

export const metadata: Metadata = {
  title: 'Appraise | Create Template Step',
  description: 'Create a new template step to be used in test cases',
}

const CreateTemplateStep = async () => {
  const response = await getAllTemplateStepGroupsAction()
  const templateStepGroups = getTemplateStepGroupRows(response.data)

  if (response.error) {
    return <div>Error: {response.error}</div>
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
        templateStepGroups={templateStepGroups}
      />
    </>
  )
}

export default CreateTemplateStep
