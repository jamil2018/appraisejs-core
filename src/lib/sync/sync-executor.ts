import { execa } from 'execa'
import { join } from 'path'
import {
  getSyncScriptDefinition,
  resolveRequestedSyncExecutionOrder,
  type SyncRequestId,
  type SyncScriptId,
} from '@/lib/sync/sync-registry'

export type SyncExecutionResult = {
  requestedScriptId: SyncRequestId
  executedScriptIds: SyncScriptId[]
  success: boolean
  failedScriptId?: SyncScriptId
  exitCode?: number
  durationMs: number
  cause?: string
}

type ScriptExecutionOutput = {
  exitCode: number | null
  stdout: string
  stderr: string
}

const ANSI_ESCAPE_PATTERN = /\u001B\[[0-9;]*m/g

function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_PATTERN, '')
}

function normalizeOutputLines(value?: string): string[] {
  if (!value) {
    return []
  }

  return stripAnsi(value)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}

function sanitizeCause(line: string): string {
  return line
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/^(Error|Cause):\s*/i, '')
    .trim()
}

function selectMostRelevantLine(lines: string[]): string | undefined {
  const preferredLine = lines.find(line => /(error|failed|fatal|cannot|unable|invalid|missing)/i.test(line))
  const selectedLine = preferredLine ?? lines[lines.length - 1]

  if (!selectedLine) {
    return undefined
  }

  const sanitized = sanitizeCause(selectedLine)
  return sanitized || undefined
}

function parseSyncFailureCause(result: ScriptExecutionOutput | { error: unknown }): string | undefined {
  if ('error' in result) {
    return result.error instanceof Error ? result.error.message : String(result.error)
  }

  return selectMostRelevantLine([
    ...normalizeOutputLines(result.stderr),
    ...normalizeOutputLines(result.stdout),
  ])
}

async function executeSyncScript(scriptId: SyncScriptId): Promise<ScriptExecutionOutput> {
  const scriptPath = join(process.cwd(), 'scripts', getSyncScriptDefinition(scriptId).scriptFile)

  const result = await execa(process.execPath, ['--import', 'tsx', scriptPath], {
    cwd: process.cwd(),
    stdio: 'pipe',
    reject: false,
  })

  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

export async function runRequestedSync(requestedScriptId: SyncRequestId): Promise<SyncExecutionResult> {
  const executionOrder = resolveRequestedSyncExecutionOrder(requestedScriptId)
  const startTime = Date.now()
  const executedScriptIds: SyncScriptId[] = []

  for (const scriptId of executionOrder) {
    try {
      const result = await executeSyncScript(scriptId)
      executedScriptIds.push(scriptId)

      if (result.exitCode !== 0) {
        return {
          requestedScriptId,
          executedScriptIds,
          success: false,
          failedScriptId: scriptId,
          exitCode: result.exitCode ?? undefined,
          durationMs: Date.now() - startTime,
          cause: parseSyncFailureCause(result),
        }
      }
    } catch (error) {
      executedScriptIds.push(scriptId)

      return {
        requestedScriptId,
        executedScriptIds,
        success: false,
        failedScriptId: scriptId,
        durationMs: Date.now() - startTime,
        cause: parseSyncFailureCause({ error }),
      }
    }
  }

  return {
    requestedScriptId,
    executedScriptIds,
    success: true,
    durationMs: Date.now() - startTime,
  }
}
