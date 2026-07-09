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
    card: 'border-l-emerald-400/70',
    dot: 'bg-green-500',
    value: 'text-green-500',
  },
  Failed: {
    card: 'border-l-destructive/70',
    dot: 'bg-destructive',
    value: 'text-destructive',
  },
  Untested: {
    card: 'border-l-white/20',
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
        'group min-w-0 overflow-hidden rounded-lg border-l-[3px] border-white/[0.075] bg-[rgba(18,37,64,0.34)] shadow-none transition-colors hover:bg-[rgba(22,47,78,0.42)]',
        styles.card,
      )}
    >
      <CardHeader className="space-y-3 p-5 pb-3">
        <div className="flex items-center gap-3">
          <span className={cn('h-2.5 w-2.5 rounded-full shadow-sm', styles.dot)} />
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-0">
        <div className={cn('text-4xl font-semibold tracking-tight', styles.value)}>{value}</div>
      </CardContent>
    </Card>
  )
}

export default ReportMetricCard
