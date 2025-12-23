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
        <XAxis dataKey="duration" type="number" hide />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="duration" fill="oklch(54.6% 0.245 262.881)" />
      </BarChart>
    </ChartContainer>
  )
}
