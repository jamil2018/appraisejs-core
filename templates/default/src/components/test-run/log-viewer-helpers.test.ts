import { describe, expect, it } from 'vitest'
import { TestRunStatus } from '@prisma/client'

import {
  getConnectionStatusText,
  isFatalLogStreamError,
  isTerminalRunStatus,
  parseLogMessages,
} from './log-viewer-helpers'

describe('log-viewer helpers', () => {
  it('parses serialized log timestamps into Date instances', () => {
    const logs = parseLogMessages([
      {
        type: 'stdout',
        message: 'Started',
        timestamp: '2024-01-01T00:00:00.000Z',
      },
    ])

    expect(logs).toHaveLength(1)
    expect(logs[0]?.timestamp).toBeInstanceOf(Date)
  })

  it('identifies terminal statuses and fatal stream errors', () => {
    expect(isTerminalRunStatus(TestRunStatus.COMPLETED)).toBe(true)
    expect(isTerminalRunStatus(TestRunStatus.CANCELLED)).toBe(true)
    expect(isTerminalRunStatus(TestRunStatus.RUNNING)).toBe(false)
    expect(isFatalLogStreamError('Test run not found')).toBe(true)
    expect(isFatalLogStreamError('temporary disconnect')).toBe(false)
  })

  it('formats connection status text', () => {
    expect(getConnectionStatusText('loading')).toBe('Loading...')
    expect(getConnectionStatusText('connected')).toBe('Connected')
  })
})
