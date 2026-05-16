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
        columns={reportTableCols}
        data={reports}
        filterColumn="testRunName"
        filterPlaceholder="Filter by test run name..."
      />
    </>
  )
}

export default ReportTable
