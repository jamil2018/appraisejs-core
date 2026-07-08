import { createStepBlockAction } from '@/actions/step-block/step-block-actions'
import { getAllTemplateStepsAction } from '@/actions/template-step/template-step-actions'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Metadata } from 'next'

import { getTemplateStepOptions } from '../step-block-helpers'
import { StepBlockForm } from '../step-block-form'

export const metadata: Metadata = {
  title: 'Appraise | Create Step Block',
  description: 'Create a reusable ordered step block from template steps',
}

const CreateStepBlock = async () => {
  const { data, error } = await getAllTemplateStepsAction()

  if (error) {
    return <div>Error: {error}</div>
  }

  return (
    <>
      <div className="mb-8">
        <PageHeader>Create Step Block</PageHeader>
        <HeaderSubtitle>Create a reusable ordered block from existing template steps</HeaderSubtitle>
      </div>
      <StepBlockForm
        templateSteps={getTemplateStepOptions(data)}
        successTitle="Step block created"
        successMessage="Step block created successfully"
        onSubmitAction={createStepBlockAction}
      />
    </>
  )
}

export default CreateStepBlock
