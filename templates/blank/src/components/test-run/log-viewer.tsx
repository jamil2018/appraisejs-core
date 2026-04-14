'use client'

import { useEffect, useRef } from 'react'
import { TestRunStatus } from '@prisma/client'
import { CheckCircle, LoaderCircle, Logs, Wifi, WifiOff, XCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DownloadLogsButton } from './download-logs-button'
import { getConnectionStatusText } from './log-viewer-helpers'
import { useLogViewer } from './use-log-viewer'

type LogViewerProps = {
  testRunId: string
  status?: TestRunStatus
  className?: string
}

export function LogViewer({ testRunId, status, className }: LogViewerProps) {
  const { logs, connectionStatus, error } = useLogViewer({ testRunId, status })
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

  useEffect(() => {
    if (!autoScrollRef.current || !scrollAreaRef.current) {
      return
    }

    const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight
    }
  }, [logs])

  const handleScroll = () => {
    if (!scrollAreaRef.current) {
      return
    }

    const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
    if (!scrollContainer) {
      return
    }

    const { scrollTop, scrollHeight, clientHeight } = scrollContainer
    autoScrollRef.current = scrollTop + clientHeight >= scrollHeight - 10
  }

  const statusIcon =
    connectionStatus === 'connecting' || connectionStatus === 'loading' ? (
      <LoaderCircle className="h-4 w-4 animate-spin" />
    ) : connectionStatus === 'connected' ? (
      <Wifi className="h-4 w-4 text-green-500" />
    ) : connectionStatus === 'disconnected' ? (
      <WifiOff className="h-4 w-4 text-gray-500" />
    ) : connectionStatus === 'error' ? (
      <XCircle className="h-4 w-4 text-red-500" />
    ) : (
      <CheckCircle className="h-4 w-4 text-blue-500" />
    )

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
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="flex items-center gap-2">
              {statusIcon}
              <span>{getConnectionStatusText(connectionStatus)}</span>
            </Badge>
            {logs.length > 0 ? (
              <Badge variant="outline" className="font-mono text-xs">
                {logs.length} log{logs.length !== 1 ? 's' : ''}
              </Badge>
            ) : null}
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <ScrollArea
            ref={scrollAreaRef}
            className="bg-muted/50 h-[600px] w-full rounded-md border p-4 font-mono text-sm"
            onScroll={handleScroll}
          >
            {logs.length === 0 && (connectionStatus === 'connecting' || connectionStatus === 'loading') ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                {connectionStatus === 'loading' ? 'Loading logs...' : 'Connecting to log stream...'}
              </div>
            ) : null}
            {logs.length === 0 && connectionStatus !== 'connecting' && connectionStatus !== 'loading' ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">No logs available</div>
            ) : null}
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
