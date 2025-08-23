import { createModuleAction, getAllModulesAction } from '@/actions/modules/module-actions'
import ModuleForm from '../module-form'
import { Module } from '@prisma/client'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'

const CreateModule = async () => {
  const { data: modules } = await getAllModulesAction()

  const parentOptions = modules as (Module & { parent: { name: string } })[]

  return (
    <>
      <div className="mb-8">
        <PageHeader>Create Module</PageHeader>
        <HeaderSubtitle>Create a new module to be used in your test cases.</HeaderSubtitle>
      </div>
      <ModuleForm
        parentOptions={parentOptions}
        successTitle="Module created"
        successMessage="Module created successfully"
        onSubmitAction={createModuleAction}
      />
    </>
  )
}

export default CreateModule
