'use client'

import { useEffect, useRef, useState } from 'react'
import { TestRunStatus } from '@prisma/client'

import { getTestRunLogsAction } from '@/actions/test-run/test-run-actions'

import {
  createLogMessage,
  dispatchTestRunExit,
  isFatalLogStreamError,
  isTerminalRunStatus,
  parseLogMessages,
  type ConnectionStatus,
  type LogMessage,
} from './log-viewer-helpers'

type UseLogViewerParams = {
  testRunId: string
  status?: TestRunStatus
}

export function useLogViewer({ testRunId, status }: UseLogViewerParams) {
  const [logs, setLogs] = useState<LogMessage[]>([])
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')
  const [error, setError] = useState<string | null>(null)

  const logCountRef = useRef(0)
  const wasConnectedRef = useRef(false)
  const shouldStopReconnectingRef = useRef(false)

  useEffect(() => {
    logCountRef.current = logs.length
  }, [logs.length])

  useEffect(() => {
    if (!isTerminalRunStatus(status)) {
      return
    }

    queueMicrotask(() => setConnectionStatus('loading'))

    getTestRunLogsAction(testRunId)
      .then(response => {
        if (response.error) {
          setError(response.error)
          setConnectionStatus('error')
          return
        }

        setLogs(parseLogMessages(response.data))
        setConnectionStatus('completed')
      })
      .catch(error => {
        console.error('[LogViewer] Error loading logs from database:', error)
        setError('Failed to load logs from database')
        setConnectionStatus('error')
      })
  }, [status, testRunId])

  useEffect(() => {
    if (isTerminalRunStatus(status)) {
      return
    }

    const eventSource = new EventSource(`/api/test-runs/${testRunId}/logs`)

    eventSource.onopen = () => {
      wasConnectedRef.current = true
      setConnectionStatus('connected')
      setError(null)
    }

    eventSource.onerror = error => {
      const readyState = eventSource.readyState

      if (readyState === EventSource.CONNECTING) {
        return
      }

      if (readyState === EventSource.CLOSED) {
        if (!wasConnectedRef.current) {
          shouldStopReconnectingRef.current = true
          eventSource.close()
          setConnectionStatus('error')
          setError(
            'Failed to connect to log stream. The test run may not be running or the process has ended. Please check the server logs for more details.',
          )
          return
        }

        setConnectionStatus('disconnected')

        if (shouldStopReconnectingRef.current) {
          eventSource.close()
        }
        return
      }

      console.error(`[LogViewer] SSE error for testRunId: ${testRunId}`, error, 'readyState:', readyState)
      setConnectionStatus('error')
      setError(`Failed to connect to log stream (readyState: ${readyState}). Check server logs for details.`)
      shouldStopReconnectingRef.current = true
      eventSource.close()
    }

    eventSource.addEventListener('connected', (event: MessageEvent) => {
      try {
        if (!event.data) {
          return
        }

        const data = JSON.parse(event.data)
        setLogs(currentLogs => [...currentLogs, createLogMessage('status', data.message || 'Connected to log stream')])
      } catch (error) {
        console.error('[LogViewer] Error parsing connected event:', error, 'event.data:', event.data)
      }
    })

    eventSource.addEventListener('log', (event: MessageEvent) => {
      try {
        if (!event.data) {
          return
        }

        const data = JSON.parse(event.data)
        if (logCountRef.current < 5) {
          console.log('[LogViewer] Received log event:', data)
        }

        setLogs(currentLogs => [...currentLogs, createLogMessage(data.type || 'stdout', data.message || '')])
      } catch (error) {
        console.error('[LogViewer] Error parsing log event:', error, 'event.data:', event.data)
      }
    })

    eventSource.addEventListener('exit', (event: MessageEvent) => {
      try {
        if (!event.data) {
          setConnectionStatus('completed')
          eventSource.close()
          dispatchTestRunExit(testRunId)
          return
        }

        const data = JSON.parse(event.data)
        setLogs(currentLogs => [...currentLogs, createLogMessage('status', `Process exited with code ${data.code}`)])
      } catch (error) {
        console.error('[LogViewer] Error parsing exit event:', error, 'event.data:', event.data)
      } finally {
        setConnectionStatus('completed')
        eventSource.close()
        dispatchTestRunExit(testRunId)
      }
    })

    eventSource.addEventListener('error', (event: MessageEvent) => {
      try {
        if (!event.data) {
          return
        }

        const data = JSON.parse(event.data)
        const errorMessage = data.error || data.message || 'Unknown error'

        setLogs(currentLogs => [...currentLogs, createLogMessage('stderr', `Error: ${errorMessage}`)])
        setConnectionStatus('error')

        if (isFatalLogStreamError(errorMessage)) {
          shouldStopReconnectingRef.current = true
          eventSource.close()
        }
      } catch (error) {
        console.error('[LogViewer] Error parsing error event:', error, 'event.data:', event.data)
      }
    })

    eventSource.addEventListener('scenario::end', (event: MessageEvent) => {
      try {
        if (!event.data) {
          return
        }

        const data = JSON.parse(event.data)
        const suffix = data.tracePath ? ' (trace available)' : ''
        setLogs(currentLogs => [
          ...currentLogs,
          createLogMessage('status', `Scenario completed: ${data.scenarioName} - ${data.status}${suffix}`),
        ])
      } catch (error) {
        console.error('[LogViewer] Error handling scenario::end event:', error, 'event.data:', event.data)
      }
    })

    return () => {
      wasConnectedRef.current = false
      shouldStopReconnectingRef.current = false
      eventSource.close()
    }
  }, [status, testRunId])

  return {
    logs,
    connectionStatus,
    error,
  }
}
