'use client'

import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Bar, BarChart, XAxis, YAxis } from 'recharts'

export default function DurationChart({
  config,
  data,
}: {
  config: ChartConfig
  data: Array<{ feature: string; duration: number }>
}) {
  return (
    <>
      <p className="mb-4 mt-2 text-center text-sm text-muted-foreground">Duration by feature (seconds)</p>
      <ChartContainer config={config} className="min-h-[300px] w-full">
        <BarChart
          accessibilityLayer
          data={data}
          layout="vertical"
          margin={{
            left: 5,
          }}
        >
          <YAxis dataKey="feature" type="category" tickLine={false} tickMargin={10} axisLine={false} width={100} />
          <XAxis dataKey="duration" type="number" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          <Bar dataKey="duration" fill="var(--chart-2)" />
        </BarChart>
      </ChartContainer>
      <dl
        className="mt-3 divide-y divide-border rounded-md border border-border px-3 text-sm"
        aria-label="Feature durations"
      >
        {data.map((item, index) => (
          <div key={`${item.feature}-${index}`} className="flex items-start justify-between gap-3 py-2">
            <dt className="min-w-0 break-words text-muted-foreground">{item.feature}</dt>
            <dd className="shrink-0 font-medium tabular-nums text-foreground">{item.duration} s</dd>
          </div>
        ))}
      </dl>
    </>
  )
}
