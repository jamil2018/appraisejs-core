import Link from 'next/link'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { withProjectScope } from '@/lib/project-scope'
import { compareProjectReports } from '@/services/report/report-comparison-service'
import { ServiceError } from '@/services/shared/errors'
import type { ReportWithRelations } from '@/types/report'

type Props = {
  projectId: string
  reports: ReportWithRelations[]
  baselineReportId?: string
  candidateReportId?: string
}

const reportHref = (projectId: string, reportId: string) =>
  withProjectScope(`/reports/${encodeURIComponent(reportId)}`, projectId)

export async function ReportComparison({ projectId, reports, baselineReportId, candidateReportId }: Props) {
  let comparison: Awaited<ReturnType<typeof compareProjectReports>> | null = null
  let error: string | null = null
  if (baselineReportId && candidateReportId) {
    try {
      comparison = await compareProjectReports({ targetProjectId: projectId, baselineReportId, candidateReportId })
    } catch (cause) {
      if (!(cause instanceof ServiceError)) throw cause
      error = cause.message
    }
  }
  return (
    <section aria-labelledby="compare-reports-heading" className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="font-semibold" id="compare-reports-heading">
          Compare two reports
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Compare recorded run and case outcomes within this project.
        </p>
      </div>
      <form action="/reports" className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" method="get">
        <input name="project" type="hidden" value={projectId} />
        {(
          [
            ['baseline', 'Baseline report', baselineReportId],
            ['candidate', 'Candidate report', candidateReportId],
          ] as const
        ).map(([name, label, selected]) => (
          <label className="grid gap-1 text-sm" key={name}>
            <span>{label}</span>
            <select
              className="app-focus min-h-9 min-w-0 rounded-md border bg-background px-2"
              defaultValue={selected ?? ''}
              name={name}
              required
            >
              <option disabled value="">
                Choose a report
              </option>
              {reports.map(report => (
                <option key={report.id} value={report.id}>
                  {report.testRun.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <Button type="submit">Compare</Button>
      </form>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Comparison unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {comparison && (
        <div className="space-y-3">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            {(
              [
                ['Baseline', comparison.baseline],
                ['Candidate', comparison.candidate],
              ] as const
            ).map(([label, item]) => (
              <div className="rounded-lg border p-3" key={item.reportId}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <Link
                  className="app-focus font-medium text-primary hover:underline"
                  href={reportHref(projectId, item.reportId)}
                >
                  {item.name}
                </Link>
                <p>
                  {item.status} · {item.result} · evidence {item.evidenceHealth}
                </p>
              </div>
            ))}
          </div>
          <Table scrollLabel="Compared report case outcomes">
            <TableHeader>
              <TableRow>
                <TableHead>Test case</TableHead>
                <TableHead>Baseline</TableHead>
                <TableHead>Candidate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparison.cases.map(item => (
                <TableRow key={item.testCaseId}>
                  <TableCell>{item.title}</TableCell>
                  <TableCell>{item.baseline ?? 'Not run'}</TableCell>
                  <TableCell>{item.candidate ?? 'Not run'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}
