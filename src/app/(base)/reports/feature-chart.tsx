'use client'

import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Bar, BarChart, XAxis, YAxis } from 'recharts'

interface FeatureChartProps {
  config: ChartConfig
  /** Stacked segments are counts; `total` should equal the sum of the four outcome columns (used for the value axis). */
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
  const maxCount = data.reduce((maximum, item) => Math.max(maximum, item.total), 1)
  const barHeight = 40
  const maxHeight = 300 // Maximum height to prevent bars from becoming too thick
  const calculatedHeight = data.length * barHeight
  const minHeight = Math.min(Math.max(calculatedHeight, 200), maxHeight) // Cap at maxHeight

  return (
    <>
      <p className="mb-4 mt-2 text-center text-sm text-muted-foreground">
        Outcomes by {config.feature?.label === 'Test Suite' ? 'test suite' : 'feature'}
      </p>
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
          <XAxis
            dataKey="total"
            type="number"
            domain={[0, maxCount]}
            tickCount={Math.min(maxCount + 1, 5)}
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
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
      <div
        className="app-focus mt-3 overflow-x-auto rounded-md border border-border"
        role="region"
        aria-label="Outcome details"
        tabIndex={0}
      >
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Outcome counts by {config.feature?.label ?? 'feature'}</caption>
          <thead className="bg-muted text-muted-foreground">
            <tr>
              <th scope="col" className="px-2 py-2 font-medium">
                {config.feature?.label ?? 'Feature'}
              </th>
              {(['passed', 'failed', 'cancelled', 'unknown'] as const).map(result => (
                <th key={result} scope="col" className="px-1.5 py-2 text-right font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-sm"
                      style={{ background: config[result]?.color }}
                    />
                    {config[result]?.label ?? result}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-foreground">
            {data.map((item, index) => (
              <tr key={`${item.feature}-${index}`}>
                <th scope="row" className="px-2 py-2 font-medium">
                  {item.feature}
                </th>
                {(['passed', 'failed', 'cancelled', 'unknown'] as const).map(result => (
                  <td key={result} className="px-1.5 py-2 text-right tabular-nums">
                    {item[result]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
