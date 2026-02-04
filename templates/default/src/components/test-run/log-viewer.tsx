'use client'

import { useEffect, useRef, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LoaderCircle, Wifi, WifiOff, CheckCircle, XCircle, Logs } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getTestRunLogsAction, updateTestRunTestCaseStatusAction } from '@/actions/test-run/test-run-actions'
import { TestRunStatus } from '@prisma/client'
import { DownloadLogsButton } from './download-logs-button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

interface LogMessage {
  type: 'stdout' | 'stderr' | 'status'
  message: string
  timestamp: Date
}

interface LogViewerProps {
  testRunId: string
  status?: TestRunStatus
  className?: string
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'completed' | 'loading'

export function LogViewer({ testRunId, status, className }: LogViewerProps) {
  const [logs, setLogs] = useState<LogMessage[]>([])
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')
  const [error, setError] = useState<string | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const autoScrollRef = useRef(true)
  const wasConnectedRef = useRef(false) // Track if we ever successfully connected
  const shouldStopReconnectingRef = useRef(false) // Track if we should stop auto-reconnecting

  // Load logs from database if test run is completed
  useEffect(() => {
    if (status === TestRunStatus.COMPLETED || status === TestRunStatus.CANCELLED) {
      setConnectionStatus('loading')
      getTestRunLogsAction(testRunId)
        .then(response => {
          if (response.error) {
            setError(response.error)
            setConnectionStatus('error')
          } else {
            const loadedLogs = (response.data as LogMessage[]) || []
            // Convert timestamp strings to Date objects if needed
            const parsedLogs = loadedLogs.map(log => ({
              ...log,
              timestamp: log.timestamp instanceof Date ? log.timestamp : new Date(log.timestamp),
            }))
            setLogs(parsedLogs)
            setConnectionStatus('completed')
          }
        })
        .catch(err => {
          console.error('[LogViewer] Error loading logs from database:', err)
          setError('Failed to load logs from database')
          setConnectionStatus('error')
        })
      return
    }
  }, [testRunId, status])

  // Use SSE for running/queued test runs
  useEffect(() => {
    // Skip SSE if test run is completed
    if (status === TestRunStatus.COMPLETED || status === TestRunStatus.CANCELLED) {
      return
    }

    console.log(`[LogViewer] Connecting to SSE endpoint for testRunId: ${testRunId}`)
    // Create EventSource connection to SSE endpoint
    const eventSource = new EventSource(`/api/test-runs/${testRunId}/logs`)
    eventSourceRef.current = eventSource

    // Handle connection open
    eventSource.onopen = () => {
      console.log(`[LogViewer] SSE connection opened for testRunId: ${testRunId}`)
      wasConnectedRef.current = true
      setConnectionStatus('connected')
      setError(null)
    }

    // Handle connection error
    eventSource.onerror = err => {
      const readyState = eventSource.readyState

      if (readyState === EventSource.CONNECTING) {
        // Still connecting, don't log error or set error state yet
        // This is normal during initial connection attempts
        // Allow EventSource to continue trying to connect
        return
      }

      if (readyState === EventSource.CLOSED) {
        console.log(`[LogViewer] SSE connection closed for testRunId: ${testRunId}`)
        
        // If we never connected, it's likely a fatal error (404, 500, etc.)
        // Close EventSource to prevent auto-reconnection
        if (!wasConnectedRef.current) {
          console.log(`[LogViewer] Fatal error: never connected, closing EventSource to prevent reconnection`)
          shouldStopReconnectingRef.current = true
          eventSource.close()
          setConnectionStatus('error')
          setError(
            'Failed to connect to log stream. The test run may not be running or the process has ended. Please check the server logs for more details.',
          )
        } else {
          // We were connected before, so this is a normal disconnection
          setConnectionStatus('disconnected')
          // Don't close EventSource here - let it try to reconnect if needed
          // But if we've been told to stop reconnecting, close it
          if (shouldStopReconnectingRef.current) {
            eventSource.close()
          }
        }
      } else {
        // readyState === EventSource.OPEN (unlikely to be an error) or unknown state
        console.error(`[LogViewer] SSE error for testRunId: ${testRunId}`, err, 'readyState:', readyState)
        setConnectionStatus('error')
        setError(`Failed to connect to log stream (readyState: ${readyState}). Check server logs for details.`)
        // For OPEN state errors, close to prevent reconnection attempts
        shouldStopReconnectingRef.current = true
        eventSource.close()
      }
    }

    // Handle 'connected' event
    eventSource.addEventListener('connected', (event: MessageEvent) => {
      try {
        if (!event.data) {
          console.warn('[LogViewer] Received connected event with no data')
          return
        }
        const data = JSON.parse(event.data)
        console.log(`[LogViewer] Received connected event:`, data)
        setLogs(prev => [
          ...prev,
          {
            type: 'status',
            message: data.message || 'Connected to log stream',
            timestamp: new Date(),
          },
        ])
      } catch (error) {
        console.error('[LogViewer] Error parsing connected event:', error, 'event.data:', event.data)
      }
    })

    // Handle 'log' event (stdout/stderr)
    eventSource.addEventListener('log', (event: MessageEvent) => {
      try {
        if (!event.data) {
          console.warn('[LogViewer] Received log event with no data')
          return
        }
        const data = JSON.parse(event.data)
        // Only log first few events to avoid spam
        if (logs.length < 5) {
          console.log(`[LogViewer] Received log event:`, data)
        }
        setLogs(prev => [
          ...prev,
          {
            type: data.type || 'stdout',
            message: data.message || '',
            timestamp: new Date(),
          },
        ])
      } catch (error) {
        console.error('[LogViewer] Error parsing log event:', error, 'event.data:', event.data)
      }
    })

    // Handle 'exit' event
    eventSource.addEventListener('exit', (event: MessageEvent) => {
      try {
        if (!event.data) {
          console.warn('[LogViewer] Received exit event with no data')
          setConnectionStatus('completed')
          eventSource.close()
          // Dispatch custom event for TestRunHeader to listen to
          window.dispatchEvent(
            new CustomEvent('testrun:exit', {
              detail: { testRunId },
            }),
          )
          return
        }
        const data = JSON.parse(event.data)
        const exitCode = data.code
        setLogs(prev => [
          ...prev,
          {
            type: 'status',
            message: `Process exited with code ${exitCode}`,
            timestamp: new Date(),
          },
        ])
        setConnectionStatus('completed')
        eventSource.close()
        // Dispatch custom event for TestRunHeader to listen to
        window.dispatchEvent(
          new CustomEvent('testrun:exit', {
            detail: { testRunId },
          }),
        )
      } catch (error) {
        console.error('[LogViewer] Error parsing exit event:', error, 'event.data:', event.data)
        setConnectionStatus('completed')
        eventSource.close()
        // Dispatch custom event even on error so TestRunHeader can refresh
        window.dispatchEvent(
          new CustomEvent('testrun:exit', {
            detail: { testRunId },
          }),
        )
      }
    })

    // Handle 'error' event (from SSE stream, not the onerror handler)
    eventSource.addEventListener('error', (event: MessageEvent) => {
      try {
        if (!event.data) {
          console.warn('[LogViewer] Received error event with no data')
          return
        }
        const data = JSON.parse(event.data)
        const errorMessage = data.error || data.message || 'Unknown error'
        
        setLogs(prev => [
          ...prev,
          {
            type: 'stderr',
            message: `Error: ${errorMessage}`,
            timestamp: new Date(),
          },
        ])
        setConnectionStatus('error')
        
        // Check if this is a fatal error that should stop reconnection
        // Fatal errors include: "Test run not found", "Test run has completed", "Internal server error"
        const fatalErrorPatterns = [
          'Test run not found',
          'Test run has completed',
          'Internal server error',
          'Test run process not found',
        ]
        
        const isFatalError = fatalErrorPatterns.some(pattern => 
          errorMessage.toLowerCase().includes(pattern.toLowerCase())
        )
        
        if (isFatalError) {
          console.log(`[LogViewer] Fatal error received, closing EventSource to prevent reconnection: ${errorMessage}`)
          shouldStopReconnectingRef.current = true
          eventSource.close()
        }
      } catch (error) {
        console.error('[LogViewer] Error parsing error event:', error, 'event.data:', event.data)
      }
    })

    // Handle 'scenario::end' event - update test case status
    eventSource.addEventListener('scenario::end', async (event: MessageEvent) => {
      try {
        if (!event.data) {
          console.warn('[LogViewer] Received scenario::end event with no data')
          return
        }
        const data = JSON.parse(event.data)
        const { scenarioName, status, tracePath } = data

        console.log(
          `[LogViewer] Scenario ended: ${scenarioName} with status: ${status}${tracePath ? `, tracePath: ${tracePath}` : ''}`,
        )

        // Update test case status in database
        // This will gracefully handle test runs filtered by tags (no test cases)
        const response = await updateTestRunTestCaseStatusAction(testRunId, scenarioName, status, tracePath)
        if (response.error && response.status !== 200) {
          // Only log as error if it's not a 200 status (which means it was skipped gracefully)
          console.error('[LogViewer] Error updating test case status:', response.error)
        } else if (response.status === 200) {
          // Log success or graceful skip (200 status means it was handled correctly)
          console.log(
            `[LogViewer] ${response.message || `Successfully updated test case status for scenario: ${scenarioName}`}`,
          )
        }

        // Also add to logs for visibility
        setLogs(prev => [
          ...prev,
          {
            type: 'status',
            message: `Scenario completed: ${scenarioName} - ${status}${tracePath ? ` (trace available)` : ''}`,
            timestamp: new Date(),
          },
        ])
      } catch (error) {
        console.error('[LogViewer] Error handling scenario::end event:', error, 'event.data:', event.data)
      }
    })

    // Cleanup on unmount
    return () => {
      wasConnectedRef.current = false
      shouldStopReconnectingRef.current = false
      eventSource.close()
      eventSourceRef.current = null
    }
  }, [testRunId, status])

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScrollRef.current && scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [logs])

  // Handle manual scroll to detect user scrolling up
  const handleScroll = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollContainer) {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainer
        // If user scrolled up, disable auto-scroll
        autoScrollRef.current = scrollTop + clientHeight >= scrollHeight - 10
      }
    }
  }

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'connecting':
        return <LoaderCircle className="h-4 w-4 animate-spin" />
      case 'connected':
        return <Wifi className="h-4 w-4 text-green-500" />
      case 'disconnected':
        return <WifiOff className="h-4 w-4 text-gray-500" />
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-blue-500" />
      default:
        return null
    }
  }

  const getStatusText = () => {
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
      default:
        return 'Unknown'
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Logs className="h-6 w-6" />
            Live Logs
          </span>
          {connectionStatus === 'completed' || connectionStatus === 'disconnected' ? (
            <DownloadLogsButton testRunId={testRunId} />
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className={cn('flex flex-col gap-2', className)}>
          {/* Connection Status */}
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="flex items-center gap-2">
              {getStatusIcon()}
              <span>{getStatusText()}</span>
            </Badge>
            <div className="flex items-center gap-2">
              {logs.length > 0 && (
                <Badge variant="outline" className="font-mono text-xs">
                  {logs.length} log{logs.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Log Display */}
          <ScrollArea
            ref={scrollAreaRef}
            className="bg-muted/50 h-[600px] w-full rounded-md border p-4 font-mono text-sm"
            onScroll={handleScroll}
          >
            {logs.length === 0 && (connectionStatus === 'connecting' || connectionStatus === 'loading') && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                {connectionStatus === 'loading' ? 'Loading logs...' : 'Connecting to log stream...'}
              </div>
            )}
            {logs.length === 0 && connectionStatus !== 'connecting' && connectionStatus !== 'loading' && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">No logs available</div>
            )}
            {logs.map((log, index) => (
              <div
                key={index}
                className={cn(
                  'mb-1 flex items-start gap-2 whitespace-pre-wrap break-words',
                  log.type === 'stderr' && 'text-red-400',
                  log.type === 'stdout' && 'text-foreground',
                  log.type === 'status' && 'font-semibold text-blue-400',
                )}
              >
                <span className="shrink-0 text-xs text-muted-foreground">{log.timestamp.toLocaleTimeString()}</span>
                <span className="w-16 shrink-0 text-xs text-muted-foreground">[{log.type.toUpperCase()}]</span>
                <span className="flex-1">{log.message}</span>
              </div>
            ))}
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  )
}
