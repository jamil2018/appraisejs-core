import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises';
import path from 'path';
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
export function getLocatorPickerSessionFilePath(sessionId, repoRoot = process.cwd()) {
    return path.join(getLocatorPickerSessionsDir(repoRoot), `${sessionId}.json`);
}
export async function ensureLocatorPickerDirectories(repoRoot = process.cwd()) {
    const rootDir = getLocatorPickerRootDir(repoRoot);
    await mkdir(getLocatorPickerSessionsDir(repoRoot), { recursive: true });
    await mkdir(getLocatorPickerProfilesDir(repoRoot), { recursive: true });
    process.env.TMPDIR = rootDir;
    process.env.TMP = rootDir;
    process.env.TEMP = rootDir;
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
export async function writeLocatorPickerSessionFile(sessionFilePath, session) {
    await mkdir(path.dirname(sessionFilePath), { recursive: true });
    const normalized = withTimestamp(session);
    const serialized = `${JSON.stringify(normalized, null, 2)}\n`;
    const tempFilePath = `${sessionFilePath}.${process.pid}.${Date.now()}.tmp`;
    try {
        await writeFile(tempFilePath, serialized, 'utf8');
        await rename(tempFilePath, sessionFilePath);
    }
    catch (error) {
        await unlink(tempFilePath).catch(() => undefined);
        const code = error instanceof Error && 'code' in error ? String(error.code) : '';
        if (process.platform === 'win32' || code === 'EPERM' || code === 'EACCES') {
            await writeFile(sessionFilePath, serialized, 'utf8');
        }
        else {
            throw error;
        }
    }
    return normalized;
}
export async function patchLocatorPickerSessionFile(sessionFilePath, patch) {
    const current = await readLocatorPickerSessionFile(sessionFilePath);
    if (!current) {
        return null;
    }
    const nextPatch = typeof patch === 'function' ? patch(current) : patch;
    const nextSession = Object.assign(Object.assign(Object.assign({}, current), nextPatch), { updatedAt: new Date().toISOString() });
    return writeLocatorPickerSessionFile(sessionFilePath, nextSession);
}
