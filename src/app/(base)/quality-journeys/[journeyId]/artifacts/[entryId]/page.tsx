export const metadata = { title: 'Journey Artifact' }

import Link from 'next/link'
import { notFound } from 'next/navigation'

import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireActiveProject } from '@/lib/active-project'
import { getQualityJourneyLibraryArtifact } from '@/services/coordinator/quality-journey-artifact-library-service'
import { ServiceError } from '@/services/shared/errors'

type PageProps = {
  params: Promise<{ journeyId: string; entryId: string }>
  searchParams?: Promise<{ project?: string }>
}

function label(value: string) {
  return value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, character => character.toUpperCase())
}

export default async function QualityJourneyArtifactDetailPage({ params, searchParams }: PageProps) {
  const [{ journeyId, entryId }, query] = await Promise.all([params, searchParams])
  const project = await requireActiveProject(query?.project)
  const artifact = await getQualityJourneyLibraryArtifact({ journeyId, targetProjectId: project.id, entryId }).catch(
    error => {
      if (error instanceof ServiceError && error.code === 'NOT_FOUND') notFound()
      throw error
    },
  )

  return (
    <main className="space-y-6 pb-10">
      <Button asChild size="sm" variant="ghost">
        <Link
          href={`/quality-journeys/${encodeURIComponent(journeyId)}/artifacts?project=${encodeURIComponent(project.id)}`}
        >
          Back to artifact library
        </Link>
      </Button>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <PageHeader>{artifact.entry.title}</PageHeader>
          <Badge variant="outline">{label(artifact.entry.kind)}</Badge>
        </div>
        <HeaderSubtitle>Public artifact projection and immutable lineage.</HeaderSubtitle>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="break-all font-mono text-sm">{artifact.entry.entryId}</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[70vh] overflow-auto rounded-md bg-muted p-4 text-xs leading-5">
            {JSON.stringify(artifact.entry, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </main>
  )
}
