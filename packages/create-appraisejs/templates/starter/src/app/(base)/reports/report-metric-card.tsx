import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const metricStyles: Record<
  string,
  {
    card: string
    glow: string
    dot: string
    value: string
  }
> = {
  'Total Tests': {
    card: 'bg-gradient-to-br from-card via-card to-primary/5',
    glow: 'bg-primary/20',
    dot: 'bg-primary',
    value: 'text-primary',
  },
  Passed: {
    card: 'bg-gradient-to-br from-card via-card to-primary/10',
    glow: 'bg-primary/25',
    dot: 'bg-green-500',
    value: 'text-green-500',
  },
  Failed: {
    card: 'bg-gradient-to-br from-card via-card to-destructive/10',
    glow: 'bg-destructive/20',
    dot: 'bg-destructive',
    value: 'text-destructive',
  },
  Untested: {
    card: 'bg-gradient-to-br from-card via-card to-secondary/70',
    glow: 'bg-muted-foreground/15',
    dot: 'bg-muted-foreground',
    value: 'text-foreground',
  },
}

const ReportMetricCard = ({ title, value }: { title: string; value: string }) => {
  const styles = metricStyles[title] ?? {
    card: 'bg-gradient-to-br from-card to-muted/40',
    glow: 'bg-primary/15',
    dot: 'bg-primary',
    value: 'text-foreground',
  }

  return (
    <Card
      className={cn(
        'group relative min-w-0 overflow-hidden rounded-2xl border-gray-500/10 bg-transparent shadow-sm transition-colors',
        styles.card,
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute -right-10 -top-10 size-28 rounded-full blur-3xl transition-opacity group-hover:opacity-90',
          styles.glow,
        )}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/20" />

      <CardHeader className="space-y-3 p-5 pb-3">
        <div className="flex items-center gap-3">
          <span className={cn('h-2.5 w-2.5 rounded-full shadow-sm', styles.dot)} />
          <CardTitle className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {title}
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-0">
        <div className={cn('text-4xl font-bold tracking-tight sm:text-[2.75rem]', styles.value)}>{value}</div>
      </CardContent>
    </Card>
  )
}

export default ReportMetricCard
