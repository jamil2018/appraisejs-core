import { getLocatorGroupByIdAction } from '@/actions/locator-groups/locator-group-actions'
import { LocatorGroup, Module } from '@prisma/client'
import React from 'react'
import LocatorGroupForm from '../../locator-group-form'
import { updateLocatorGroupAction } from '@/actions/locator-groups/locator-group-actions'
import { getAllModulesAction } from '@/actions/modules/module-actions'

const ModifyLocator = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const { data, error } = await getLocatorGroupByIdAction(id)

  if (error) {
    return <div>Error: {error}</div>
  }

  const locatorGroup = data as LocatorGroup

  const { data: moduleList, error: moduleListError } = await getAllModulesAction()

  if (moduleListError) {
    return <div>Error: {moduleListError}</div>
  }

  return (
    <LocatorGroupForm
      defaultValues={{
        name: locatorGroup.name ?? '',
        moduleId: locatorGroup.moduleId ?? '',
        route: locatorGroup.route ?? '',
      }}
      successTitle="Locator Group updated"
      successMessage="Locator Group updated successfully"
      onSubmitAction={updateLocatorGroupAction}
      id={id}
      moduleList={moduleList as Module[]}
    />
  )
}

export default ModifyLocator
