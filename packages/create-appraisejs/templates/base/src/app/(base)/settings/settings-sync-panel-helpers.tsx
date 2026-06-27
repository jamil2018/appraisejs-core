import type { ReactNode } from 'react'
import {
  CircleHelp,
  Code,
  Component,
  Group,
  ListTree,
  LayoutTemplate,
  Puzzle,
  Server,
  Tag,
  TestTubeDiagonal,
  TestTubes,
} from 'lucide-react'

import { AppDrawerItemColor } from '@/app/(dashboard-components)/app-drawer'
import {
  SYNC_ALL_REQUEST_ID,
  getSyncScriptDefinition,
  resolveRequestedSyncExecutionOrder,
  type SyncRequestId,
  type SyncScriptId,
} from '@/lib/sync/sync-registry'

type SyncTileColor = keyof typeof AppDrawerItemColor

export type SyncRunResult = {
  requestedScriptId: string
  executedScriptIds: string[]
  success: boolean
  durationMs: number
  cause?: string
  exitCode?: number
  failedScriptId?: string
}

export const syncPresentation: Record<SyncScriptId, { icon: ReactNode; colorKey: SyncTileColor }> = {
  'sync-plans': {
    icon: <ListTree />,
    colorKey: 'emerald',
  },
  'sync-modules': {
    icon: <Puzzle />,
    colorKey: 'violet',
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

export function formatExecutionSummary(result: SyncRunResult): string {
  if (result.requestedScriptId === SYNC_ALL_REQUEST_ID) {
    return `Completed ${result.executedScriptIds.length} sync scripts successfully.`
  }

  if (result.executedScriptIds.length <= 1) {
    return `${result.requestedScriptId} completed successfully.`
  }

  return `${result.requestedScriptId} completed after running ${result.executedScriptIds.join(' -> ')}.`
}

export function formatFailureSummary(result: SyncRunResult): string {
  if (result.failedScriptId) {
    const exitCode = typeof result.exitCode === 'number' ? ` (exit code ${result.exitCode})` : ''
    const cause = result.cause ?? 'No cause was reported.'
    return `${result.failedScriptId}${exitCode} failed: ${cause}`
  }

  return result.cause ?? `Unable to run ${result.requestedScriptId}.`
}

export function formatExecutionOrder(requestId: SyncRequestId): string {
  return resolveRequestedSyncExecutionOrder(requestId)
    .map(scriptId => getSyncScriptDefinition(scriptId).orderLabel)
    .join(' -> ')
}

export function getSyncTooltipCopy(requestId: SyncRequestId) {
  const prefix = requestId === SYNC_ALL_REQUEST_ID ? 'Runs synchronization in order:' : 'Runs synchronization in order:'
  return `${prefix} ${formatExecutionOrder(requestId)}`
}

export const syncPanelInfo = {
  helpIcon: <CircleHelp className="size-4" />,
}
