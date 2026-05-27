import type { LogMessage } from './log-viewer-types'

function isLogMessage(value: unknown): value is LogMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    (value.type === 'stdout' || value.type === 'stderr' || value.type === 'status') &&
    'message' in value &&
    typeof value.message === 'string' &&
    'timestamp' in value
  )
}

export function parseLogMessages(data: unknown): LogMessage[] {
  if (!Array.isArray(data)) {
    return []
  }

  return data.filter(isLogMessage).map(log => ({
    ...log,
    timestamp: log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp),
  }))
}

export function createLogMessage(type: LogMessage['type'], message: string, timestamp = new Date()): LogMessage {
  return { type, message, timestamp }
}
