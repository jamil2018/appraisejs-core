import { randomUUID } from 'crypto'
import { access, appendFile, mkdir, readFile, rename, rm, unlink, writeFile } from 'fs/promises'
import path from 'path'
const sessionFileOperationQueue = new Map()
function withTimestamp(session) {
  var _a
  return Object.assign(Object.assign({}, session), {
    updatedAt: (_a = session.updatedAt) !== null && _a !== void 0 ? _a : new Date().toISOString(),
  })
}
export function getLocatorPickerRootDir(repoRoot = process.cwd()) {
  return path.join(repoRoot, '.tmp', 'locator-picker')
}
export function getLocatorPickerSessionsDir(repoRoot = process.cwd()) {
  return path.join(getLocatorPickerRootDir(repoRoot), 'sessions')
}
export function getLocatorPickerProfilesDir(repoRoot = process.cwd()) {
  return path.join(getLocatorPickerRootDir(repoRoot), 'profiles')
}
export function getLocatorPickerLogsDir(repoRoot = process.cwd()) {
  return path.join(getLocatorPickerRootDir(repoRoot), 'logs')
}
export function getLocatorPickerProfileDir(sessionId, repoRoot = process.cwd()) {
  return path.join(getLocatorPickerProfilesDir(repoRoot), sessionId)
}
export function getLocatorPickerRuntimeDir(repoRoot = process.cwd()) {
  return path.join(getLocatorPickerRootDir(repoRoot), 'runtime')
}
export function getLocatorPickerRuntimeHomeDir(repoRoot = process.cwd()) {
  return path.join(getLocatorPickerRuntimeDir(repoRoot), 'home')
}
export function getLocatorPickerRuntimeEnv(repoRoot = process.cwd(), baseEnv = process.env) {
  const runtimeDir = getLocatorPickerRuntimeDir(repoRoot)
  const runtimeHomeDir = getLocatorPickerRuntimeHomeDir(repoRoot)
  const tempDir = path.join(runtimeDir, 'tmp')
  const configDir = path.join(runtimeDir, 'config')
  const cacheDir = path.join(runtimeDir, 'cache')
  const appDataDir = path.join(runtimeDir, 'appdata')
  const localAppDataDir = path.join(runtimeDir, 'localappdata')
  return Object.assign(Object.assign({}, baseEnv), {
    HOME: runtimeHomeDir,
    USERPROFILE: runtimeHomeDir,
    APPDATA: appDataDir,
    LOCALAPPDATA: localAppDataDir,
    XDG_CONFIG_HOME: configDir,
    XDG_CACHE_HOME: cacheDir,
    TMPDIR: tempDir,
    TMP: tempDir,
    TEMP: tempDir,
  })
}
export function getLocatorPickerSessionFilePath(sessionId, repoRoot = process.cwd()) {
  return path.join(getLocatorPickerSessionsDir(repoRoot), `${sessionId}.json`)
}
export function getLocatorPickerCrashLogPath(sessionId, repoRoot = process.cwd()) {
  return path.join(getLocatorPickerLogsDir(repoRoot), `${sessionId}.log`)
}
export async function removeLocatorPickerProfileDir(sessionId, repoRoot = process.cwd()) {
  await rm(getLocatorPickerProfileDir(sessionId, repoRoot), {
    force: true,
    recursive: true,
  }).catch(() => undefined)
}
export async function removeLocatorPickerSessionFile(sessionId, repoRoot = process.cwd()) {
  await unlink(getLocatorPickerSessionFilePath(sessionId, repoRoot)).catch(() => undefined)
}
export async function clearLocatorPickerCrashLogs(repoRoot = process.cwd()) {
  await rm(getLocatorPickerLogsDir(repoRoot), {
    force: true,
    recursive: true,
  }).catch(() => console.error('Failed to clear locator picker crash logs.'))
  await mkdir(getLocatorPickerLogsDir(repoRoot), { recursive: true })
}
export async function createLocatorPickerCrashLog(logFilePath) {
  await mkdir(path.dirname(logFilePath), { recursive: true })
  await writeFile(logFilePath, '', 'utf8')
}
export async function appendLocatorPickerCrashLog(logFilePath, message) {
  try {
    await access(logFilePath)
  } catch (_a) {
    return
  }
  await appendFile(logFilePath, `[${new Date().toISOString()}] ${message}\n`, 'utf8')
}
export async function ensureLocatorPickerDirectories(repoRoot = process.cwd()) {
  const runtimeDir = getLocatorPickerRuntimeDir(repoRoot)
  const runtimeHomeDir = getLocatorPickerRuntimeHomeDir(repoRoot)
  const tempDir = path.join(runtimeDir, 'tmp')
  const configDir = path.join(runtimeDir, 'config')
  const cacheDir = path.join(runtimeDir, 'cache')
  const appDataDir = path.join(runtimeDir, 'appdata')
  const localAppDataDir = path.join(runtimeDir, 'localappdata')
  await mkdir(getLocatorPickerSessionsDir(repoRoot), { recursive: true })
  await mkdir(getLocatorPickerProfilesDir(repoRoot), { recursive: true })
  await mkdir(getLocatorPickerLogsDir(repoRoot), { recursive: true })
  await mkdir(runtimeHomeDir, { recursive: true })
  await mkdir(tempDir, { recursive: true })
  await mkdir(configDir, { recursive: true })
  await mkdir(cacheDir, { recursive: true })
  await mkdir(appDataDir, { recursive: true })
  await mkdir(localAppDataDir, { recursive: true })
}
export async function readLocatorPickerSessionFile(sessionFilePath) {
  try {
    const raw = await readFile(sessionFilePath, 'utf8')
    return JSON.parse(raw)
  } catch (_a) {
    return null
  }
}
async function enqueueSessionFileOperation(sessionFilePath, operation) {
  var _a
  const previousOperation =
    (_a = sessionFileOperationQueue.get(sessionFilePath)) !== null && _a !== void 0 ? _a : Promise.resolve()
  const nextOperation = previousOperation.catch(() => undefined).then(operation)
  sessionFileOperationQueue.set(sessionFilePath, nextOperation)
  try {
    return await nextOperation
  } finally {
    if (sessionFileOperationQueue.get(sessionFilePath) === nextOperation) {
      sessionFileOperationQueue.delete(sessionFilePath)
    }
  }
}
async function writeLocatorPickerSessionFileImmediate(sessionFilePath, session) {
  await mkdir(path.dirname(sessionFilePath), { recursive: true })
  const normalized = withTimestamp(session)
  const serialized = `${JSON.stringify(normalized, null, 2)}\n`
  const tempFilePath = `${sessionFilePath}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(tempFilePath, serialized, 'utf8')
    await rename(tempFilePath, sessionFilePath)
  } catch (error) {
    await unlink(tempFilePath).catch(() => undefined)
    const code = error instanceof Error && 'code' in error ? String(error.code) : ''
    if (process.platform === 'win32' || code === 'EPERM' || code === 'EACCES' || code === 'ENOENT') {
      await writeFile(sessionFilePath, serialized, 'utf8')
    } else {
      throw error
    }
  }
  return normalized
}
export async function writeLocatorPickerSessionFile(sessionFilePath, session) {
  return enqueueSessionFileOperation(sessionFilePath, () =>
    writeLocatorPickerSessionFileImmediate(sessionFilePath, session),
  )
}
export async function patchLocatorPickerSessionFile(sessionFilePath, patch) {
  return enqueueSessionFileOperation(sessionFilePath, async () => {
    const current = await readLocatorPickerSessionFile(sessionFilePath)
    if (!current) {
      return null
    }
    const nextPatch = typeof patch === 'function' ? patch(current) : patch
    const nextSession = Object.assign(Object.assign(Object.assign({}, current), nextPatch), {
      updatedAt: new Date().toISOString(),
    })
    return writeLocatorPickerSessionFileImmediate(sessionFilePath, nextSession)
  })
}
