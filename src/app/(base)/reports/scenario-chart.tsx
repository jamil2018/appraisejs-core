'use client'

import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Bar, BarChart, XAxis, YAxis } from 'recharts'

interface ScenarioChartProps {
  config: ChartConfig
  data: Array<{ feature: string; passed: number; fill: string }>
}

export default function ScenarioChart({ config, data }: ScenarioChartProps) {
  // Calculate minimum height based on number of items (each bar needs ~40px)
  const minHeight = Math.max(data.length * 40, 300)

  return (
    <ChartContainer config={config} className="min-h-[300px] w-full" style={{ minHeight: `${minHeight}px` }}>
      <BarChart
        accessibilityLayer
        data={data}
        layout="vertical"
        margin={{
          left: 5,
        }}
      >
        <YAxis dataKey="feature" type="category" tickLine={false} tickMargin={10} axisLine={false} width={100} />
        <XAxis dataKey="passed" type="number" hide />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="passed" layout="vertical" radius={5} fill={config['passed']?.color as string} />
      </BarChart>
    </ChartContainer>
  )
}
