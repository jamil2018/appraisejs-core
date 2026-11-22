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
    <div className="space-y-4">
      <div>
        <PageHeader>
          <span className="flex items-center">
            <Settings2 aria-hidden="true" className="mr-2 size-7" />
            Settings
          </span>
        </PageHeader>
        <HeaderSubtitle>Manage project resources and agent setup.</HeaderSubtitle>
      </div>
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
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="flex-1 p-4 pb-3">
        <CardTitle className="flex items-center gap-2">
          <span className="shrink-0 text-primary [&>svg]:size-5">{icon}</span>
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <Button size="sm" variant="outline" render={<Link href={href} />} nativeButton={false}>
          {action}
        </Button>
      </CardContent>
    </Card>
  )
}
