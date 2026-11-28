import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'
import { getAllLocatorGroupsAction } from '@/actions/locator-groups/locator-group-actions'
import { getAllModulesAction } from '@/actions/modules/module-actions'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { Crosshair } from 'lucide-react'
import type { Metadata } from 'next'
import { z } from 'zod'
import { getEnvironmentRows, getLocatorGroupRows, getModuleRows } from './create-locator-workspace-helpers'
import CreateLocatorWorkspace from './create-locator-workspace'
import { requireActiveProject } from '@/lib/active-project'
import prisma from '@/config/db-config'
import { withProjectScope } from '@/lib/project-scope'

export const metadata: Metadata = {
  title: 'Appraise | Create Locator',
  description: 'Create a new locator manually or by picking a single selector from Chromium with the local companion.',
}

const CreateLocatorPage = async ({
  searchParams,
}: {
  searchParams?: Promise<{ project?: string; fromChat?: string }>
}) => {
  const params = await searchParams
  const project = await requireActiveProject(params?.project)
  const conversationId = z.string().uuid().safeParse(params?.fromChat).data
  const [
    { data: environments, error: environmentsError },
    { data: locatorGroups, error: locatorGroupsError },
    { data: modules, error: modulesError },
    conversation,
  ] = await Promise.all([
    getAllEnvironmentsAction(),
    getAllLocatorGroupsAction(),
    getAllModulesAction(),
    conversationId
      ? prisma.projectConversation.findFirst({
          where: { id: conversationId, targetProjectId: project.id },
          select: { id: true },
        })
      : null,
  ])

  const loadError = environmentsError || locatorGroupsError || modulesError
  if (loadError) {
    return <div>Error: {loadError}</div>
  }

  const environmentRows = getEnvironmentRows(environments)
  const locatorGroupRows = getLocatorGroupRows(locatorGroups)
  const moduleRows = getModuleRows(modules)
  const returnToChat = conversation ? withProjectScope(`/conversations/${conversation.id}`, project.id) : undefined

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
        returnToChat={returnToChat}
      />
    </div>
  )
}

export default CreateLocatorPage
