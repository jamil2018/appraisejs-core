'use client'

import * as React from 'react'
import { use } from 'react'
import * as RechartsPrimitive from 'recharts'

import { cn } from '@/lib/utils'
import { getPayloadConfigFromPayload, resolveChartTooltipLabelValue } from './chart-utils'

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: '', dark: '.dark' } as const

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & ({ color?: string; theme?: never } | { color?: never; theme: Record<keyof typeof THEMES, string> })
}

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = use(ChartContext)

  if (!context) {
    throw new Error('useChart must be used within a <ChartContainer />')
  }

  return context
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<'div'> & {
  config: ChartConfig
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children']
}) {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        className={cn(
          "[&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

ChartContainer.displayName = 'Chart'

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(([, config]) => config.theme || config.color)

  if (!colorConfig.length) {
    return null
  }

  const chartThemeCss = Object.entries(THEMES)
    .map(
      ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color = itemConfig.theme?.[theme as keyof typeof itemConfig.theme] || itemConfig.color
    return color ? `  --color-${key}: ${color};` : null
  })
  .join('\n')}
}
`,
    )
    .join('\n')

  return <style>{chartThemeCss}</style>
}

const ChartTooltip = RechartsPrimitive.Tooltip

type ChartTooltipContentProps = React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
  React.ComponentProps<'div'> & {
    hideLabel?: boolean
    hideIndicator?: boolean
    indicator?: 'line' | 'dot' | 'dashed'
    nameKey?: string
    labelKey?: string
  }

const EMPTY_CHART_TOOLTIP_PAYLOAD = [] as NonNullable<ChartTooltipContentProps['payload']>

type ChartTooltipTitleProps = {
  config: ChartConfig
  resolvedPayload: NonNullable<ChartTooltipContentProps['payload']>
  hideLabel: boolean
  label: ChartTooltipContentProps['label']
  labelFormatter: ChartTooltipContentProps['labelFormatter']
  labelClassName?: string
  labelKey?: string
}

const ChartTooltipTitle = React.memo(function ChartTooltipTitle({
  config,
  resolvedPayload,
  hideLabel,
  label,
  labelFormatter,
  labelClassName,
  labelKey,
}: ChartTooltipTitleProps) {
  if (hideLabel || !resolvedPayload.length) {
    return null
  }

  const [item] = resolvedPayload
  const value = resolveChartTooltipLabelValue(config, item, label, labelKey)

  if (labelFormatter) {
    return <div className={cn('font-medium', labelClassName)}>{labelFormatter(value, resolvedPayload)}</div>
  }

  if (!value) {
    return null
  }

  return <div className={cn('font-medium', labelClassName)}>{value}</div>
})

ChartTooltipTitle.displayName = 'ChartTooltipTitle'

function ChartTooltipContent(props: ChartTooltipContentProps) {
  const { active, payload } = props
  if (!active || !payload?.length) {
    return null
  }
  return <ChartTooltipContentActive {...props} />
}

function ChartTooltipContentActive({
  payload,
  className,
  indicator = 'dot',
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
  nameKey,
  labelKey,
  ref,
}: ChartTooltipContentProps) {
  const { config } = useChart()
  const resolvedPayload = React.useMemo(() => (payload?.length ? payload : EMPTY_CHART_TOOLTIP_PAYLOAD), [payload])

  if (!resolvedPayload.length) {
    return null
  }

  const nestLabel = resolvedPayload.length === 1 && indicator !== 'dot'

  return (
    <div
      ref={ref}
      className={cn(
        'border-border/50 grid min-w-[8rem] items-start gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl',
        className,
      )}
    >
      {!nestLabel ? (
        <ChartTooltipTitle
          config={config}
          resolvedPayload={resolvedPayload}
          hideLabel={hideLabel}
          label={label}
          labelFormatter={labelFormatter}
          labelClassName={labelClassName}
          labelKey={labelKey}
        />
      ) : null}
      <div className="grid gap-1.5">
        {resolvedPayload.reduce<React.ReactNode[]>((items, item, index) => {
          if (item.type === 'none') {
            return items
          }

          const key = `${nameKey || item.name || item.dataKey || 'value'}`
          const itemConfig = getPayloadConfigFromPayload(config, item, key)
          const indicatorColor = color || item.payload.fill || item.color

          items.push(
            <div
              key={item.dataKey}
              className={cn(
                'flex w-full flex-wrap items-stretch gap-2 [&>svg]:size-2.5 [&>svg]:text-muted-foreground',
                indicator === 'dot' && 'items-center',
              )}
            >
              {formatter && item?.value !== undefined && item.name ? (
                formatter(item.value, item.name, item, index, item.payload)
              ) : (
                <>
                  {itemConfig?.icon ? (
                    <itemConfig.icon />
                  ) : (
                    !hideIndicator && (
                      <div
                        className={cn('shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]', {
                          'size-2.5': indicator === 'dot',
                          'w-1': indicator === 'line',
                          'w-0 border-[1.5px] border-dashed bg-transparent': indicator === 'dashed',
                          'my-0.5': nestLabel && indicator === 'dashed',
                        })}
                        style={
                          {
                            '--color-bg': indicatorColor,
                            '--color-border': indicatorColor,
                          } as React.CSSProperties
                        }
                      />
                    )
                  )}
                  <div
                    className={cn('flex flex-1 justify-between leading-none', nestLabel ? 'items-end' : 'items-center')}
                  >
                    <div className="grid gap-1.5">
                      {nestLabel ? (
                        <ChartTooltipTitle
                          config={config}
                          resolvedPayload={resolvedPayload}
                          hideLabel={hideLabel}
                          label={label}
                          labelFormatter={labelFormatter}
                          labelClassName={labelClassName}
                          labelKey={labelKey}
                        />
                      ) : null}
                      <span className="text-muted-foreground">{itemConfig?.label || item.name}</span>
                    </div>
                    {item.value && (
                      <span className="font-mono font-medium tabular-nums text-foreground">
                        {item.value.toLocaleString()}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>,
          )

          return items
        }, [])}
      </div>
    </div>
  )
}

ChartTooltipContent.displayName = 'ChartTooltip'
ChartTooltipContentActive.displayName = 'ChartTooltipContentActive'

export { ChartContainer, ChartTooltip, ChartTooltipContent }
