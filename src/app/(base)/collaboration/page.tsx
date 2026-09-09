import type { Metadata } from 'next'
import { GitPullRequestArrow } from 'lucide-react'

import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Badge } from '@/components/ui/badge'
import { requireActiveProject } from '@/lib/active-project'
import { getCollaborationStatus } from '@/services/repository-collaboration'

import { CollaborationControls } from './collaboration-controls'

export const metadata: Metadata = {
  title: 'Appraise | Collaboration',
  description: 'Review and synchronize Appraise authored content through a bounded repository workflow.',
}

function CollaborationHeader({ displayName, connectionState }: { displayName: string; connectionState?: string }) {
  return (
    <header className="flex flex-col items-start justify-between gap-4 sm:flex-row">
      <div className="space-y-2">
        <PageHeader>
          <span className="flex items-center gap-3">
            <GitPullRequestArrow aria-hidden="true" className="size-7 text-primary sm:size-8" />
            Repository collaboration
          </span>
        </PageHeader>
        <HeaderSubtitle>
          Durable, reviewed synchronization for {displayName}. SQLite remains local authoring authority.
        </HeaderSubtitle>
      </div>
      <Badge variant="outline">{connectionState ?? 'NOT CONNECTED'}</Badge>
    </header>
  )
}

function ConnectionSummary({ status }: { status: NonNullable<Awaited<ReturnType<typeof getCollaborationStatus>>> }) {
  return (
    <section className="bg-card/40 grid gap-3 rounded-lg border p-5 text-sm sm:grid-cols-3" aria-label="Connection">
      <div>
        <span className="text-muted-foreground">Portable project</span>
        <p className="mt-1 font-mono text-xs">{status.portableProjectId}</p>
      </div>
      <div>
        <span className="text-muted-foreground">Tracked ref</span>
        <p className="mt-1">
          {status.remoteName}/{status.trackedBranch}
        </p>
      </div>
      <div>
        <span className="text-muted-foreground">Operations</span>
        <p className="mt-1">{status.operations.length}</p>
      </div>
    </section>
  )
}

function OperationHistory({
  operations,
}: {
  operations: NonNullable<Awaited<ReturnType<typeof getCollaborationStatus>>>['operations']
}) {
  return (
    <section className="space-y-3" aria-labelledby="history-heading">
      <h2 className="text-lg font-semibold" id="history-heading">
        Recent operations
      </h2>
      <div className="overflow-x-auto rounded-lg border" tabIndex={0}>
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="p-3">Intent</th>
              <th className="p-3">State</th>
              <th className="p-3">Changes</th>
              <th className="p-3">Receipt</th>
              <th className="p-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {operations.map(operation => (
              <tr className="border-t" key={operation.id}>
                <td className="p-3 font-medium">{operation.intent}</td>
                <td className="p-3">{operation.state}</td>
                <td className="p-3">{operation.changeCount}</td>
                <td className="p-3 font-mono text-xs">{operation.receiptHash?.slice(0, 12) ?? '—'}</td>
                <td className="p-3">{operation.updatedAt.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function StatusSections({ status }: { status: Awaited<ReturnType<typeof getCollaborationStatus>> }) {
  if (!status) return null
  return (
    <>
      <ConnectionSummary status={status} />
      {status.operations.length ? <OperationHistory operations={status.operations} /> : null}
    </>
  )
}

export default async function CollaborationPage({ searchParams }: { searchParams?: Promise<{ project?: string }> }) {
  const project = await requireActiveProject((await searchParams)?.project)
  const status = await getCollaborationStatus(project.id)
  return (
    <main className="space-y-6 pb-10">
      <CollaborationHeader displayName={project.displayName} connectionState={status?.connectionState} />
      <CollaborationControls projectId={project.id} status={status} />
      <StatusSections status={status} />
    </main>
  )
}
