'use client'

import { useEffect, useRef } from 'react'
import { TestRunStatus } from '@prisma/client'
import { CheckCircle, LoaderCircle, Logs, Wifi, WifiOff, XCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DownloadLogsButton } from './download-logs-button'
import { getConnectionStatusText } from './log-viewer-helpers'
import { useLogViewer } from './use-log-viewer'

type LogViewerProps = {
  testRunId: string
  targetProjectId?: string
  status?: TestRunStatus
  className?: string
}

export function LogViewer({ testRunId, targetProjectId, status, className }: LogViewerProps) {
  const { logs, connectionStatus, error } = useLogViewer({ testRunId, targetProjectId, status })
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

  useEffect(() => {
    if (!autoScrollRef.current || !scrollAreaRef.current) {
      return
    }

    const scrollContainer = scrollAreaRef.current.querySelector('[data-slot="scroll-area-viewport"]')
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight
    }
  }, [logs])

  const handleScroll = () => {
    if (!scrollAreaRef.current) {
      return
    }

    const scrollContainer = scrollAreaRef.current.querySelector('[data-slot="scroll-area-viewport"]')
    if (!scrollContainer) {
      return
    }

    const { scrollTop, scrollHeight, clientHeight } = scrollContainer
    autoScrollRef.current = scrollTop + clientHeight >= scrollHeight - 10
  }

  const statusIcon =
    connectionStatus === 'connecting' || connectionStatus === 'loading' ? (
      <LoaderCircle className="size-4 animate-spin" />
    ) : connectionStatus === 'connected' ? (
      <Wifi className="size-4" />
    ) : connectionStatus === 'disconnected' ? (
      <WifiOff className="size-4" />
    ) : connectionStatus === 'error' ? (
      <XCircle className="size-4" />
    ) : (
      <CheckCircle className="size-4" />
    )

  return (
    <Card className="min-w-0">
      <CardHeader className="p-4">
        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <Logs className="size-6" />
            Live Logs
          </span>
          {connectionStatus === 'completed' || connectionStatus === 'disconnected' ? (
            <DownloadLogsButton testRunId={testRunId} />
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className={cn('flex min-w-0 flex-col gap-3', className)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StatusBadge
              label={getConnectionStatusText(connectionStatus)}
              icon={statusIcon}
              tone={
                connectionStatus === 'error'
                  ? 'danger'
                  : connectionStatus === 'connected'
                    ? 'success'
                    : connectionStatus === 'connecting' || connectionStatus === 'loading'
                      ? 'info'
                      : 'neutral'
              }
            />
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
            className="h-[clamp(16rem,60vh,37.5rem)] w-full min-w-0 rounded-md border bg-muted/50 p-4 font-mono text-sm"
            onScroll={handleScroll}
          >
            {logs.length === 0 && (connectionStatus === 'connecting' || connectionStatus === 'loading') ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <LoaderCircle className="mr-2 size-4 animate-spin" />
                {connectionStatus === 'loading' ? 'Loading logs...' : 'Connecting to log stream...'}
              </div>
            ) : null}
            {logs.length === 0 && connectionStatus !== 'connecting' && connectionStatus !== 'loading' ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">No logs available</div>
            ) : null}
            {logs.map((log, index) => (
              <div
                key={`${log.timestamp.toISOString()}-${log.type}-${log.message}-${index}`}
                className={cn(
                  'mb-1 grid min-w-0 grid-cols-[auto_1fr] items-start gap-x-2 gap-y-1 whitespace-pre-wrap break-words sm:flex sm:gap-2',
                  log.type === 'stderr' && 'text-danger',
                  log.type === 'stdout' && 'text-foreground',
                  log.type === 'status' && 'font-semibold text-info',
                )}
              >
                <span className="shrink-0 text-xs text-muted-foreground">{log.timestamp.toLocaleTimeString()}</span>
                <span className="w-16 shrink-0 text-xs text-muted-foreground">[{log.type.toUpperCase()}]</span>
                <span className="col-span-2 min-w-0 flex-1 [overflow-wrap:anywhere]">{log.message}</span>
              </div>
            ))}
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  )
}
