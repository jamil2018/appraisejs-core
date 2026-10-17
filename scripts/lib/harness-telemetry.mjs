import fs from 'node:fs'

export const METRIC_FIELDS = [
  'durationMs',
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'toolOutputBytes',
  'toolOutputCount',
  'agentCount',
  'retryCount',
  'rerouteCount',
  'modelUse',
]

export function validCount(value) {
  return Number.isSafeInteger(value) && value >= 0
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value, expected) {
  return (
    Object.keys(value ?? {})
      .sort()
      .join(',') === expected
  )
}

function validModelName(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,99}$/.test(value)
}

function validModelItem(item) {
  return [
    isRecord(item),
    exactKeys(item, 'calls,model'),
    validModelName(item?.model),
    validCount(item?.calls),
    item?.calls > 0,
  ].every(Boolean)
}

export function validateModelUse(value, label = 'modelUse') {
  if (!Array.isArray(value)) throw new Error(`${label}: expected array`)
  const seen = new Set()
  for (const item of value) {
    validateOneModelUse(item, seen, label)
  }
}

function validateOneModelUse(item, seen, label) {
  if (!validModelItem(item)) throw new Error(`${label}: invalid model count`)
  if (seen.has(item.model)) throw new Error(`${label}: invalid model count`)
  seen.add(item.model)
}

function assertTelemetryFile(filePath) {
  const stat = fs.statSync(filePath)
  if (!stat.isFile() || stat.size > 65536) throw new Error('Host telemetry must be a file of at most 64 KiB')
}

function validTelemetryHeader(envelope, routingDecisionId) {
  const value = Object(envelope)
  return [
    isRecord(envelope),
    exactKeys(envelope, 'capturedAt,metrics,routingDecisionId,schemaVersion,sourceId'),
    value.schemaVersion === 1,
    value.routingDecisionId === routingDecisionId,
    typeof value.sourceId === 'string',
    /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(value.sourceId),
    typeof value.capturedAt === 'string',
    Number.isFinite(Date.parse(value.capturedAt)),
    isRecord(value.metrics),
  ].every(Boolean)
}

function validateTelemetryMetric(name, value) {
  if (!METRIC_FIELDS.includes(name)) throw new Error(`Unsupported host telemetry metric: ${name}`)
  if (name === 'modelUse') return validateModelUse(value, 'host telemetry modelUse')
  if (!validCount(value)) throw new Error(`Invalid host telemetry metric: ${name}`)
}

// This small, strict envelope contains aggregate usage only. Raw host JSONL and transcripts are rejected.
export function readHostTelemetry(filePath, routingDecisionId) {
  if (!routingDecisionId) throw new Error('Host telemetry requires --routing-decision-id')
  assertTelemetryFile(filePath)
  const envelope = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (!validTelemetryHeader(envelope, routingDecisionId)) throw new Error('Invalid normalized host telemetry envelope')
  for (const [name, value] of Object.entries(envelope.metrics)) {
    validateTelemetryMetric(name, value)
  }
  return envelope
}

function oneMeasurement(name, cliMetrics, hostTelemetry) {
  const cli = cliMetrics[name]
  const host = importedValue(hostTelemetry, name)
  assertDistinctSources(cli, host, name)
  if (cli !== undefined) return { value: cli, provenance: { source: 'cli-reported', reference: `argument:${name}` } }
  if (host !== undefined) {
    return {
      value: host,
      provenance: {
        source: 'normalized-host-telemetry',
        reference: hostTelemetry.sourceId,
        capturedAt: hostTelemetry.capturedAt,
        scope: 'routing-decision',
      },
    }
  }
  return { value: null, provenance: null }
}

function assertDistinctSources(cli, host, name) {
  if (cli !== undefined && host !== undefined) throw new Error(`Duplicate metric source: ${name}`)
}

function importedValue(hostTelemetry, name) {
  return hostTelemetry?.metrics[name]
}

export function composeMeasurements(cliMetrics, hostTelemetry) {
  const metrics = {}
  const measurementProvenance = {}
  for (const name of METRIC_FIELDS) {
    const selected = oneMeasurement(name, cliMetrics, hostTelemetry)
    metrics[name] = selected.value
    measurementProvenance[name] = selected.provenance
  }
  return { metrics, measurementProvenance }
}
