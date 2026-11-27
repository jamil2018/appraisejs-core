import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'
import { getAllLocatorGroupsAction } from '@/actions/locator-groups/locator-group-actions'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Crosshair } from 'lucide-react'
import type { Metadata } from 'next'
import { getEnvironmentRows, getLocatorGroupRows, getModuleRows } from './create-locator-workspace-helpers'
import CreateLocatorWorkspace from './create-locator-workspace'
import { requireActiveProject } from '@/lib/active-project'

export const metadata: Metadata = {
  title: 'Appraise | Create Locator',
  description: 'Create a new locator manually or by picking a single selector from Chromium with the local companion.',
}

const CreateLocatorPage = async ({ searchParams }: { searchParams?: Promise<{ project?: string }> }) => {
  const project = await requireActiveProject((await searchParams)?.project)
  const [
    { data: environments, error: environmentsError },
    { data: locatorGroups, error: locatorGroupsError },
    { data: modules, error: modulesError },
  ] = await Promise.all([getAllEnvironmentsAction(), getAllLocatorGroupsAction(), getAllModulesAction()])

  const loadError = environmentsError || locatorGroupsError || modulesError
  if (loadError) {
    return <div>Error: {loadError}</div>
  }

  const environmentRows = getEnvironmentRows(environments)
  const locatorGroupRows = getLocatorGroupRows(locatorGroups)
  const moduleRows = getModuleRows(modules)

  return (
    <div className="min-w-0 space-y-4">
      <div className="min-w-0">
        <PageHeader>
          <span className="flex items-center gap-2">
            <Crosshair className="size-7 shrink-0 sm:size-8" />
            Create Locator
          </span>
        </PageHeader>
        <HeaderSubtitle>
          Launch Chromium, use the built-in picker overlay to capture one live selector, then finalize the locator name
          and group details here.
        </HeaderSubtitle>
      </div>
      <CreateLocatorWorkspace
        environments={environmentRows}
        locatorGroups={locatorGroupRows}
        modules={moduleRows}
        projectId={project.id}
      />
    </div>
  )
}

export default CreateLocatorPage
