'use client'

import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  SYNC_ALL_REQUEST_ID,
  type SyncRequestId,
  type SyncScriptDefinition,
  syncScriptDefinitions,
} from '@/lib/sync/sync-registry'
import type { SyncPendingCounts } from '@/lib/sync/sync-pending-counts'
import { getSyncTooltipCopy, syncPanelInfo, syncPresentation, syncTileColors } from './settings-sync-panel-helpers'
import { useSettingsSync } from './use-settings-sync'

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
  const color = syncTileColors[colorKey]

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          aria-label={definition.label}
          onClick={() => onRun(definition.id)}
          className={`inline-flex h-24 w-44 flex-none flex-col items-start justify-start whitespace-normal rounded-md border px-3 py-2.5 text-left hover:text-foreground ${color.buttonColor}`}
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
            <p className="break-words text-xs font-medium leading-4 text-foreground">{definition.label}</p>
          </div>
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>{definition.description}</p>
        <p className="text-primary-foreground/80 mt-1">{getSyncTooltipCopy(definition.id)}</p>
      </TooltipContent>
    </Tooltip>
  )
}

export function SettingsSyncPanel({ pendingCounts }: { pendingCounts: SyncPendingCounts }) {
  const {
    activeRequestId,
    isRunning,
    pendingCounts: currentPendingCounts,
    runSync,
  } = useSettingsSync({
    initialPendingCounts: pendingCounts,
  })
  const syncAllColor = syncTileColors.emerald

  return (
    <TooltipProvider>
      <Card className="border-zinc-600/10 bg-zinc-600/10 shadow-none">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-primary">Sync</CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-muted-foreground">{syncPanelInfo.helpIcon}</span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">Runs all sync targets with prerequisites.</TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                disabled={isRunning}
                aria-label="Sync All"
                onClick={() => runSync(SYNC_ALL_REQUEST_ID)}
                className={`inline-flex h-24 w-44 flex-none flex-col items-start justify-start whitespace-normal rounded-md border px-3 py-2.5 text-left hover:text-foreground ${syncAllColor.buttonColor}`}
              >
                <div className="flex w-full items-center justify-between gap-3">
                  <div className={`${syncAllColor.iconColor} shrink-0 [&_svg]:!h-5 [&_svg]:!w-5`}>
                    {activeRequestId === SYNC_ALL_REQUEST_ID ? <RefreshCw className="animate-spin" /> : <RefreshCw />}
                  </div>
                  {currentPendingCounts[SYNC_ALL_REQUEST_ID] > 0 ? (
                    <div
                      className={`flex min-w-7 shrink-0 items-center justify-center rounded-full px-2 py-1 text-[10px] font-semibold ${syncAllColor.badgeColor}`}
                    >
                      {currentPendingCounts[SYNC_ALL_REQUEST_ID]}
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 min-w-0">
                  <p className="break-words text-xs font-medium leading-4 text-foreground">Sync All</p>
                </div>
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{getSyncTooltipCopy(SYNC_ALL_REQUEST_ID)}</TooltipContent>
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
