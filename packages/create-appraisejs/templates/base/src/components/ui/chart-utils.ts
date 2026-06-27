import type { ChartConfig } from './chart'

export function getPayloadConfigFromPayload(config: ChartConfig, payload: unknown, key: string) {
  if (typeof payload !== 'object' || payload === null) {
    return undefined
  }

  const payloadPayload =
    'payload' in payload && typeof payload.payload === 'object' && payload.payload !== null
      ? payload.payload
      : undefined

  let configLabelKey: string = key

  if (key in payload && typeof payload[key as keyof typeof payload] === 'string') {
    configLabelKey = payload[key as keyof typeof payload] as string
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key as keyof typeof payloadPayload] === 'string'
  ) {
    configLabelKey = payloadPayload[key as keyof typeof payloadPayload] as string
  }

  return configLabelKey in config ? config[configLabelKey] : config[key as keyof typeof config]
}

export function resolveChartTooltipLabelValue(
  config: ChartConfig,
  item: NonNullable<unknown>,
  label: unknown,
  labelKey?: string,
) {
  const payloadItem = item as { dataKey?: string | number; name?: string }
  const key = `${labelKey || payloadItem.dataKey || payloadItem.name || 'value'}`
  const itemConfig = getPayloadConfigFromPayload(config, item, key)

  if (!labelKey && typeof label === 'string') {
    return config[label as keyof typeof config]?.label || label
  }

  return itemConfig?.label
}
