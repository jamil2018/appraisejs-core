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
import { readQualityAssessment } from '@/services/coordinator/quality-design-service'
import { ServiceError } from '@/services/shared/errors'

import { AssessmentDecisionReview } from './assessment-decision-review'
import { AssessmentEvidenceReview } from './assessment-evidence-review'
import { AssessmentExecutionControls } from './assessment-execution-controls'

type PageProps = { params: Promise<{ assessmentId: string }>; searchParams?: Promise<{ project?: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { assessmentId } = await params
  return { title: `Assessment ${assessmentId}` }
}

export default async function AssessmentDetailPage({ params, searchParams }: PageProps) {
  const [{ assessmentId }, parameters] = await Promise.all([params, searchParams])
  const project = await requireActiveProject(parameters?.project)
  let packet: Awaited<ReturnType<typeof readQualityAssessment>>
  try {
    packet = await readQualityAssessment(assessmentId)
  } catch (error) {
    if (error instanceof ServiceError && error.code === 'NOT_FOUND') notFound()
    throw error
  }
  if (packet.qualityPlan.targetProjectId !== project.id) notFound()

  return (
    <main className="space-y-6 pb-10">
      <header className="space-y-4">
        <Button asChild size="sm" variant="ghost">
          <Link href="/assessments">
            <ArrowLeft aria-hidden="true" className="mr-2 size-4" />
            Assessments
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
              Assessment of immutable subject {packet.subject.subjectKind.toLocaleLowerCase()} against Quality Plan
              revision {packet.revision.revision.revision}.
            </HeaderSubtitle>
          </div>
          <Badge className="capitalize" variant="outline">
            {packet.assessment.status.toLocaleLowerCase()}
          </Badge>
        </div>
      </header>
      <section className="grid gap-4 lg:grid-cols-3">
        <SummaryCard label="Subject digest" value={packet.subject.subjectDigest} mono />
        <SummaryCard label="Authority" value={packet.subject.authority} />
        <SummaryCard label="Requirement alignment" value={packet.assessment.alignment.toLocaleLowerCase()} />
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <DetailCard
          title="Readiness"
          description="Every requirement and validation condition needed before a decision."
        >
          <Badge className="mb-3" variant={packet.readiness.ready ? 'default' : 'outline'}>
            {packet.readiness.ready ? 'Ready' : 'Blocked'}
          </Badge>
          {packet.readiness.blockers.length ? (
            <ul className="list-disc space-y-2 pl-5 text-sm text-amber-200">
              {packet.readiness.blockers.map(blocker => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">All readiness conditions are satisfied.</p>
          )}
        </DetailCard>
        <DetailCard
          title="Evidence receipts"
          description="Sealed runtime evidence associated with this immutable subject."
        >
          <p className="text-2xl font-semibold">{packet.evidenceReceiptCount}</p>
          <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
            Evidence set: {packet.evidenceSetHash}
          </p>
        </DetailCard>
      </section>
      <AssessmentExecutionControls
        assessmentId={packet.assessment.id}
        blockers={packet.readiness.blockers}
        ready={packet.readiness.ready}
        runtimeCells={
          packet.readiness.runtimeCells as Array<{
            validationVersionId: string
            resultMatrixCell: string
            environmentId: string
            browserEngine: 'CHROMIUM' | 'FIREFOX' | 'WEBKIT'
          }>
        }
        status={packet.assessment.status}
      />
      <DetailCard
        title="Validation design"
        description="The canonical validation versions evaluated by this assessment."
      >
        {packet.revision.validationVersions.length ? (
          <ul className="grid gap-3 lg:grid-cols-2">
            {packet.revision.validationVersions.map(validation => (
              <li className="rounded-md border border-white/[0.08] bg-white/[0.025] p-3" key={validation.id}>
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-medium">{validation.validationIdentity}</p>
                  <Badge variant="outline">{validation.status.toLocaleLowerCase()}</Badge>
                </div>
                <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">{validation.canonicalHash}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No validation versions are attached.</p>
        )}
      </DetailCard>
      <AssessmentEvidenceReview
        baseline={packet.baseline}
        evidenceReceipts={packet.evidenceReceipts}
        validationVersions={packet.revision.validationVersions}
        runtimeCells={packet.readiness.runtimeCells}
      />
      <AssessmentDecisionReview
        assessmentId={packet.assessment.id}
        canDecide={
          packet.readiness.ready &&
          packet.evidenceReceiptCount > 0 &&
          packet.assessment.status === 'EVIDENCE_REVIEW' &&
          packet.decisions.length === 0
        }
        decisions={packet.decisions}
        evidenceSetHash={packet.evidenceSetHash}
      />
    </main>
  )
}

function SummaryCard({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className={mono ? 'break-all font-mono text-sm' : 'text-lg capitalize'}>{value}</CardTitle>
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
