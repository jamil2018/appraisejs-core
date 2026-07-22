import type { ReactNode } from 'react'
import {
  CircleHelp,
  BookOpenCheck,
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

import {
  SYNC_ALL_REQUEST_ID,
  getSyncScriptDefinition,
  resolveRequestedSyncExecutionOrder,
  type SyncRequestId,
  type SyncScriptId,
} from '@/lib/sync/sync-registry'

export const syncTileColors = {
  emerald: {
    buttonColor: 'border-emerald-500/25 bg-emerald-500/[0.04] hover:border-emerald-500/40 hover:bg-emerald-500/[0.08]',
    iconColor: 'text-emerald-400',
    badgeColor: 'bg-emerald-500/15 text-emerald-200',
  },
  violet: {
    buttonColor: 'border-violet-500/25 bg-violet-500/[0.04] hover:border-violet-500/40 hover:bg-violet-500/[0.08]',
    iconColor: 'text-violet-400',
    badgeColor: 'bg-violet-500/15 text-violet-200',
  },
  sky: {
    buttonColor: 'border-sky-500/25 bg-sky-500/[0.04] hover:border-sky-500/40 hover:bg-sky-500/[0.08]',
    iconColor: 'text-sky-400',
    badgeColor: 'bg-sky-500/15 text-sky-200',
  },
  yellow: {
    buttonColor: 'border-yellow-500/25 bg-yellow-500/[0.04] hover:border-yellow-500/40 hover:bg-yellow-500/[0.08]',
    iconColor: 'text-yellow-400',
    badgeColor: 'bg-yellow-500/15 text-yellow-200',
  },
  purple: {
    buttonColor: 'border-purple-500/25 bg-purple-500/[0.04] hover:border-purple-500/40 hover:bg-purple-500/[0.08]',
    iconColor: 'text-purple-400',
    badgeColor: 'bg-purple-500/15 text-purple-200',
  },
  blue: {
    buttonColor: 'border-blue-500/25 bg-blue-500/[0.04] hover:border-blue-500/40 hover:bg-blue-500/[0.08]',
    iconColor: 'text-blue-400',
    badgeColor: 'bg-blue-500/15 text-blue-200',
  },
  orange: {
    buttonColor: 'border-orange-500/25 bg-orange-500/[0.04] hover:border-orange-500/40 hover:bg-orange-500/[0.08]',
    iconColor: 'text-orange-400',
    badgeColor: 'bg-orange-500/15 text-orange-200',
  },
  rose: {
    buttonColor: 'border-rose-500/25 bg-rose-500/[0.04] hover:border-rose-500/40 hover:bg-rose-500/[0.08]',
    iconColor: 'text-rose-400',
    badgeColor: 'bg-rose-500/15 text-rose-200',
  },
} as const

type SyncTileColor = keyof typeof syncTileColors

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
  'sync-step-definitions': {
    icon: <BookOpenCheck />,
    colorKey: 'sky',
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
