'use client'

import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Bar, BarChart, XAxis, YAxis } from 'recharts'

interface FeatureChartProps {
  config: ChartConfig
  data: Array<{
    feature: string
    passed: number
    failed: number
    cancelled: number
    unknown: number
    total: number
  }>
}

export default function FeatureChart({ config, data }: FeatureChartProps) {
  // Calculate height based on number of items (each bar needs ~40px)
  // Set a maximum height to prevent bars from becoming too thick when there are few items
  const barHeight = 40
  const maxHeight = 300 // Maximum height to prevent bars from becoming too thick
  const calculatedHeight = data.length * barHeight
  const minHeight = Math.min(Math.max(calculatedHeight, 200), maxHeight) // Cap at maxHeight

  return (
    <>
      <p className="mb-6 mt-2 text-center text-xs text-muted-foreground">Results by Feature</p>
      <ChartContainer
        config={config}
        className="min-h-[200px] w-full"
        style={{ minHeight: `${minHeight}px`, maxHeight: `${maxHeight}px` }}
      >
        <BarChart
          accessibilityLayer
          data={data}
          layout="vertical"
          barCategoryGap="20%"
          margin={{
            left: 5,
          }}
        >
          <YAxis dataKey="feature" type="category" tickLine={false} tickMargin={10} axisLine={false} width={100} />
          <XAxis dataKey="total" type="number" hide />
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          <Bar
            dataKey="passed"
            stackId="scenarios"
            radius={[0, 0, 0, 0]}
            fill={config['passed']?.color as string}
            stroke="none"
          />
          <Bar
            dataKey="failed"
            stackId="scenarios"
            radius={[0, 0, 0, 0]}
            fill={config['failed']?.color as string}
            stroke="none"
          />
          <Bar
            dataKey="cancelled"
            stackId="scenarios"
            radius={[0, 0, 0, 0]}
            fill={config['cancelled']?.color as string}
            stroke="none"
          />
          <Bar
            dataKey="unknown"
            stackId="scenarios"
            radius={[0, 0, 0, 0]}
            fill={config['unknown']?.color as string}
            stroke="none"
          />
        </BarChart>
      </ChartContainer>
    </>
  )
}
