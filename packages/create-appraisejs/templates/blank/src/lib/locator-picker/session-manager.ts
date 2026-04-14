import prisma from '@/config/db-config'
import { normalizeRoute } from '@/lib/locator-picker/suggestions'
import { removeTask, spawnTask } from '@/lib/process/task-spawner'
import type {
  LocatorPickerSession,
  PickedLocatorPayload,
  StartLocatorPickerSessionRequest,
} from '@/types/locator-picker'
import { resolveLocatorPickerCompanionInvocation } from '@locator-picker-companion/launcher'
import {
  appendLocatorPickerCrashLog,
  clearLocatorPickerCrashLogs,
  createLocatorPickerCrashLog,
  ensureLocatorPickerDirectories,
  getLocatorPickerRuntimeEnv,
  getLocatorPickerCrashLogPath,
  removeLocatorPickerProfileDir,
  removeLocatorPickerSessionFile,
  getLocatorPickerSessionsDir,
  getLocatorPickerSessionFilePath,
  patchLocatorPickerSessionFile,
  readLocatorPickerSessionFile,
  writeLocatorPickerSessionFile,
} from '@locator-picker-companion/session-file'
import type { CompanionSessionFile } from '@locator-picker-companion/types'
import { randomUUID } from 'crypto'
import { execa } from 'execa'
import { readdir } from 'fs/promises'
import path from 'path'

const ACTIVE_SESSION_STALE_MS = 2 * 60 * 1000
const COMPANION_EXIT_POLL_MS = 100
const COMPANION_EXIT_TIMEOUT_MS = 5 * 1000
const TERMINAL_SESSION_RETENTION_MS = 30 * 60 * 1000

function safeUrlParts(url: string): { currentUrl: string; pathname: string } {
  if (!url) {
    return { currentUrl: '', pathname: '/' }
  }

  try {
    const parsed = new URL(url)
    return {
      currentUrl: parsed.toString(),
      pathname: parsed.pathname || '/',
    }
  } catch {
    return {
      currentUrl: url,
      pathname: normalizeRoute(url),
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isMissingProcessError(error: unknown): boolean {
  return Boolean(error instanceof Error && 'code' in error && error.code === 'ESRCH')
}

async function processExists(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (isMissingProcessError(error)) {
      return false
    }

    return true
  }
}

async function waitForProcessExit(pid: number, timeoutMs = COMPANION_EXIT_TIMEOUT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (!(await processExists(pid))) {
      return true
    }

    await delay(COMPANION_EXIT_POLL_MS)
  }

  return !(await processExists(pid))
}

async function terminateProcessByPid(pid: number, force = false): Promise<void> {
  if (process.platform === 'win32') {
    const args = ['/PID', String(pid), '/T']
    if (force) {
      args.push('/F')
    }

    await execa('taskkill', args)
    return
  }

  process.kill(pid, force ? 'SIGKILL' : 'SIGTERM')
}

async function shutdownCompanionProcess(pid: number): Promise<void> {
  await terminateProcessByPid(pid).catch(() => undefined)

  if (await waitForProcessExit(pid)) {
    return
  }

  await terminateProcessByPid(pid, true).catch(() => undefined)
  await waitForProcessExit(pid)
}

function getSessionAgeMs(updatedAt: string, now: number): number {
  const updatedAtMs = Date.parse(updatedAt)
  return Number.isFinite(updatedAtMs) ? Math.max(0, now - updatedAtMs) : Number.POSITIVE_INFINITY
}

function isTerminalStatus(status: CompanionSessionFile['status']): boolean {
  return status === 'picked' || status === 'closed' || status === 'error'
}

async function cleanupLingeringCompanionSessions(currentSessionId?: string): Promise<void> {
  await ensureLocatorPickerDirectories()

  const sessionsDir = getLocatorPickerSessionsDir()
  const entries = await readdir(sessionsDir).catch(() => [])
  const now = Date.now()

  for (const entry of entries) {
    if (!entry.endsWith('.json')) {
      continue
    }

    const sessionFilePath = path.join(sessionsDir, entry)
    const session = await readLocatorPickerSessionFile(sessionFilePath)
    if (!session || session.sessionId === currentSessionId) {
      continue
    }

    const ageMs = getSessionAgeMs(session.updatedAt, now)
    const isTerminal = isTerminalStatus(session.status)
    const shouldTerminate = Boolean(session.companionPid)
    const shouldCloseStaleSession = !session.companionPid && !isTerminal && ageMs > ACTIVE_SESSION_STALE_MS
    const shouldPruneSessionFile =
      (isTerminal && ageMs > TERMINAL_SESSION_RETENTION_MS) || shouldCloseStaleSession

    if (shouldTerminate && session.companionPid) {
      await shutdownCompanionProcess(session.companionPid).catch(() => undefined)
      await patchLocatorPickerSessionFile(sessionFilePath, {
        companionPid: null,
        status: session.status === 'picked' ? 'picked' : 'closed',
      }).catch(() => undefined)
    }

    if (shouldCloseStaleSession) {
      await patchLocatorPickerSessionFile(sessionFilePath, {
        companionPid: null,
        status: 'closed',
      }).catch(() => undefined)
    }

    if (shouldTerminate || isTerminal || shouldCloseStaleSession) {
      await removeLocatorPickerProfileDir(session.sessionId).catch(() => undefined)
    }

    if (shouldPruneSessionFile) {
      await removeLocatorPickerSessionFile(session.sessionId).catch(() => undefined)
    }
  }
}

function toPickedLocatorPayload(
  sessionId: string,
  payload?: CompanionSessionFile['pickedLocator'],
): PickedLocatorPayload | undefined {
  if (!payload) {
    return undefined
  }

  return {
    sessionId,
    selector: payload.selector,
    currentUrl: payload.currentUrl,
    pathname: payload.pathname,
    pageTitle: payload.pageTitle,
    tagName: payload.tagName,
    text: payload.text,
    accessibleName: payload.accessibleName,
    strategy: payload.strategy,
  }
}

function toSessionSnapshot(record: CompanionSessionFile): LocatorPickerSession {
  return {
    sessionId: record.sessionId,
    launchSource: record.launchSource,
    browserName: 'chromium',
    status: record.status,
    currentUrl: record.currentUrl,
    currentPathname: record.currentPathname,
    pageTitle: record.pageTitle,
    companionPid: record.companionPid,
    crashLogPath: record.crashLogPath,
    pickedLocator: toPickedLocatorPayload(record.sessionId, record.pickedLocator),
    startedAt: record.startedAt,
    updatedAt: record.updatedAt,
    error: record.error,
  }
}

async function markSessionLaunchFailure(
  sessionFilePath: string,
  message: string,
  companionPid: number | null | undefined,
): Promise<void> {
  await patchLocatorPickerSessionFile(sessionFilePath, current => {
    if (current.status === 'picked' || current.status === 'closed') {
      return current
    }

    return {
      status: 'error',
      error: message,
      companionPid: companionPid ?? current.companionPid,
    }
  })
}

class LocatorPickerSessionManager {
  private constructor() {}

  static getInstance(): LocatorPickerSessionManager {
    const globalForLocatorPicker = global as unknown as {
      locatorPickerSessionManager?: LocatorPickerSessionManager
    }

    if (!globalForLocatorPicker.locatorPickerSessionManager) {
      globalForLocatorPicker.locatorPickerSessionManager = new LocatorPickerSessionManager()
    }

    return globalForLocatorPicker.locatorPickerSessionManager
  }

  async startSession(request: StartLocatorPickerSessionRequest): Promise<LocatorPickerSession> {
    await clearLocatorPickerCrashLogs()
    await cleanupLingeringCompanionSessions()

    const environment = request.environmentId
      ? await prisma.environment.findUnique({
          where: {
            id: request.environmentId,
          },
        })
      : null

    const launchUrl = request.url?.trim() || environment?.baseUrl || ''
    if (!launchUrl) {
      throw new Error('Choose an environment or provide a URL before launching Chromium.')
    }

    const normalizedUrl = /^https?:\/\//i.test(launchUrl) ? launchUrl : `https://${launchUrl}`
    const sessionId = randomUUID()
    const sessionFilePath = getLocatorPickerSessionFilePath(sessionId)
    const crashLogPath = getLocatorPickerCrashLogPath(sessionId)
    const { currentUrl, pathname } = safeUrlParts(normalizedUrl)

    await ensureLocatorPickerDirectories()

    const initialRecord: CompanionSessionFile = {
      sessionId,
      status: 'starting',
      launchSource: {
        environmentId: environment?.id,
        environmentName: environment?.name,
        url: normalizedUrl,
      },
      currentUrl,
      currentPathname: pathname,
      pageTitle: '',
      companionPid: null,
      crashLogPath,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await writeLocatorPickerSessionFile(sessionFilePath, initialRecord)
    await createLocatorPickerCrashLog(crashLogPath)
    await appendLocatorPickerCrashLog(
      crashLogPath,
      `Session created for ${normalizedUrl}. Waiting for companion launch.`,
    ).catch(() => undefined)

    const companionEnv = getLocatorPickerRuntimeEnv(process.cwd(), process.env)

    try {
      const { command, args } = await resolveLocatorPickerCompanionInvocation(
        ['--session-id', sessionId, '--session-file', sessionFilePath, '--target-url', normalizedUrl],
        process.cwd(),
      )

      const spawnedProcess = await spawnTask(command, args, {
        cwd: process.cwd(),
        env: companionEnv,
        streamLogs: false,
        captureOutput: true,
        logPrefix: `locator-picker-companion-${sessionId}`,
        retainProcessRecord: false,
      })

      spawnedProcess.process.on('error', error => {
        void markSessionLaunchFailure(
          sessionFilePath,
          error.message || 'Locator picker companion failed to start.',
          spawnedProcess.pid,
        )
        void appendLocatorPickerCrashLog(
          crashLogPath,
          `Companion process error: ${error.message || 'Unknown process error.'}`,
        ).catch(() => undefined)
        removeTask(spawnedProcess.name)
      })

      spawnedProcess.process.on('exit', code => {
        const stderr = spawnedProcess.output.stderr.join('').trim()
        const stdout = spawnedProcess.output.stdout.join('').trim()
        const logLines = [`Companion process exited with code ${code}.`]

        if (stdout) {
          logLines.push(`Captured stdout:\n${stdout}`)
        }

        if (stderr) {
          logLines.push(`Captured stderr:\n${stderr}`)
        }

        void patchLocatorPickerSessionFile(sessionFilePath, current => {
          const basePatch: Partial<CompanionSessionFile> = {
            companionPid: null,
          }

          if (code === 0) {
            if (current.status === 'picked') {
              return basePatch
            }

            return {
              ...basePatch,
              status: 'closed',
            }
          }

          const details = current.error?.trim() || stderr || stdout
          const message = current.error?.trim()
            ? current.error.trim()
            : details
              ? `Locator picker companion exited early: ${details}`
              : `Locator picker companion exited early with code ${code}.`

          if (current.status === 'picked' || current.status === 'closed') {
            return basePatch
          }

          return {
            ...basePatch,
            status: 'error',
            error: message,
          }
        })
          .catch(() => undefined)
          .finally(() => {
            void appendLocatorPickerCrashLog(crashLogPath, logLines.join('\n\n')).catch(() => undefined)
            removeTask(spawnedProcess.name)
            return removeLocatorPickerProfileDir(sessionId).catch(() => undefined)
          })
      })

      await patchLocatorPickerSessionFile(sessionFilePath, current => ({
        companionPid: spawnedProcess.pid ?? current.companionPid,
        error: undefined,
      }))
    } catch (error) {
      await appendLocatorPickerCrashLog(
        crashLogPath,
        `Failed to spawn companion: ${error instanceof Error ? error.message : 'Unknown launch failure.'}`,
      ).catch(() => undefined)
      await removeLocatorPickerProfileDir(sessionId).catch(() => undefined)
      await patchLocatorPickerSessionFile(sessionFilePath, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to start the locator picker companion.',
      })
    }

    const record = await readLocatorPickerSessionFile(sessionFilePath)
    if (!record) {
      throw new Error('Locator picker session could not be initialized.')
    }

    return toSessionSnapshot(record)
  }

  async getSession(sessionId: string): Promise<LocatorPickerSession | null> {
    const record = await readLocatorPickerSessionFile(getLocatorPickerSessionFilePath(sessionId))
    return record ? toSessionSnapshot(record) : null
  }

  async markSaving(sessionId?: string): Promise<void> {
    if (!sessionId) {
      return
    }

    await patchLocatorPickerSessionFile(getLocatorPickerSessionFilePath(sessionId), {
      status: 'saving',
      error: undefined,
    })
  }

  async markReadyAfterSave(sessionId?: string): Promise<void> {
    if (!sessionId) {
      return
    }

    await patchLocatorPickerSessionFile(getLocatorPickerSessionFilePath(sessionId), current => ({
      status: current.pickedLocator ? 'picked' : current.companionPid ? 'ready' : 'closed',
      error: undefined,
    }))
  }
}

export const locatorPickerSessionManager = LocatorPickerSessionManager.getInstance()
