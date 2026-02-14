import { getAllModulesAction, getModuleByIdAction, updateModuleAction } from '@/actions/modules/module-actions'
import { Module } from '@prisma/client'
import ModuleForm from '../../module-form'
import { ROOT_MODULE_UUID } from '@/constants/form-opts/module-form-opts'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Appraise | Modify Module',
  description: 'Update module configuration',
}

const ModifyModule = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const { data: moduleToBeEditedData, error: moduleToBeEditedError } = await getModuleByIdAction(id)

  const { data: modulesData, error: modulesError } = await getAllModulesAction()

  if (moduleToBeEditedError || modulesError) {
    return <div>Error: {moduleToBeEditedError || modulesError}</div>
  }

  const moduleData = moduleToBeEditedData as Module & {
    parent: { name: string }
  }

  const modulesList = Array.isArray(modulesData) ? modulesData : []
  const parentOptions = (modulesList as (Module & { parent: { name: string } })[]).filter(
    (module: Module & { parent: { name: string } }) => module.id !== moduleData.id,
  ) as (Module & { parent: { name: string } })[]

  return (
    <ModuleForm
      id={id}
      defaultValues={{
        name: moduleData.name,
        parentId: moduleData.parentId ?? ROOT_MODULE_UUID,
      }}
      successTitle="Module updated"
      successMessage="Module updated successfully"
      parentOptions={parentOptions}
      onSubmitAction={updateModuleAction}
    />
  )
}

export default ModifyModule
