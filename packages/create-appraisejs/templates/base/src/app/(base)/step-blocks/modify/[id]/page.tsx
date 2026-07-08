import { getStepBlockByIdAction, updateStepBlockAction } from '@/actions/step-block/step-block-actions'
import { getAllTemplateStepsAction } from '@/actions/template-step/template-step-actions'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Metadata } from 'next'

import { getStepBlockRow, getTemplateStepOptions, toStepBlockFormValues } from '../../step-block-helpers'
import { StepBlockForm } from '../../step-block-form'

export const metadata: Metadata = {
  title: 'Appraise | Modify Step Block',
  description: 'Update reusable step block configuration',
}

const ModifyStepBlock = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const stepBlockResponse = await getStepBlockByIdAction(id)

  if (stepBlockResponse.error) {
    return <div>Error: {stepBlockResponse.error}</div>
  }

  const templateStepsResponse = await getAllTemplateStepsAction()
  if (templateStepsResponse.error) {
    return <div>Error: {templateStepsResponse.error}</div>
  }

  const stepBlock = getStepBlockRow(stepBlockResponse.data)
  if (!stepBlock) {
    return <div>Error: Step block data is unavailable.</div>
  }

  return (
    <>
      <div className="mb-8">
        <PageHeader>Modify Step Block</PageHeader>
        <HeaderSubtitle>Update the reusable step sequence and parameter mappings</HeaderSubtitle>
      </div>
      <StepBlockForm
        defaultValues={toStepBlockFormValues(stepBlock)}
        templateSteps={getTemplateStepOptions(templateStepsResponse.data)}
        successTitle="Step block updated"
        successMessage="Step block updated successfully"
        onSubmitAction={updateStepBlockAction}
        id={id}
      />
    </>
  )
}

export default ModifyStepBlock
