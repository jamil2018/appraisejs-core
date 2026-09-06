import type { Metadata } from 'next'
import Link from 'next/link'
import { Archive } from 'lucide-react'

import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireActiveProject } from '@/lib/active-project'
import { readQualityJourneyCompatibility } from '@/services/coordinator/quality-journey-compatibility-service'

export const metadata: Metadata = { title: 'Quality Journey Compatibility History' }

type PageProps = {
  searchParams?: Promise<{ project?: string; qualityPlanId?: string; revisionId?: string; offset?: string }>
}

function offset(value: string | undefined) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0
}

function href(projectId: string, values: { qualityPlanId?: string; revisionId?: string; offset?: string } = {}) {
  const parameters = new URLSearchParams({ project: projectId })
  for (const [key, value] of Object.entries(values)) if (value) parameters.set(key, value)
  return `/quality-journeys/compatibility?${parameters}`
}

export default async function QualityJourneyCompatibilityPage({ searchParams }: PageProps) {
  const query = await searchParams
  const project = await requireActiveProject(query?.project)
  const currentOffset = offset(query?.offset)
  const compatibility = await readQualityJourneyCompatibility({
    targetProjectId: project.id,
    qualityPlanId: query?.qualityPlanId,
    revisionId: query?.revisionId,
    offset: currentOffset,
  })
  const hasPrevious = compatibility.page.offset > 0
  const hasNext = compatibility.page.offset + compatibility.entries.length < compatibility.page.total

  return (
    <main className="space-y-6 pb-10">
      <header className="space-y-3">
        <Button asChild size="sm" variant="ghost">
          <Link href={`/quality-journeys?project=${encodeURIComponent(project.id)}`}>Back to Quality Journeys</Link>
        </Button>
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
          <div className="space-y-2">
            <PageHeader>
              <span className="flex items-center gap-3">
                <Archive aria-hidden="true" className="size-7 text-primary sm:size-8" />
                Compatibility history
              </span>
            </PageHeader>
            <HeaderSubtitle>
              Read-only Quality Plan history. This view does not establish Quality Journey lineage or authority.
            </HeaderSubtitle>
          </div>
          <Badge variant="outline">{compatibility.compatibility}</Badge>
        </div>
      </header>

      {compatibility.detail ? (
        <CompatibilityDetail detail={compatibility.detail} projectId={project.id} />
      ) : (
        <CompatibilityEntries entries={compatibility.entries} projectId={project.id} />
      )}

      {!compatibility.detail ? (
        <nav className="flex items-center justify-between gap-3" aria-label="Compatibility history pagination">
          {hasPrevious ? (
            <Button asChild variant="outline">
              <Link href={href(project.id, { offset: String(Math.max(0, currentOffset - compatibility.page.limit)) })}>
                Previous
              </Link>
            </Button>
          ) : (
            <Button disabled type="button" variant="outline">
              Previous
            </Button>
          )}
          <p className="text-sm text-muted-foreground">
            {compatibility.page.total
              ? `${compatibility.page.offset + 1}-${compatibility.page.offset + compatibility.entries.length} of ${compatibility.page.total}`
              : '0 revisions'}
          </p>
          {hasNext ? (
            <Button asChild variant="outline">
              <Link href={href(project.id, { offset: String(currentOffset + compatibility.page.limit) })}>Next</Link>
            </Button>
          ) : (
            <Button disabled type="button" variant="outline">
              Next
            </Button>
          )}
        </nav>
      ) : null}
    </main>
  )
}

type Compatibility = Awaited<ReturnType<typeof readQualityJourneyCompatibility>>
type CompatibilityEntry = Compatibility['entries'][number]

function CompatibilityEntries({ entries, projectId }: { entries: CompatibilityEntry[]; projectId: string }) {
  if (!entries.length)
    return (
      <Card>
        <CardHeader>
          <CardTitle>No compatibility history</CardTitle>
          <CardDescription>No Quality Plan revisions exist for this project.</CardDescription>
        </CardHeader>
      </Card>
    )
  return (
    <section className="space-y-3" aria-label="Compatibility revisions">
      {entries.map(entry => (
        <Card key={entry.revision.id}>
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">{entry.qualityPlan.title}</CardTitle>
              <CardDescription className="break-all font-mono text-xs">{entry.revision.id}</CardDescription>
            </div>
            <Badge variant="outline">{entry.revision.status}</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground">
              Revision {entry.revision.revision} · {entry.counts.validationVersions} validation versions ·{' '}
              {entry.counts.assessments} assessments
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href={href(projectId, { qualityPlanId: entry.qualityPlan.id, revisionId: entry.revision.id })}>
                Inspect history
              </Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </section>
  )
}

function CompatibilityDetail({
  detail,
  projectId,
}: {
  detail: NonNullable<Compatibility['detail']>
  projectId: string
}) {
  return (
    <section className="space-y-4" aria-label="Compatibility revision detail">
      <Button asChild size="sm" variant="outline">
        <Link href={href(projectId)}>All compatibility revisions</Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{detail.qualityPlan.title}</CardTitle>
          <CardDescription>
            Revision {detail.revision.revision} · {detail.revision.status} · {detail.revision.contentHash}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            No proven Journey lineage. This projection transfers no Journey authority.
          </p>
        </CardContent>
      </Card>
      <CompatibilityRecords
        title="Requirement snapshots"
        records={detail.requirementSnapshots}
        text={record => record.text}
      />
      <CompatibilityRecords
        title="Requirement analyses"
        records={detail.requirementAnalyses}
        text={record => `${record.status} · ${record.analysisHash}`}
      />
      <CompatibilityRecords
        title="Validation designs"
        records={detail.validationDesigns}
        text={record => `${record.status} · ${record.designHash}`}
      />
      <CompatibilityRecords
        title="Validation versions"
        records={detail.validationVersions}
        text={record => `${record.validationIdentity} v${record.version} · ${record.status} · ${record.canonicalHash}`}
      />
      <CompatibilityRecords
        title="Assessments"
        records={detail.assessments}
        text={record => `${record.status} · ${record.alignment} · ${record.id}`}
      />
    </section>
  )
}

function CompatibilityRecords<T extends { id: string }>({
  title,
  records,
  text,
}: {
  title: string
  records: T[]
  text: (record: T) => string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {records.length ? (
          <ul className="space-y-2 text-sm">
            {records.map(record => (
              <li key={record.id} className="break-all">
                {text(record)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No records.</p>
        )}
      </CardContent>
    </Card>
  )
}
