import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, ClipboardCheck, ShieldCheck } from 'lucide-react'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import HeaderSubtitle from '@/components/typography/page-header-subtitle'
import PageHeader from '@/components/typography/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireActiveProject } from '@/lib/active-project'
import { readQualityRequirementGraph } from '@/services/coordinator/quality-design-service'
import { ServiceError } from '@/services/shared/errors'

import { QualityRequirementsReview } from './quality-requirements-review'
import { QualityLifecycleControls } from './quality-lifecycle-controls'

type PageProps = {
  params: Promise<{ qualityPlanId: string }>
  searchParams?: Promise<{ project?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { qualityPlanId } = await params
  return { title: `Quality Plan ${qualityPlanId}` }
}

export default async function QualityPlanDetailPage({ params, searchParams }: PageProps) {
  const [{ qualityPlanId }, parameters] = await Promise.all([params, searchParams])
  const project = await requireActiveProject(parameters?.project)
  let packet: Awaited<ReturnType<typeof readQualityRequirementGraph>>
  try {
    packet = await readQualityRequirementGraph({ qualityPlanId })
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'NOT_FOUND') notFound()
    throw error
  }
  if (packet.qualityPlan.targetProjectId !== project.id) notFound()

  return (
    <main className="space-y-6 pb-10">
      <header className="space-y-4">
        <Button asChild size="sm" variant="ghost">
          <Link href="/quality-plans">
            <ArrowLeft aria-hidden="true" className="mr-2 size-4" />
            Quality Plans
          </Link>
        </Button>
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
          <div className="space-y-2">
            <PageHeader>
              <span className="flex items-center gap-3">
                <ClipboardCheck aria-hidden="true" className="size-7 text-primary sm:size-8" />
                {packet.qualityPlan.title}
              </span>
            </PageHeader>
            <HeaderSubtitle>
              {packet.qualityPlan.description ?? 'Immutable quality requirements and validation design.'}
            </HeaderSubtitle>
          </div>
          <Badge className="capitalize" variant="outline">
            {packet.revision.status.replaceAll('_', ' ').toLocaleLowerCase()}
          </Badge>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-3" aria-label="Quality Plan revision summary">
        <RevisionCard label="Revision" value={`Revision ${packet.revision.revision}`} />
        <RevisionCard label="Requirements hash" value={packet.revision.contentHash} mono />
        <RevisionCard label="Validation design hash" value={packet.designHash ?? 'Not designed'} mono />
      </section>

      <QualityRequirementsReview
        approvalBlocked={packet.approval.blocked}
        qualityPlanId={packet.qualityPlan.id}
        revisionHash={packet.revision.contentHash}
        revisionId={packet.revision.id}
        revisionStatus={packet.revision.status}
      />

      <QualityLifecycleControls
        designHash={packet.designHash}
        obligations={packet.obligations}
        qualityPlanId={packet.qualityPlan.id}
        queries={packet.queries}
        revisionId={packet.revision.id}
        revisionStatus={packet.revision.status}
        targetKind={project.kind}
        validations={packet.validationVersions}
      />

      <section className="grid gap-6 xl:grid-cols-2">
        <DetailCard
          title="Requirement snapshots"
          description="Content-addressed requirements captured in this immutable revision."
        >
          <ul className="space-y-3">
            {packet.requirements.map(requirement => (
              <li className="rounded-md border border-white/[0.08] bg-white/[0.025] p-3" key={requirement.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{requirement.kind.toLocaleLowerCase()}</Badge>
                  <span className="text-xs text-muted-foreground">{requirement.externalRef ?? requirement.id}</span>
                </div>
                <p className="mt-2 text-sm leading-6">{requirement.text}</p>
                <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">{requirement.contentHash}</p>
              </li>
            ))}
          </ul>
        </DetailCard>
        <DetailCard
          title="Quality obligations"
          description="Assertions the revision must satisfy, linked to requirement snapshots."
        >
          <ul className="space-y-3">
            {packet.obligations.map(obligation => (
              <li className="rounded-md border border-white/[0.08] bg-white/[0.025] p-3" key={obligation.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{obligation.title}</p>
                  <Badge variant="outline">{obligation.minimumAssurance.toLocaleLowerCase()}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{obligation.intent}</p>
                {obligation.limitations ? (
                  <p className="mt-2 text-xs text-amber-200">Limitation: {obligation.limitations}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </DetailCard>
      </section>

      <DetailCard
        title="Validation versions"
        description="Canonical validation designs and their immutable review state."
      >
        {packet.validationVersions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No validation versions have been designed for this revision.</p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {packet.validationVersions.map(validation => (
              <li className="rounded-md border border-white/[0.08] bg-white/[0.025] p-3" key={validation.id}>
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-medium">{validation.validationIdentity}</p>
                  <Badge variant="outline">{validation.status.toLocaleLowerCase()}</Badge>
                </div>
                <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">{validation.canonicalHash}</p>
                {validation.scenarioApprovalHash ? (
                  <p className="mt-2 break-all text-xs text-emerald-200">
                    Reviewed against {validation.scenarioApprovalHash}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </DetailCard>

      <DetailCard
        title="Requirement queries"
        description="Questions and recorded reasoning used to determine requirement approval."
      >
        {packet.queries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No requirement queries were raised.</p>
        ) : (
          <ul className="space-y-3">
            {packet.queries.map(query => (
              <li className="rounded-md border border-white/[0.08] bg-white/[0.025] p-3" key={query.id}>
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="text-sm">{query.prompt}</p>
                  <Badge variant="outline">{query.status.replaceAll('_', ' ').toLocaleLowerCase()}</Badge>
                </div>
                {query.answer ? <p className="mt-2 text-sm text-muted-foreground">Answer: {query.answer}</p> : null}
                {query.rationale ? (
                  <p className="mt-1 text-xs text-muted-foreground">Rationale: {query.rationale}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </DetailCard>
    </main>
  )
}

function RevisionCard({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className={mono ? 'break-all font-mono text-sm' : 'text-lg'}>{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}

function DetailCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
