import type { Metadata } from 'next'

import PageHeader from '@/components/typography/page-header'
import { listTargetProjects } from '@/services/target-project/target-project-service'

import ProjectManagement from './project-management'

export const metadata: Metadata = { title: 'Projects' }

export default async function ProjectsPage() {
  const projects = await listTargetProjects()

  return (
    <div className="space-y-6">
      <PageHeader>Projects</PageHeader>
      <ProjectManagement projects={projects} />
    </div>
  )
}
