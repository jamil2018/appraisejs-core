import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'
import { getAllLocatorGroupsAction } from '@/actions/locator-groups/locator-group-actions'
import { getLocatorByIdAction } from '@/actions/locator/locator-actions'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Crosshair } from 'lucide-react'
import React from 'react'
import { Metadata } from 'next'
import {
  getEnvironmentRows,
  getLocatorGroupRows,
  getLocatorRow,
  getModuleRows,
} from '../../create/create-locator-workspace-helpers'
import CreateLocatorWorkspace from '../../create/create-locator-workspace'
import { requireActiveProject } from '@/lib/active-project'

export const metadata: Metadata = {
  title: 'Appraise | Modify Locator',
  description: 'Update locator configuration with the Chromium picker workspace',
}

const ModifyLocator = async ({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ project?: string }>
}) => {
  const project = await requireActiveProject((await searchParams)?.project)
  const { id } = await params
  const [
    { data: locatorData, error: locatorError },
    { data: environmentData, error: environmentsError },
    { data: locatorGroupData, error: locatorGroupListError },
    { data: moduleData, error: modulesError },
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

  const locator = getLocatorRow(locatorData)
  const environments = getEnvironmentRows(environmentData)
  const locatorGroups = getLocatorGroupRows(locatorGroupData)
  const modules = getModuleRows(moduleData)

  if (!locator) {
    return <div>Error: Locator not found.</div>
  }

  const currentLocatorGroup = locatorGroups.find(locatorGroup => locatorGroup.id === locator.locatorGroupId)

  return (
    <div className="min-w-0 space-y-4">
      <div className="min-w-0">
        <PageHeader>
          <span className="flex items-center gap-2">
            <Crosshair className="size-7 shrink-0 sm:size-8" />
            Modify Locator
          </span>
        </PageHeader>
        <HeaderSubtitle>
          Reuse the Chromium picker workspace to repick the selector, change the locator group, or move this locator
          into a newly created group.
        </HeaderSubtitle>
      </div>
      <CreateLocatorWorkspace
        environments={environments}
        locatorGroups={locatorGroups}
        modules={modules}
        mode="modify"
        locatorId={id}
        projectId={project.id}
        initialValues={{
          locatorName: locator.name ?? '',
          selector: locator.value ?? '',
          resolutionMode: locator.locatorGroupId ? 'existing' : 'create',
          existingLocatorGroupId: locator.locatorGroupId ?? '',
          route: currentLocatorGroup?.route ?? '/',
          moduleId: currentLocatorGroup?.moduleId ?? '',
        }}
      />
    </div>
  )
}

export default ModifyLocator
