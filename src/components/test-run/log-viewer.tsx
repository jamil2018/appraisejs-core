'use client'

import { useEffect, useRef, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LoaderCircle, Wifi, WifiOff, CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LogMessage {
  type: 'stdout' | 'stderr' | 'status'
  message: string
  timestamp: Date
}

interface LogViewerProps {
  testRunId: string
  className?: string
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'completed'

export function LogViewer({ testRunId, className }: LogViewerProps) {
  const [logs, setLogs] = useState<LogMessage[]>([])
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')
  const [error, setError] = useState<string | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const autoScrollRef = useRef(true)

  useEffect(() => {
    // Create EventSource connection to SSE endpoint
    const eventSource = new EventSource(`/api/test-runs/${testRunId}/logs`)
    eventSourceRef.current = eventSource

    // Handle connection open
    eventSource.onopen = () => {
      setConnectionStatus('connected')
      setError(null)
    }

    // Handle connection error
    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) {
        setConnectionStatus('disconnected')
      } else {
        setConnectionStatus('error')
        setError('Failed to connect to log stream')
      }
    }

    // Handle 'connected' event
    eventSource.addEventListener('connected', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        setLogs(prev => [
          ...prev,
          {
            type: 'status',
            message: data.message || 'Connected to log stream',
            timestamp: new Date(),
          },
        ])
      } catch (error) {
        console.error('Error parsing connected event:', error)
      }
    })

    // Handle 'log' event (stdout/stderr)
    eventSource.addEventListener('log', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        setLogs(prev => [
          ...prev,
          {
            type: data.type || 'stdout',
            message: data.message || '',
            timestamp: new Date(),
          },
        ])
      } catch (error) {
        console.error('Error parsing log event:', error)
      }
    })

    // Handle 'exit' event
    eventSource.addEventListener('exit', (event: MessageEvent) => {
      try {
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
      } catch (error) {
        console.error('Error parsing exit event:', error)
      }
    })

    // Handle 'error' event
    eventSource.addEventListener('error', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        setLogs(prev => [
          ...prev,
          {
            type: 'stderr',
            message: `Error: ${data.message || 'Unknown error'}`,
            timestamp: new Date(),
          },
        ])
      } catch (error) {
        console.error('Error parsing error event:', error)
      }
    })

    // Cleanup on unmount
    return () => {
      eventSource.close()
      eventSourceRef.current = null
    }
  }, [testRunId])

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
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Connection Status */}
      <div className="flex items-center justify-between">
        <Badge variant="outline" className="flex items-center gap-2">
          {getStatusIcon()}
          <span>{getStatusText()}</span>
        </Badge>
        {logs.length > 0 && (
          <Badge variant="outline" className="font-mono text-xs">
            {logs.length} log{logs.length !== 1 ? 's' : ''}
          </Badge>
        )}
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
        className="h-[600px] w-full rounded-md border bg-muted/50 p-4 font-mono text-sm"
        onScroll={handleScroll}
      >
        {logs.length === 0 && connectionStatus === 'connecting' && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            Connecting to log stream...
          </div>
        )}
        {logs.length === 0 && connectionStatus !== 'connecting' && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            No logs available
          </div>
        )}
        {logs.map((log, index) => (
          <div
            key={index}
            className={cn(
              'mb-1 flex items-start gap-2 whitespace-pre-wrap break-words',
              log.type === 'stderr' && 'text-red-400',
              log.type === 'stdout' && 'text-foreground',
              log.type === 'status' && 'text-blue-400 font-semibold',
            )}
          >
            <span className="shrink-0 text-muted-foreground text-xs">
              {log.timestamp.toLocaleTimeString()}
            </span>
            <span className="shrink-0 text-muted-foreground text-xs w-16">
              [{log.type.toUpperCase()}]
            </span>
            <span className="flex-1">{log.message}</span>
          </div>
        ))}
      </ScrollArea>
    </div>
  )
}

