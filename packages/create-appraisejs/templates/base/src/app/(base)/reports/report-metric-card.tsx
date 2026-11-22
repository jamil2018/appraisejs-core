import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const metricStyles: Record<
  string,
  {
    card: string
    dot: string
    value: string
  }
> = {
  'Total Tests': {
    card: 'border-l-primary/60',
    dot: 'bg-primary',
    value: 'text-primary',
  },
  Passed: {
    card: 'border-l-success-border',
    dot: 'bg-success',
    value: 'text-success',
  },
  Failed: {
    card: 'border-l-danger-border',
    dot: 'bg-danger',
    value: 'text-danger',
  },
  Untested: {
    card: 'border-l-border',
    dot: 'bg-muted-foreground',
    value: 'text-foreground',
  },
}

const ReportMetricCard = ({ title, value }: { title: string; value: string }) => {
  const styles = metricStyles[title] ?? {
    card: 'border-l-primary/60',
    dot: 'bg-primary',
    value: 'text-foreground',
  }

  return (
    <Card
      className={cn(
        'group min-w-0 overflow-hidden rounded-lg border-l-4 border-border bg-card shadow-none transition-colors hover:bg-card',
        styles.card,
      )}
    >
      <CardHeader className="space-y-3 p-4 pb-3">
        <div className="flex items-center gap-3">
          <span className={cn('size-2 rounded-full', styles.dot)} />
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-0">
        <div className={cn('text-3xl font-semibold tracking-tight', styles.value)}>{value}</div>
      </CardContent>
    </Card>
  )
}

export default ReportMetricCard
