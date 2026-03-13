import { Card, CardTitle, CardContent, CardHeader } from '@/components/ui/card'

const ReportMetricCard = ({ title, value }: { title: string; value: string }) => {
  return (
    <Card className="min-w-60 shadow-none w-full bg-gray-500/10 border-none">
      <CardHeader>
        <CardTitle className="font-semibold text-gray-400">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-4xl font-bold text-emerald-500">{value}</div>
      </CardContent>
    </Card>
  )
}

export default ReportMetricCard
