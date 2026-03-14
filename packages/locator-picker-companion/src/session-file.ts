import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises'
import path from 'path'
import type { CompanionSessionFile } from './types.js'

function withTimestamp(
  session: Omit<CompanionSessionFile, 'updatedAt'> & { updatedAt?: string },
): CompanionSessionFile {
  return {
    ...session,
    updatedAt: session.updatedAt ?? new Date().toISOString(),
  }
}

export function getLocatorPickerRootDir(repoRoot = process.cwd()): string {
  return path.join(repoRoot, '.tmp', 'locator-picker')
}

export function getLocatorPickerSessionsDir(repoRoot = process.cwd()): string {
  return path.join(getLocatorPickerRootDir(repoRoot), 'sessions')
}

export function getLocatorPickerProfilesDir(repoRoot = process.cwd()): string {
  return path.join(getLocatorPickerRootDir(repoRoot), 'profiles')
}

export function getLocatorPickerSessionFilePath(sessionId: string, repoRoot = process.cwd()): string {
  return path.join(getLocatorPickerSessionsDir(repoRoot), `${sessionId}.json`)
}

export async function ensureLocatorPickerDirectories(repoRoot = process.cwd()): Promise<void> {
  const rootDir = getLocatorPickerRootDir(repoRoot)
  await mkdir(getLocatorPickerSessionsDir(repoRoot), { recursive: true })
  await mkdir(getLocatorPickerProfilesDir(repoRoot), { recursive: true })

  process.env.TMPDIR = rootDir
  process.env.TMP = rootDir
  process.env.TEMP = rootDir
}

export async function readLocatorPickerSessionFile(
  sessionFilePath: string,
): Promise<CompanionSessionFile | null> {
  try {
    const raw = await readFile(sessionFilePath, 'utf8')
    return JSON.parse(raw) as CompanionSessionFile
  } catch {
    return null
  }
}

export async function writeLocatorPickerSessionFile(
  sessionFilePath: string,
  session: Omit<CompanionSessionFile, 'updatedAt'> & { updatedAt?: string },
): Promise<CompanionSessionFile> {
  await mkdir(path.dirname(sessionFilePath), { recursive: true })

  const normalized = withTimestamp(session)
  const serialized = `${JSON.stringify(normalized, null, 2)}\n`
  const tempFilePath = `${sessionFilePath}.${process.pid}.${Date.now()}.tmp`

  try {
    await writeFile(tempFilePath, serialized, 'utf8')
    await rename(tempFilePath, sessionFilePath)
  } catch (error) {
    await unlink(tempFilePath).catch(() => undefined)

    const code = error instanceof Error && 'code' in error ? String(error.code) : ''
    if (process.platform === 'win32' || code === 'EPERM' || code === 'EACCES') {
      await writeFile(sessionFilePath, serialized, 'utf8')
    } else {
      throw error
    }
  }

  return normalized
}

export async function patchLocatorPickerSessionFile(
  sessionFilePath: string,
  patch:
    | Partial<CompanionSessionFile>
    | ((current: CompanionSessionFile) => Partial<CompanionSessionFile> | CompanionSessionFile),
): Promise<CompanionSessionFile | null> {
  const current = await readLocatorPickerSessionFile(sessionFilePath)
  if (!current) {
    return null
  }

  const nextPatch = typeof patch === 'function' ? patch(current) : patch
  const nextSession = {
    ...current,
    ...nextPatch,
    updatedAt: new Date().toISOString(),
  }

  return writeLocatorPickerSessionFile(sessionFilePath, nextSession)
}
