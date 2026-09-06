import type { Metadata } from 'next'
import Link from 'next/link'
import { Archive, Download, ExternalLink } from 'lucide-react'

import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireActiveProject } from '@/lib/active-project'
import { listQualityJourneyArtifactLibrary } from '@/services/coordinator/quality-journey-artifact-library-service'

type PageProps = {
  params: Promise<{ journeyId: string }>
  searchParams?: Promise<{ project?: string; kind?: string; offset?: string }>
}

export const metadata: Metadata = { title: 'Journey Artifact Library' }

function label(value: string) {
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, character => character.toUpperCase())
}

function integer(value: string | undefined) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0
}

function href(journeyId: string, projectId: string, values: Record<string, string | undefined>) {
  const parameters = new URLSearchParams({ project: projectId })
  for (const [key, value] of Object.entries(values)) if (value) parameters.set(key, value)
  return `/quality-journeys/${encodeURIComponent(journeyId)}/artifacts?${parameters}`
}

export default async function QualityJourneyArtifactLibraryPage({ params, searchParams }: PageProps) {
  const [{ journeyId }, query] = await Promise.all([params, searchParams])
  const project = await requireActiveProject(query?.project)
  const offset = integer(query?.offset)
  const library = await listQualityJourneyArtifactLibrary({
    journeyId,
    targetProjectId: project.id,
    kind: query?.kind,
    offset,
  })
  const hasPrevious = library.offset > 0
  const hasNext = library.offset + library.entries.length < library.total

  return (
    <main className="space-y-6 pb-10">
      <header className="space-y-3">
        <Button asChild size="sm" variant="ghost">
          <Link href={`/quality-journeys/${encodeURIComponent(journeyId)}?project=${encodeURIComponent(project.id)}`}>
            Back to journey
          </Link>
        </Button>
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
          <div className="space-y-2">
            <PageHeader>
              <span className="flex items-center gap-3">
                <Archive aria-hidden="true" className="size-7 text-primary sm:size-8" />
                Artifact library
              </span>
            </PageHeader>
            <HeaderSubtitle>
              Durable authored history for this journey. Historical artifacts remain readable after closure.
            </HeaderSubtitle>
          </div>
          <Button asChild variant="outline">
            <Link
              href={`/quality-journeys/${encodeURIComponent(journeyId)}/artifacts/export?project=${encodeURIComponent(project.id)}`}
            >
              <Download aria-hidden="true" className="mr-2 size-4" />
              Export JSON
            </Link>
          </Button>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Artifact kind filters">
          <Button asChild size="sm" variant={query?.kind ? 'outline' : 'secondary'}>
            <Link href={href(journeyId, project.id, {})}>All ({library.total})</Link>
          </Button>
          {library.kinds.map(kind => (
            <Button asChild key={kind} size="sm" variant={query?.kind === kind ? 'secondary' : 'outline'}>
              <Link href={href(journeyId, project.id, { kind })}>{label(kind)}</Link>
            </Button>
          ))}
        </div>
      </header>

      <ArtifactEntries entries={library.entries} journeyId={journeyId} projectId={project.id} />

      <nav className="flex items-center justify-between gap-3" aria-label="Artifact library pagination">
        <Button asChild disabled={!hasPrevious} variant="outline">
          <Link
            href={href(journeyId, project.id, {
              kind: query?.kind,
              offset: String(Math.max(0, offset - library.limit)),
            })}
          >
            Previous
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">
          {library.total
            ? `${library.offset + 1}-${library.offset + library.entries.length} of ${library.total}`
            : '0 artifacts'}
        </p>
        <Button asChild disabled={!hasNext} variant="outline">
          <Link href={href(journeyId, project.id, { kind: query?.kind, offset: String(offset + library.limit) })}>
            Next
          </Link>
        </Button>
      </nav>
    </main>
  )
}

type LibraryEntry = Awaited<ReturnType<typeof listQualityJourneyArtifactLibrary>>['entries'][number]
function ArtifactEntries({
  entries,
  journeyId,
  projectId,
}: {
  entries: LibraryEntry[]
  journeyId: string
  projectId: string
}) {
  return (
    <section className="space-y-3" aria-label="Journey artifacts">
      {entries.length ? (
        entries.map(entry => (
          <ArtifactCard key={entry.entryId} entry={entry} journeyId={journeyId} projectId={projectId} />
        ))
      ) : (
        <EmptyArtifacts />
      )}
    </section>
  )
}
function ArtifactCard({ entry, journeyId, projectId }: { entry: LibraryEntry; journeyId: string; projectId: string }) {
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">{entry.title}</CardTitle>
          <CardDescription className="break-all font-mono text-xs">{entry.entryId}</CardDescription>
        </div>
        <Badge variant="outline">{label(entry.kind)}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">
          {entry.sourceContentHash ?? 'No source content hash'} · {entry.createdAt.toLocaleString()}
        </p>
        <Button asChild size="sm" variant="outline">
          <Link
            href={`/quality-journeys/${encodeURIComponent(journeyId)}/artifacts/${encodeURIComponent(entry.entryId)}?project=${encodeURIComponent(projectId)}`}
          >
            Inspect <ExternalLink aria-hidden="true" className="ml-2 size-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
function EmptyArtifacts() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No matching artifacts</CardTitle>
        <CardDescription>Try another artifact kind or return after the journey records durable output.</CardDescription>
      </CardHeader>
    </Card>
  )
}
