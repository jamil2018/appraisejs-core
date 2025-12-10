import PageHeader from '@/components/typography/page-header'
import HeaderSubtitle from '@/components/typography/page-header-subtitle'

const ViewReport = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  return (
    <>
      <div className="mb-8">
        <PageHeader>View Report</PageHeader>
        <HeaderSubtitle>View report details and live logs</HeaderSubtitle>
      </div>
      <div className="space-y-6">
        <h1>Report {id}</h1>
      </div>
    </>
  )
}

export default ViewReport
