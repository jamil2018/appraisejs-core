import type { Metadata } from 'next'
import type React from 'react'
import { Settings2 } from 'lucide-react'
import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import Link from 'next/link'
import { Bot, FolderKanban, Server } from 'lucide-react'
import { requireActiveProject } from '@/lib/active-project'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Appraise | Settings',
  description: 'Find the project, environment, and verified agent setup controls for this workspace.',
}

export default async function SettingsPage() {
  const project = await requireActiveProject()
  const projectParam = encodeURIComponent(project.id)
  return (
    <div className="space-y-6">
      <div>
        <PageHeader>
          <span className="flex items-center">
            <Settings2 className="mr-2 size-8" />
            Settings
          </span>
        </PageHeader>
        <HeaderSubtitle>Workspace configuration lives with the resources it controls.</HeaderSubtitle>
      </div>
      <Card className="border-primary/25 bg-primary/[0.035]">
        <CardHeader>
          <CardTitle>Configuration overview</CardTitle>
          <CardDescription>
            AppraiseJS has no hidden desktop preferences here. Use these implemented destinations for the active
            project.
          </CardDescription>
        </CardHeader>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <SettingsDestination
          icon={<FolderKanban aria-hidden="true" />}
          title="Project"
          description="Select, register, rename, or inspect project ownership."
          href={`/projects?project=${projectParam}`}
          action="Manage projects"
        />
        <SettingsDestination
          icon={<Server aria-hidden="true" />}
          title="Environments"
          description="Manage project-owned targets and their stable identities."
          href={`/environments?project=${projectParam}`}
          action="Manage environments"
        />
        <SettingsDestination
          icon={<Bot aria-hidden="true" />}
          title="Codex setup"
          description="Review setup instructions and the latest diagnostic observation."
          href={`/projects?agentSetup=codex&project=${projectParam}`}
          action="Open agent setup"
        />
      </div>
    </div>
  )
}

function SettingsDestination({
  icon,
  title,
  description,
  href,
  action,
}: {
  icon: React.ReactNode
  title: string
  description: string
  href: string
  action: string
}) {
  return (
    <Card>
      <CardHeader>
        <span className="text-primary [&>svg]:size-5">{icon}</span>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link href={href}>{action}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
