import { createLocatorGroupAction } from '@/actions/locator-groups/locator-group-actions'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Group } from 'lucide-react'
import React from 'react'
import LocatorGroupForm from '../locator-group-form'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import { Module } from '@prisma/client'

const CreateLocatorGroup = async () => {
  const { data: moduleList, error: moduleListError } = await getAllModulesAction()

  if (moduleListError) {
    return <div>Error: {moduleListError}</div>
  }

  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Group className="mr-2 h-8 w-8" />
            Create Locator Group
          </span>
        </PageHeader>
        <HeaderSubtitle>Create a new locator group.</HeaderSubtitle>
      </div>
      <LocatorGroupForm
        moduleList={moduleList as Module[]}
        onSubmitAction={createLocatorGroupAction}
        successTitle="Locator Group Created"
        successMessage="The locator group has been created successfully."
      />
    </>
  )
}

export default CreateLocatorGroup
