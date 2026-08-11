'use client'

import Link from 'next/link'
import { ArrowRight, ClipboardCheck, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type AssessmentPacket = {
  assessment: { id: string; status: string; alignment: string; observedAssurance: string | null }
  qualityPlan: { title: string }
  subject: { subjectDigest: string; subjectKind: string; authority: string }
  readiness: { ready: boolean; blockers: string[] }
  evidenceReceiptCount: number
  decisions: Array<{ decision: string }>
}

export function AssessmentsBrowser({ assessments }: { assessments: AssessmentPacket[] }) {
  const [query, setQuery] = useState('')
  const visibleAssessments = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    if (!normalized) return assessments
    return assessments.filter(assessment =>
      [
        assessment.qualityPlan.title,
        assessment.subject.subjectDigest,
        assessment.subject.authority,
        assessment.assessment.status,
      ].some(value => value.toLocaleLowerCase().includes(normalized)),
    )
  }, [assessments, query])

  return (
    <section className="space-y-4" aria-label="Assessments">
      <div className="relative max-w-md">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label="Search Assessments"
          className="pl-9"
          onChange={event => setQuery(event.target.value)}
          placeholder="Search Assessments..."
          type="search"
          value={query}
        />
      </div>
      {assessments.length === 0 ? (
        <EmptyAssessments />
      ) : visibleAssessments.length === 0 ? (
        <p
          className="rounded-lg border border-dashed border-white/[0.1] p-8 text-center text-sm text-muted-foreground"
          role="status"
        >
          No assessments match “{query}”.
        </p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visibleAssessments.map(assessment => (
            <Card
              className="border-l-primary/70 group relative overflow-hidden border-l-4"
              key={assessment.assessment.id}
            >
              <Link
                aria-label={`Review assessment for ${assessment.qualityPlan.title}`}
                className="absolute inset-0 z-10 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={`/assessments/${assessment.assessment.id}`}
              />
              <CardHeader className="pr-16">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardDescription className="line-clamp-1 font-mono text-xs text-primary">
                      {assessment.subject.subjectKind.toLocaleLowerCase()}
                    </CardDescription>
                    <CardTitle className="mt-2 line-clamp-2 text-lg">{assessment.qualityPlan.title}</CardTitle>
                  </div>
                  <Badge className="shrink-0 capitalize" variant="outline">
                    {assessment.assessment.status.toLocaleLowerCase()}
                  </Badge>
                </div>
                <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
                  {assessment.subject.subjectDigest}
                </p>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 pr-14 text-xs text-muted-foreground">
                <span className="bg-background/60 rounded-md border px-2 py-1">
                  {assessment.evidenceReceiptCount} evidence receipts
                </span>
                <span className="bg-background/60 rounded-md border px-2 py-1">
                  {assessment.readiness.ready
                    ? 'Ready for evidence'
                    : `${assessment.readiness.blockers.length} readiness blockers`}
                </span>
                {assessment.decisions[0] ? (
                  <span className="bg-background/60 rounded-md border px-2 py-1 capitalize">
                    {assessment.decisions[0].decision.toLocaleLowerCase()}
                  </span>
                ) : null}
              </CardContent>
              <span className="border-primary/30 pointer-events-none absolute bottom-5 right-5 z-20 flex size-9 items-center justify-center rounded-md border bg-primary text-primary-foreground">
                <ArrowRight aria-hidden="true" className="size-4" />
              </span>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}

function EmptyAssessments() {
  return (
    <Card className="border-dashed border-white/[0.1] bg-[rgba(18,37,64,0.42)] shadow-none">
      <CardContent className="flex min-h-64 flex-col items-center justify-center p-6 text-center">
        <ClipboardCheck aria-hidden="true" className="size-8 text-muted-foreground" />
        <h2 className="mt-4 text-base font-semibold">No assessments yet</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Create an assessment for an immutable subject after its Quality Plan validations are published.
        </p>
      </CardContent>
    </Card>
  )
}
