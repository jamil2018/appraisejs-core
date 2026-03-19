import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'
import { getAllLocatorGroupsAction } from '@/actions/locator-groups/locator-group-actions'
import { getLocatorByIdAction } from '@/actions/locator/locator-actions'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Environment, Locator, LocatorGroup, Module } from '@prisma/client'
import { Crosshair } from 'lucide-react'
import React from 'react'
import { Metadata } from 'next'
import CreateLocatorWorkspace from '../../create/create-locator-workspace'

export const metadata: Metadata = {
  title: 'Appraise | Modify Locator',
  description: 'Update locator configuration with the Chromium picker workspace',
}

const ModifyLocator = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const [
    { data: locatorData, error: locatorError },
    { data: environments, error: environmentsError },
    { data: locatorGroupList, error: locatorGroupListError },
    { data: modules, error: modulesError },
  ] = await Promise.all([
    getLocatorByIdAction(id),
    getAllEnvironmentsAction(),
    getAllLocatorGroupsAction(),
    getAllModulesAction(),
  ])

  const loadError = locatorError || environmentsError || locatorGroupListError || modulesError
  if (loadError) {
    return <div>Error: {loadError}</div>
  }

  const locator = locatorData as Locator & { locatorGroup: LocatorGroup | null }
  const locatorGroups = locatorGroupList as LocatorGroup[]
  const currentLocatorGroup = locatorGroups.find(locatorGroup => locatorGroup.id === locator.locatorGroupId)

  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Crosshair className="mr-2 h-8 w-8" />
            Modify Locator
          </span>
        </PageHeader>
        <HeaderSubtitle>
          Reuse the Chromium picker workspace to repick the selector, change the locator group, or move this locator
          into a newly created group.
        </HeaderSubtitle>
      </div>
      <CreateLocatorWorkspace
        environments={environments as Environment[]}
        locatorGroups={locatorGroups}
        modules={modules as Module[]}
        mode="modify"
        locatorId={id}
        initialValues={{
          locatorName: locator.name ?? '',
          selector: locator.value ?? '',
          resolutionMode: locator.locatorGroupId ? 'existing' : 'create',
          existingLocatorGroupId: locator.locatorGroupId ?? '',
          route: currentLocatorGroup?.route ?? '/',
          moduleId: currentLocatorGroup?.moduleId ?? '',
        }}
      />
    </>
  )
}

export default ModifyLocator
