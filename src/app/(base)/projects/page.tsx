import type { Metadata } from 'next'

import PageHeader from '@/components/typography/page-header'
import { listTargetProjects } from '@/services/target-project/target-project-service'
import { listLatestAgentPreflightReceipts } from '@/services/agent-preflight/agent-preflight-service'

import ProjectManagement from './project-management'
import ProjectSelectionDialog from './project-selection-dialog'

export const metadata: Metadata = { title: 'Projects' }

type ProjectSearchParams = {
  agentSetup?: string
  project?: string
  selectProject?: string
  returnTo?: string
  preflight?: string
}

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
    <div className="space-y-4">
      <PageHeader>Projects</PageHeader>
      <ProjectManagement
        agentSetup={resolvedSearchParams?.agentSetup}
        highlightedProjectId={resolvedSearchParams?.project}
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
          }) => ({
            id,
            kind,
            displayName,
            description,
            canonicalIdentity,
            canonicalPath,
            normalizedRemoteOrigin,
            lastDetectedAt,
            preflight: preflightReceipts[id],
          }),
        )}
        highlightedPreflightId={preflightHighlight(resolvedSearchParams)}
        returnTo={resolvedSearchParams?.returnTo}
      />
      <ProjectSelectionPrompt searchParams={resolvedSearchParams} projects={projectOptions} />
    </div>
  )
}
