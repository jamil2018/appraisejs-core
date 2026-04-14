'use client'

import { useEffect } from 'react'
import {
  RefreshCw,
} from 'lucide-react'
import { AppDrawerItemColor } from '@/app/(dashboard-components)/app-drawer'
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
import {
  getSyncTooltipCopy,
  syncPanelInfo,
  syncPresentation,
} from './settings-sync-panel-helpers'
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
  const color = AppDrawerItemColor[colorKey]

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          aria-label={definition.label}
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
        <p className="mt-1 text-primary-foreground/80">{getSyncTooltipCopy(definition.id)}</p>
      </TooltipContent>
    </Tooltip>
  )
}

export function SettingsSyncPanel({ pendingCounts }: { pendingCounts: SyncPendingCounts }) {
  const { activeRequestId, isRunning, pendingCounts: currentPendingCounts, runSync, setPendingCounts } =
    useSettingsSync({
      initialPendingCounts: pendingCounts,
    })

  useEffect(() => {
    setPendingCounts(pendingCounts)
  }, [pendingCounts, setPendingCounts])

  return (
    <TooltipProvider>
      <Card className="border-gray-600/10 bg-gray-600/10 shadow-none">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-primary">Sync</CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help text-muted-foreground">
                  {syncPanelInfo.helpIcon}
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
                aria-label="Sync All"
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
              {getSyncTooltipCopy(SYNC_ALL_REQUEST_ID)}
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
