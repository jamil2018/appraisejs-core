import { TestRunStatus } from '@prisma/client'

export interface LogMessage {
  type: 'stdout' | 'stderr' | 'status'
  message: string
  timestamp: Date
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'completed' | 'loading'

const fatalErrorPatterns = [
  'Test run not found',
  'Test run has completed',
  'Internal server error',
  'Test run process not found',
] as const

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

export function isTerminalRunStatus(status?: TestRunStatus) {
  return status === TestRunStatus.COMPLETED || status === TestRunStatus.CANCELLED
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

export function createLogMessage(
  type: LogMessage['type'],
  message: string,
  timestamp = new Date(),
): LogMessage {
  return { type, message, timestamp }
}

export function isFatalLogStreamError(message: string) {
  return fatalErrorPatterns.some(pattern => message.toLowerCase().includes(pattern.toLowerCase()))
}

export function getConnectionStatusText(connectionStatus: ConnectionStatus) {
  switch (connectionStatus) {
    case 'connecting':
      return 'Connecting...'
    case 'connected':
      return 'Connected'
    case 'disconnected':
      return 'Disconnected'
    case 'error':
      return 'Error'
    case 'completed':
      return 'Completed'
    case 'loading':
      return 'Loading...'
  }
}

export function dispatchTestRunExit(testRunId: string) {
  window.dispatchEvent(
    new CustomEvent('testrun:exit', {
      detail: { testRunId },
    }),
  )
}
