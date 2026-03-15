import prisma from '@/config/db-config'
import { normalizeRoute } from '@/lib/locator-picker/suggestions'
import { spawnTask } from '@/lib/process/task-spawner'
import type {
  LocatorPickerSession,
  PickedLocatorPayload,
  StartLocatorPickerSessionRequest,
} from '@/types/locator-picker'
import { resolveLocatorPickerCompanionInvocation } from '@locator-picker-companion/launcher'
import {
  ensureLocatorPickerDirectories,
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

async function terminateProcessByPid(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    await execa('taskkill', ['/PID', String(pid), '/T', '/F'])
    return
  }

  process.kill(pid, 'SIGTERM')
}

async function cleanupLingeringCompanionProcesses(currentSessionId?: string): Promise<void> {
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
    if (!session?.companionPid || session.sessionId === currentSessionId) {
      continue
    }

    const ageMs = now - new Date(session.updatedAt).getTime()
    const shouldTerminate =
      session.status === 'picked' ||
      session.status === 'closed' ||
      session.status === 'error' ||
      ageMs > 2 * 60 * 1000

    if (!shouldTerminate) {
      continue
    }

    await terminateProcessByPid(session.companionPid).catch(() => undefined)
    await patchLocatorPickerSessionFile(sessionFilePath, {
      companionPid: null,
      status: session.status === 'picked' ? 'picked' : 'closed',
    }).catch(() => undefined)
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
    await cleanupLingeringCompanionProcesses()

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
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await writeLocatorPickerSessionFile(sessionFilePath, initialRecord)

    try {
      const { command, args } = await resolveLocatorPickerCompanionInvocation(
        ['--session-id', sessionId, '--session-file', sessionFilePath, '--target-url', normalizedUrl],
        process.cwd(),
      )

      const spawnedProcess = await spawnTask(command, args, {
        cwd: process.cwd(),
        env: process.env,
        streamLogs: false,
        captureOutput: true,
        logPrefix: `locator-picker-companion-${sessionId}`,
      })

      spawnedProcess.process.on('error', error => {
        void markSessionLaunchFailure(
          sessionFilePath,
          error.message || 'Locator picker companion failed to start.',
          spawnedProcess.pid,
        )
      })

      spawnedProcess.process.on('exit', code => {
        const stderr = spawnedProcess.output.stderr.join('').trim()
        const stdout = spawnedProcess.output.stdout.join('').trim()

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

          const details = stderr || stdout
          const message = details
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
        }).catch(() => undefined)
      })

      await patchLocatorPickerSessionFile(sessionFilePath, current => ({
        companionPid: spawnedProcess.pid ?? current.companionPid,
        error: undefined,
      }))
    } catch (error) {
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

  async closeSession(sessionId: string): Promise<LocatorPickerSession | null> {
    const sessionFilePath = getLocatorPickerSessionFilePath(sessionId)
    const current = await readLocatorPickerSessionFile(sessionFilePath)
    if (!current) {
      return null
    }

    if (current.companionPid) {
      await terminateProcessByPid(current.companionPid).catch(() => undefined)
    }

    const nextRecord = await patchLocatorPickerSessionFile(sessionFilePath, {
      status: 'closed',
      companionPid: null,
    })

    return nextRecord ? toSessionSnapshot(nextRecord) : null
  }
}

export const locatorPickerSessionManager = LocatorPickerSessionManager.getInstance()
