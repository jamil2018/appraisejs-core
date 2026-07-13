import type { Metadata } from 'next'

import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import { listTargetProjects } from '@/services/target-project/target-project-service'
import { FolderGit2 } from 'lucide-react'

import ProjectManagement from './project-management'

export const metadata: Metadata = { title: 'Projects' }

export default async function ProjectsPage() {
  const projects = await listTargetProjects()

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
        projects={projects.map(({ id, displayName, description, canonicalPath, lastDetectedAt }) => ({
          id,
          displayName,
          description,
          canonicalPath,
          lastDetectedAt,
        }))}
      />
    </div>
  )
}
