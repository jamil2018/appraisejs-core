'use client'

import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Pie, PieChart, Label } from 'recharts'

interface OverviewChartProps {
  config: ChartConfig
  data: Array<{ result: string; value: number; fill: string }>
}

const calculatePassRate = (data: Array<{ result: string; value: number; fill: string }>) => {
  const total = data.reduce((acc, curr) => acc + curr.value, 0)
  const passed = data.find(item => item.result === 'passed')?.value || 0
  return Math.round((passed / total) * 100)
}

export default function OverviewChart({ config, data }: OverviewChartProps) {
  return (
    <>
      <p className="mt-2 text-center text-xs text-muted-foreground">Status(%) by Feature</p>
      <ChartContainer config={config} className="mx-auto aspect-square max-h-[250px]">
        <PieChart>
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          <Pie data={data} dataKey="value" nameKey="result" innerRadius={60} strokeWidth={5}>
            <Label
              content={({ viewBox }) => {
                if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                  return (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-3xl font-bold">
                        {calculatePassRate(data)}%
                      </tspan>
                      <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 24} className="fill-muted-foreground">
                        Pass Rate
                      </tspan>
                    </text>
                  )
                }
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>
    </>
  )
}
