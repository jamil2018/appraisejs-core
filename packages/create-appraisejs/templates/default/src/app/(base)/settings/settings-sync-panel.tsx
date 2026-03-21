'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  CircleHelp,
  Code,
  Component,
  Group,
  LayoutTemplate,
  Puzzle,
  RefreshCw,
  Server,
  Tag,
  TestTubeDiagonal,
  TestTubes,
} from 'lucide-react'
import { getSyncPendingCountsAction, runSyncAction } from '@/actions/settings/sync-actions'
import { AppDrawerItemColor } from '@/app/(dashboard-components)/app-drawer'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from '@/hooks/use-toast'
import {
  SYNC_ALL_REQUEST_ID,
  getSyncScriptDefinition,
  resolveRequestedSyncExecutionOrder,
  syncScriptDefinitions,
  type SyncRequestId,
  type SyncScriptId,
  type SyncScriptDefinition,
} from '@/lib/sync/sync-registry'
import type { SyncPendingCounts } from '@/lib/sync/sync-pending-counts'

type SyncRunResult = Awaited<ReturnType<typeof runSyncAction>>
type SyncTileColor = keyof typeof AppDrawerItemColor

const syncPresentation: Record<SyncScriptId, { icon: ReactNode; colorKey: SyncTileColor }> = {
  'sync-modules': {
    icon: <Puzzle />,
    colorKey: 'indigo',
  },
  'sync-environments': {
    icon: <Server />,
    colorKey: 'sky',
  },
  'sync-tags': {
    icon: <Tag />,
    colorKey: 'yellow',
  },
  'sync-template-step-groups': {
    icon: <Component />,
    colorKey: 'violet',
  },
  'sync-template-steps': {
    icon: <LayoutTemplate />,
    colorKey: 'purple',
  },
  'sync-locator-groups': {
    icon: <Group />,
    colorKey: 'blue',
  },
  'sync-locators': {
    icon: <Code />,
    colorKey: 'emerald',
  },
  'sync-test-suites': {
    icon: <TestTubes />,
    colorKey: 'orange',
  },
  'sync-test-cases': {
    icon: <TestTubeDiagonal />,
    colorKey: 'rose',
  },
}

function formatExecutionSummary(result: SyncRunResult): string {
  if (result.requestedScriptId === SYNC_ALL_REQUEST_ID) {
    return `Completed ${result.executedScriptIds.length} sync scripts successfully.`
  }

  if (result.executedScriptIds.length <= 1) {
    return `${result.requestedScriptId} completed successfully.`
  }

  return `${result.requestedScriptId} completed after running ${result.executedScriptIds.join(' -> ')}.`
}

function formatFailureSummary(result: SyncRunResult): string {
  if ('failedScriptId' in result && result.failedScriptId) {
    const exitCode = typeof result.exitCode === 'number' ? ` (exit code ${result.exitCode})` : ''
    const cause = result.cause ?? 'No cause was reported.'
    return `${result.failedScriptId}${exitCode} failed: ${cause}`
  }

  return result.cause ?? `Unable to run ${result.requestedScriptId}.`
}

function formatExecutionOrder(scriptIds: SyncScriptId[]): string {
  return scriptIds.map(scriptId => getSyncScriptDefinition(scriptId).orderLabel).join(' -> ')
}

function SyncRow({
  definition,
  disabled,
  isActive,
  pendingCount,
  onRun,
}: {
  definition: SyncScriptDefinition
  disabled: boolean
  isActive: boolean
  pendingCount: number
  onRun: (requestId: SyncRequestId) => void
}) {
  const { icon, colorKey } = syncPresentation[definition.id]
  const color = AppDrawerItemColor[colorKey]
  const executionOrder = resolveRequestedSyncExecutionOrder(definition.id)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => onRun(definition.id)}
          className={`inline-flex h-24 w-44 flex-none flex-col items-start justify-start whitespace-normal rounded-2xl border-none px-3 py-2.5 text-left hover:text-gray-200 ${color.buttonColor}`}
        >
          <div className="flex w-full items-center justify-between gap-3">
            <div className={`${color.iconColor} shrink-0 [&_svg]:!h-5 [&_svg]:!w-5`}>
              {isActive ? <RefreshCw className="animate-spin" /> : icon}
            </div>
            {pendingCount > 0 ? (
              <div
                className={`flex min-w-7 shrink-0 items-center justify-center rounded-full px-2 py-1 text-[10px] font-semibold ${color.badgeColor}`}
              >
                {pendingCount}
              </div>
            ) : null}
          </div>
          <div className="mt-3 min-w-0">
            <p className="break-words text-xs font-medium leading-4 text-gray-100">{definition.label}</p>
          </div>
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>{definition.description}</p>
        <p className="mt-1 text-primary-foreground/80">Runs synchronization in order: {formatExecutionOrder(executionOrder)}</p>
      </TooltipContent>
    </Tooltip>
  )
}

export function SettingsSyncPanel({ pendingCounts }: { pendingCounts: SyncPendingCounts }) {
  const router = useRouter()
  const [activeRequestId, setActiveRequestId] = useState<SyncRequestId | null>(null)
  const [currentPendingCounts, setCurrentPendingCounts] = useState<SyncPendingCounts>(pendingCounts)

  useEffect(() => {
    setCurrentPendingCounts(pendingCounts)
  }, [pendingCounts])

  const runSync = async (requestId: SyncRequestId) => {
    if (activeRequestId) {
      return
    }

    setActiveRequestId(requestId)

    try {
      const result = await runSyncAction(requestId)

      if (result.success) {
        const refreshedCounts = await getSyncPendingCountsAction()
        setCurrentPendingCounts(refreshedCounts)
        toast({
          title: 'Sync completed',
          description: formatExecutionSummary(result),
        })
      } else {
        toast({
          variant: 'destructive',
          title: 'Sync failed',
          description: formatFailureSummary(result),
        })
      }

      router.refresh()
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Sync failed',
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setActiveRequestId(null)
    }
  }

  const isRunning = activeRequestId !== null

  return (
    <TooltipProvider>
      <Card className="border-gray-600/10 bg-gray-600/10 shadow-none">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-primary">Sync</CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-muted-foreground">
                  <CircleHelp className="h-4 w-4" />
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Runs all sync targets with prerequisites.
              </TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                disabled={isRunning}
                onClick={() => runSync(SYNC_ALL_REQUEST_ID)}
                className="inline-flex h-24 w-44 flex-none flex-col items-start justify-start whitespace-normal rounded-2xl border-none bg-emerald-500/10 px-3 py-2.5 text-left text-gray-100 hover:bg-emerald-500/20 hover:text-gray-100"
              >
                <div className="flex w-full items-center justify-between gap-3">
                  <div className="text-emerald-500 [&_svg]:!h-5 [&_svg]:!w-5">
                    {activeRequestId === SYNC_ALL_REQUEST_ID ? <RefreshCw className="animate-spin" /> : <RefreshCw />}
                  </div>
                  {currentPendingCounts[SYNC_ALL_REQUEST_ID] > 0 ? (
                    <div className="rounded-full bg-emerald-400 px-2 py-1 text-[10px] font-semibold text-emerald-900">
                      {currentPendingCounts[SYNC_ALL_REQUEST_ID]}
                    </div>
                  ) : null}
                </div>
                <p className="mt-3 text-xs font-medium leading-4">Sync All</p>
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Runs synchronization in order: {formatExecutionOrder(resolveRequestedSyncExecutionOrder(SYNC_ALL_REQUEST_ID))}
            </TooltipContent>
          </Tooltip>
          <div className="flex flex-wrap items-start gap-4">
            {syncScriptDefinitions.map(definition => (
              <SyncRow
                key={definition.id}
                definition={definition}
                disabled={isRunning}
                isActive={activeRequestId === definition.id}
                pendingCount={currentPendingCounts[definition.id]}
                onRun={runSync}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}
