import { createTemplateStepGroupAction } from '@/actions/template-step-group/template-step-group-actions'
import { TemplateStepGroupForm } from '../template-step-group-form'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'

const CreateTemplateStepGroup = async () => {
  return (
    <>
      <div className="mb-8">
        <PageHeader>Create Template Step Group</PageHeader>
        <HeaderSubtitle>Create a new template step group to organize related template steps</HeaderSubtitle>
      </div>
      <TemplateStepGroupForm
        successTitle="Group created"
        successMessage="Template step group created successfully"
        onSubmitAction={createTemplateStepGroupAction}
      />
    </>
  )
}

export default CreateTemplateStepGroup
