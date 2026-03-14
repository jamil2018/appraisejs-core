import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'
import { getAllLocatorGroupsAction } from '@/actions/locator-groups/locator-group-actions'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Environment, LocatorGroup, Module } from '@prisma/client'
import { Crosshair } from 'lucide-react'
import type { Metadata } from 'next'
import LocatorPickerWorkspace from './locator-picker-workspace'

export const metadata: Metadata = {
  title: 'Appraise | Locator Picker',
  description: 'Pick locator selectors from a live page in a Playwright browser session.',
}

const LocatorPickerPage = async () => {
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
            Locator Picker
          </span>
        </PageHeader>
        <HeaderSubtitle>
          Launch a browser window, click a live element, rank selector candidates, and save the locator into the
          existing repository flow.
        </HeaderSubtitle>
      </div>
      <LocatorPickerWorkspace
        environments={environments as Environment[]}
        locatorGroups={locatorGroups as LocatorGroup[]}
        modules={modules as Module[]}
      />
    </>
  )
}

export default LocatorPickerPage
