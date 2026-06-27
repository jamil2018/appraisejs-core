import { getAllModulesAction, getModuleByIdAction, updateModuleAction } from '@/actions/modules/module-actions'
import ModuleForm from '../../module-form'
import { Metadata } from 'next'
import { getModuleFormParentId, getModuleParentOptions, getModuleTableRows } from '../../module-helpers'

export const metadata: Metadata = {
  title: 'Appraise | Modify Module',
  description: 'Update module configuration',
}

const ModifyModule = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  if (!id?.trim()) {
    return <div>Error: Invalid module id.</div>
  }

  const { data: moduleToBeEditedData, error: moduleToBeEditedError } = await getModuleByIdAction(id)
  if (moduleToBeEditedError) {
    return <div>Error: {moduleToBeEditedError}</div>
  }

  const [moduleData] = getModuleTableRows([moduleToBeEditedData])
  if (!moduleData) {
    return <div>Error: Module data is unavailable.</div>
  }

  const { data: modulesData, error: modulesError } = await getAllModulesAction()
  if (modulesError) {
    return <div>Error: {modulesError}</div>
  }

  const parentOptions = getModuleParentOptions(getModuleTableRows(modulesData), moduleData.id)

  return (
    <ModuleForm
      id={id}
      defaultValues={{
        name: moduleData.name,
        parentId: getModuleFormParentId(moduleData.parentId),
      }}
      successTitle="Module updated"
      successMessage="Module updated successfully"
      parentOptions={parentOptions}
      onSubmitAction={updateModuleAction}
    />
  )
}

export default ModifyModule
