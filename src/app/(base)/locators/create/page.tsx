import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'
import { getAllLocatorGroupsAction } from '@/actions/locator-groups/locator-group-actions'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Environment, LocatorGroup, Module } from '@prisma/client'
import { Crosshair } from 'lucide-react'
import type { Metadata } from 'next'
import CreateLocatorWorkspace from './create-locator-workspace'

export const metadata: Metadata = {
  title: 'Appraise | Create Locator',
  description: 'Create a new locator manually or by picking a single selector from Chromium with the local companion.',
}

const CreateLocatorPage = async () => {
  const [
    { data: environments, error: environmentsError },
    { data: locatorGroups, error: locatorGroupsError },
    { data: modules, error: modulesError },
  ] = await Promise.all([getAllEnvironmentsAction(), getAllLocatorGroupsAction(), getAllModulesAction()])

  const loadError = environmentsError || locatorGroupsError || modulesError
  if (loadError) {
    return <div>Error: {loadError}</div>
  }

  return (
    <>
      <div className="mb-8">
        <PageHeader>
          <span className="flex items-center">
            <Crosshair className="mr-2 h-8 w-8" />
            Create Locator
          </span>
        </PageHeader>
        <HeaderSubtitle>
          Launch Chromium, use the built-in picker overlay to capture one live selector, then finalize the locator
          name and group details here.
        </HeaderSubtitle>
      </div>
      <CreateLocatorWorkspace
        environments={environments as Environment[]}
        locatorGroups={locatorGroups as LocatorGroup[]}
        modules={modules as Module[]}
      />
    </>
  )
}

export default CreateLocatorPage
