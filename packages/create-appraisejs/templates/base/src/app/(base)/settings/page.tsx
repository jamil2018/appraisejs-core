import { ArrowUpRight } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import PageHeader from '@/components/typography/page-header'
import { readActiveProjectCookie } from '@/lib/active-project'
import { withProjectScope } from '@/lib/project-scope'

import { AppearanceSettings } from './appearance-settings'

export const metadata: Metadata = {
  title: 'Appraise | Settings',
  description: 'Manage appearance, workspace preferences, and agent setup.',
}

export default async function SettingsPage() {
  const project = await readActiveProjectCookie()
  const scoped = (href: string) => (project ? withProjectScope(href, project) : href)

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader>Settings</PageHeader>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">Appearance</h2>
        <AppearanceSettings />
      </section>
      <section className="flex flex-col gap-2" aria-labelledby="workspace-settings">
        <h2 className="text-sm font-semibold" id="workspace-settings">
          Workspace
        </h2>
        <div className="divide-y divide-border rounded-xl border bg-card">
          <SettingsLink href={scoped('/projects')} title="Manage projects" />
          <SettingsLink href={scoped('/environments')} title="Manage environments" />
        </div>
      </section>
      <section className="flex flex-col gap-2" aria-labelledby="agent-settings">
        <h2 className="text-sm font-semibold" id="agent-settings">
          Agent setup
        </h2>
        <div className="divide-y divide-border rounded-xl border bg-card">
          <SettingsLink href={scoped('/projects?agentSetup=codex')} title="Codex diagnostic" />
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 text-sm">
            <span>Claude Code</span>
            <span className="text-muted-foreground">Setup unavailable</span>
          </div>
        </div>
      </section>
    </div>
  )
}

function SettingsLink({ href, title }: { href: string; title: string }) {
  return (
    <Link
      href={href}
      className="app-focus flex min-h-11 items-center justify-between gap-3 px-4 py-2 text-sm leading-5 first:rounded-t-xl last:rounded-b-xl hover:bg-muted"
    >
      {title}
      <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}
