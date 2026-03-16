import { randomUUID } from 'crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises';
import path from 'path';
const sessionFileOperationQueue = new Map();
function withTimestamp(session) {
    var _a;
    return Object.assign(Object.assign({}, session), { updatedAt: (_a = session.updatedAt) !== null && _a !== void 0 ? _a : new Date().toISOString() });
}
export function getLocatorPickerRootDir(repoRoot = process.cwd()) {
    return path.join(repoRoot, '.tmp', 'locator-picker');
}
export function getLocatorPickerSessionsDir(repoRoot = process.cwd()) {
    return path.join(getLocatorPickerRootDir(repoRoot), 'sessions');
}
export function getLocatorPickerProfilesDir(repoRoot = process.cwd()) {
    return path.join(getLocatorPickerRootDir(repoRoot), 'profiles');
}
export function getLocatorPickerRuntimeDir(repoRoot = process.cwd()) {
    return path.join(getLocatorPickerRootDir(repoRoot), 'runtime');
}
export function getLocatorPickerRuntimeHomeDir(repoRoot = process.cwd()) {
    return path.join(getLocatorPickerRuntimeDir(repoRoot), 'home');
}
export function getLocatorPickerSessionFilePath(sessionId, repoRoot = process.cwd()) {
    return path.join(getLocatorPickerSessionsDir(repoRoot), `${sessionId}.json`);
}
export async function ensureLocatorPickerDirectories(repoRoot = process.cwd()) {
    const rootDir = getLocatorPickerRootDir(repoRoot);
    const runtimeDir = getLocatorPickerRuntimeDir(repoRoot);
    const runtimeHomeDir = getLocatorPickerRuntimeHomeDir(repoRoot);
    const tempDir = path.join(runtimeDir, 'tmp');
    const configDir = path.join(runtimeDir, 'config');
    const cacheDir = path.join(runtimeDir, 'cache');
    const appDataDir = path.join(runtimeDir, 'appdata');
    const localAppDataDir = path.join(runtimeDir, 'localappdata');
    await mkdir(getLocatorPickerSessionsDir(repoRoot), { recursive: true });
    await mkdir(getLocatorPickerProfilesDir(repoRoot), { recursive: true });
    await mkdir(runtimeHomeDir, { recursive: true });
    await mkdir(tempDir, { recursive: true });
    await mkdir(configDir, { recursive: true });
    await mkdir(cacheDir, { recursive: true });
    await mkdir(appDataDir, { recursive: true });
    await mkdir(localAppDataDir, { recursive: true });
    process.env.HOME = runtimeHomeDir;
    process.env.USERPROFILE = runtimeHomeDir;
    process.env.APPDATA = appDataDir;
    process.env.LOCALAPPDATA = localAppDataDir;
    process.env.XDG_CONFIG_HOME = configDir;
    process.env.XDG_CACHE_HOME = cacheDir;
    process.env.TMPDIR = tempDir;
    process.env.TMP = tempDir;
    process.env.TEMP = tempDir;
}
export async function readLocatorPickerSessionFile(sessionFilePath) {
    try {
        const raw = await readFile(sessionFilePath, 'utf8');
        return JSON.parse(raw);
    }
    catch (_a) {
        return null;
    }
}
async function enqueueSessionFileOperation(sessionFilePath, operation) {
    var _a;
    const previousOperation = (_a = sessionFileOperationQueue.get(sessionFilePath)) !== null && _a !== void 0 ? _a : Promise.resolve();
    const nextOperation = previousOperation.catch(() => undefined).then(operation);
    sessionFileOperationQueue.set(sessionFilePath, nextOperation);
    try {
        return await nextOperation;
    }
    finally {
        if (sessionFileOperationQueue.get(sessionFilePath) === nextOperation) {
            sessionFileOperationQueue.delete(sessionFilePath);
        }
    }
}
async function writeLocatorPickerSessionFileImmediate(sessionFilePath, session) {
    await mkdir(path.dirname(sessionFilePath), { recursive: true });
    const normalized = withTimestamp(session);
    const serialized = `${JSON.stringify(normalized, null, 2)}\n`;
    const tempFilePath = `${sessionFilePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
        await writeFile(tempFilePath, serialized, 'utf8');
        await rename(tempFilePath, sessionFilePath);
    }
    catch (error) {
        await unlink(tempFilePath).catch(() => undefined);
        const code = error instanceof Error && 'code' in error ? String(error.code) : '';
        if (process.platform === 'win32' || code === 'EPERM' || code === 'EACCES' || code === 'ENOENT') {
            await writeFile(sessionFilePath, serialized, 'utf8');
        }
        else {
            throw error;
        }
    }
    return normalized;
}
export async function writeLocatorPickerSessionFile(sessionFilePath, session) {
    return enqueueSessionFileOperation(sessionFilePath, () => writeLocatorPickerSessionFileImmediate(sessionFilePath, session));
}
export async function patchLocatorPickerSessionFile(sessionFilePath, patch) {
    return enqueueSessionFileOperation(sessionFilePath, async () => {
        const current = await readLocatorPickerSessionFile(sessionFilePath);
        if (!current) {
            return null;
        }
        const nextPatch = typeof patch === 'function' ? patch(current) : patch;
        const nextSession = Object.assign(Object.assign(Object.assign({}, current), nextPatch), { updatedAt: new Date().toISOString() });
        return writeLocatorPickerSessionFileImmediate(sessionFilePath, nextSession);
    });
}
