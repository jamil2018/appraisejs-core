import { createStepBlockAction } from '@/actions/step-block/step-block-actions'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Metadata } from 'next'

import { loadStepBlockFormResources } from '../step-block-form-resources'
import { StepBlockForm } from '../step-block-form'

export const metadata: Metadata = {
  title: 'Appraise | Create Step Block',
  description: 'Create a reusable ordered step block from template steps',
}

const CreateStepBlock = async () => {
  const resources = await loadStepBlockFormResources()

  if (resources.error) {
    return <div>Error: {resources.error}</div>
  }

  return (
    <>
      <div className="mb-8">
        <PageHeader>Create Step Block</PageHeader>
        <HeaderSubtitle>Create a reusable ordered block from existing template steps</HeaderSubtitle>
      </div>
      <StepBlockForm
        stepDefinitions={
          (resources.stepDefinitions ?? []) as import('@/types/step-definition-option').StepDefinitionOption[]
        }
        successTitle="Step block created"
        successMessage="Step block created successfully"
        onSubmitAction={createStepBlockAction}
      />
    </>
  )
}

export default CreateStepBlock
