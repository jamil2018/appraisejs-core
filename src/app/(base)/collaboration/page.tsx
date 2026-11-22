import type { Metadata } from 'next'
import { GitPullRequestArrow } from 'lucide-react'

import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { requireActiveProject } from '@/lib/active-project'
import { getCollaborationStatus } from '@/services/repository-collaboration'

import { CollaborationControls } from './collaboration-controls'

export const metadata: Metadata = {
  title: 'Appraise | Collaboration',
  description: 'Review and synchronize Appraise authored content through a bounded repository workflow.',
}

function CollaborationHeader({ displayName, connectionState }: { displayName: string; connectionState?: string }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <PageHeader>
          <span className="flex items-center gap-3">
            <GitPullRequestArrow aria-hidden="true" className="size-7 shrink-0 text-primary" />
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
    <section className="grid gap-3 rounded-xl border bg-card p-4 text-sm sm:grid-cols-3" aria-label="Connection">
      <div>
        <span className="text-muted-foreground">Portable project</span>
        <p className="mt-1 break-all font-mono text-xs">{status.portableProjectId}</p>
      </div>
      <div>
        <span className="text-muted-foreground">Tracked ref</span>
        <p className="mt-1 break-words [overflow-wrap:anywhere]">
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
      <div className="rounded-lg border">
        <Table scrollLabel="Recent collaboration operations">
          <TableHeader className="bg-secondary">
            <TableRow>
              <TableHead>Intent</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Changes</TableHead>
              <TableHead>Receipt</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {operations.map(operation => (
              <TableRow key={operation.id}>
                <TableCell className="font-medium">{operation.intent}</TableCell>
                <TableCell>{operation.state}</TableCell>
                <TableCell>{operation.changeCount}</TableCell>
                <TableCell className="font-mono text-xs">{operation.receiptHash?.slice(0, 12) ?? '—'}</TableCell>
                <TableCell>{operation.updatedAt.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
    <div className="space-y-4">
      <CollaborationHeader displayName={project.displayName} connectionState={status?.connectionState} />
      <CollaborationControls projectId={project.id} status={status} />
      <StatusSections status={status} />
    </div>
  )
}
