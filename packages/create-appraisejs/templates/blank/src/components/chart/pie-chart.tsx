'use client'

import React from 'react'
import { Label } from 'recharts'
import { ChartConfig, ChartLegend, ChartLegendContent, ChartTooltipContent } from '../ui/chart'
import { ChartTooltip } from '../ui/chart'
import { ChartContainer } from '../ui/chart'
import { Pie, PieChart } from 'recharts'
import { CardContent, CardHeader, CardTitle } from '../ui/card'
import { Card, CardDescription } from '../ui/card'
import { cn } from '@/lib/utils'

const PieChartGraph = ({
  chartConfig,
  chartData,
  chartLabelValue,
  chartLabelText,
  chartTitle,
  chartDescription,
  chartValueKey,
  chartNameKey,
  className,
}: {
  chartConfig: ChartConfig
  chartData: Record<string, unknown>[]
  chartLabelValue: string
  chartLabelText: string
  chartTitle: string
  chartDescription: string
  chartValueKey: string
  chartNameKey: string
  className?: React.ComponentProps<'div'>['className']
}) => {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="items-center pb-0">
        <CardTitle>{chartTitle}</CardTitle>
        <CardDescription>{chartDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[250px]">
          <PieChart>
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Pie data={chartData} dataKey={chartValueKey} nameKey={chartNameKey} innerRadius={60} strokeWidth={5}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                        <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-3xl font-bold">
                          {chartLabelValue}
                        </tspan>
                        <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 24} className="fill-muted-foreground">
                          {chartLabelText}
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </Pie>
            <ChartLegend
              content={<ChartLegendContent nameKey={chartNameKey} />}
              className="-translate-y-2 flex-wrap gap-2 [&>*]:basis-1/4 [&>*]:justify-center"
            />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export default PieChartGraph
