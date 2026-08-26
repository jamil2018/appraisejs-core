import type { Metadata } from 'next'

import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { listTargetProjects } from '@/services/target-project/target-project-service'
import { listLatestAgentPreflightReceipts } from '@/services/agent-preflight/agent-preflight-service'
import { FolderGit2 } from 'lucide-react'

import ProjectManagement from './project-management'
import ProjectSelectionDialog from './project-selection-dialog'

export const metadata: Metadata = { title: 'Projects' }

type ProjectSearchParams = { selectProject?: string; returnTo?: string; preflight?: string }

function preflightHighlight(searchParams: ProjectSearchParams | undefined): string | undefined {
  return searchParams?.preflight
}

function ProjectSelectionPrompt({
  searchParams,
  projects,
}: {
  searchParams?: ProjectSearchParams
  projects: Array<{ id: string; displayName: string; targetIdentity: string }>
}) {
  if (searchParams?.selectProject !== 'required') return null
  return <ProjectSelectionDialog projects={projects} returnTo={searchParams.returnTo ?? '/'} />
}

export default async function ProjectsPage({ searchParams }: { searchParams?: Promise<ProjectSearchParams> }) {
  const [resolvedSearchParams, projects] = await Promise.all([searchParams, listTargetProjects()])
  const preflightReceipts = await listLatestAgentPreflightReceipts(projects.map(project => project.id))
  const projectOptions = projects.map(project => ({
    id: project.id,
    displayName: project.displayName,
    targetIdentity: project.canonicalPath ?? project.normalizedRemoteOrigin ?? project.canonicalIdentity,
  }))

  return (
    <div className="flex flex-col gap-8">
      <div>
        <PageHeader>
          <span className="flex items-center gap-2">
            <FolderGit2 aria-hidden="true" className="size-8" />
            Projects
          </span>
        </PageHeader>
        <HeaderSubtitle>Register and manage the workspaces isolated by AppraiseJS project ownership.</HeaderSubtitle>
      </div>
      <ProjectManagement
        projects={projects.map(
          ({
            id,
            kind,
            displayName,
            description,
            canonicalIdentity,
            canonicalPath,
            normalizedRemoteOrigin,
            lastDetectedAt,
            executionConsentMode,
          }) => ({
            id,
            kind,
            displayName,
            description,
            canonicalIdentity,
            canonicalPath,
            normalizedRemoteOrigin,
            lastDetectedAt,
            executionConsentMode,
            preflight: preflightReceipts[id],
          }),
        )}
        highlightedPreflightId={preflightHighlight(resolvedSearchParams)}
      />
      <ProjectSelectionPrompt searchParams={resolvedSearchParams} projects={projectOptions} />
    </div>
  )
}
