import { TestRunStatus } from '@prisma/client'

import type { ConnectionStatus } from './log-viewer-types'

const fatalErrorPatterns = [
  'Test run not found',
  'Test run has completed',
  'Internal server error',
  'Test run process not found',
] as const

export function isTerminalRunStatus(status?: TestRunStatus) {
  return status === TestRunStatus.COMPLETED || status === TestRunStatus.CANCELLED
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
