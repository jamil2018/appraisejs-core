import { DataTable } from '@/components/ui/data-table'
import { reportTableCols } from './report-table-columns'
import type { ReportWithRelations } from '@/types/report'

interface ReportTableProps {
  reports: ReportWithRelations[]
}

const ReportTable = ({ reports }: ReportTableProps) => {
  return (
    <>
      <DataTable
        tableLabel="Run reports"
        columns={reportTableCols}
        data={reports}
        filterColumn="testRunName"
        filterPlaceholder="Search reports"
        density="compact"
        initialColumnVisibility={{ tags: false, totalTestCases: false }}
        key={`reports:${reports[0].testRun.targetProjectId}`}
        viewKey={`reports:${reports[0].testRun.targetProjectId}`}
      />
    </>
  )
}

export default ReportTable
