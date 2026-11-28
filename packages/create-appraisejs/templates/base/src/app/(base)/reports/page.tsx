import { getAllReportsAction } from '@/actions/reports/report-actions'
import { CollectionEmpty, CollectionHeader } from '@/components/data-state/collection-layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { Metadata } from 'next'
import Link from 'next/link'
import { requireActiveProject } from '@/lib/active-project'
import { withProjectScope } from '@/lib/project-scope'

import { isValidReportList } from './report-detail-helpers'
import { ReportComparison } from './report-comparison'
import ReportTable from './report-table'

export const metadata: Metadata = {
  title: 'Appraise | Reports',
  description: 'Manage reports for test runs',
}

export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; baseline?: string | string[]; candidate?: string | string[] }>
}) {
  const { project, baseline, candidate } = await searchParams
  const activeProject = await requireActiveProject(project)
  const { data, error, success, message } = await getAllReportsAction()
  const invalidData = !error && success !== false && !isValidReportList(data)
  const reports = isValidReportList(data) ? data : []

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <CollectionHeader title="Reports">
        <Button
          render={<Link href={withProjectScope('/quality-journeys/new', activeProject.id)} />}
          nativeButton={false}
          className="rounded-xl"
        >
          Start a Quality Journey
        </Button>
      </CollectionHeader>
      {success === false || error || invalidData ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn’t load reports</AlertTitle>
          <AlertDescription>{error || message || 'The report data could not be read.'}</AlertDescription>
        </Alert>
      ) : reports.length === 0 ? (
        <CollectionEmpty title="No completed-run reports yet">
          <Link
            href={withProjectScope('/test-runs/create', activeProject.id)}
            className="app-focus rounded-md text-sm text-primary hover:underline"
          >
            Prepare an independent run
          </Link>
        </CollectionEmpty>
      ) : (
        <>
          {reports.length > 1 && (
            <ReportComparison
              projectId={activeProject.id}
              reports={reports}
              baselineReportId={typeof baseline === 'string' ? baseline : undefined}
              candidateReportId={typeof candidate === 'string' ? candidate : undefined}
            />
          )}
          <ReportTable reports={reports} />
        </>
      )}
    </div>
  )
}
