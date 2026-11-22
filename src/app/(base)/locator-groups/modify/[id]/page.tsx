import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { getLocatorGroupByIdAction } from '@/actions/locator-groups/locator-group-actions'
import { LocatorGroup, Module } from '@prisma/client'
import React from 'react'
import LocatorGroupForm from '../../locator-group-form'
import { updateLocatorGroupAction } from '@/actions/locator-groups/locator-group-actions'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Appraise | Modify Locator Group',
  description: 'Update locator group configuration',
}

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
    <div className="min-w-0 space-y-4">
      <div>
        <PageHeader>Modify Locator Group</PageHeader>
        <HeaderSubtitle>Update the locator group configuration.</HeaderSubtitle>
      </div>
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
    </div>
  )
}

export default ModifyLocator
