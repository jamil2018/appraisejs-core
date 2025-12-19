import { Card, CardTitle, CardContent, CardHeader } from '@/components/ui/card'

const ReportMetricCard = ({ title, value }: { title: string; value: string }) => {
  return (
    <Card className="shadow-none dark:border-none">
      <CardHeader>
        <CardTitle className="text-lg text-gray-400">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-primary">{value}</div>
      </CardContent>
    </Card>
  )
}

export default ReportMetricCard
