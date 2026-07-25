import { getStepBlockByIdAction, updateStepBlockAction } from '@/actions/step-block/step-block-actions'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Metadata } from 'next'

import { loadStepBlockFormResources } from '../../step-block-form-resources'
import { getStepBlockRow, toStepBlockFormValues } from '../../step-block-helpers'
import { StepBlockForm } from '../../step-block-form'

type ModifyStepBlockPageData =
  | { status: 'error'; message: string }
  | {
      status: 'success'
      id: string
      stepBlock: NonNullable<ReturnType<typeof getStepBlockRow>>
      stepDefinitions: Awaited<ReturnType<typeof loadStepBlockFormResources>>['stepDefinitions']
    }

async function loadModifyStepBlockPageData(id: string): Promise<ModifyStepBlockPageData> {
  const [stepBlockResponse, resources] = await Promise.all([getStepBlockByIdAction(id), loadStepBlockFormResources()])
  const error = stepBlockResponse.error ?? resources.error
  if (error) return { status: 'error', message: error }

  const stepBlock = getStepBlockRow(stepBlockResponse.data)
  return stepBlock
    ? { status: 'success', id, stepBlock, stepDefinitions: resources.stepDefinitions }
    : { status: 'error', message: 'Step block data is unavailable.' }
}

export const metadata: Metadata = {
  title: 'Appraise | Modify Step Block',
  description: 'Update reusable step block configuration',
}

const ModifyStepBlock = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const data = await loadModifyStepBlockPageData(id)
  if (data.status === 'error') return <div>Error: {data.message}</div>

  return (
    <>
      <div className="mb-8">
        <PageHeader>Modify Step Block</PageHeader>
        <HeaderSubtitle>Update the reusable step sequence</HeaderSubtitle>
      </div>
      <StepBlockForm
        defaultValues={toStepBlockFormValues(data.stepBlock)}
        stepDefinitions={
          (data.stepDefinitions ?? []) as import('@/types/step-definition-option').StepDefinitionOption[]
        }
        successTitle="Step block updated"
        successMessage="Step block updated successfully"
        onSubmitAction={updateStepBlockAction}
        id={data.id}
      />
    </>
  )
}

export default ModifyStepBlock
