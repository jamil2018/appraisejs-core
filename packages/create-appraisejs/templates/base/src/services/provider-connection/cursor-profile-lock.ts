import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { lstat, open } from 'node:fs/promises'
import path from 'node:path'
import { createInterface } from 'node:readline'

import { cursorProfileUnavailable } from './cursor-disk-image'

type CursorProfileLock = {
  assertHeld(): void
  release(): Promise<void>
}

export async function acquireCursorProfileLock(directory: string): Promise<CursorProfileLock> {
  const database = path.join(directory, 'profile-lock.db')
  try {
    await (await open(database, 'wx', 0o600)).close()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw cursorProfileUnavailable()
  }
  const info = await lstat(database)
  if (!info.isFile() || info.uid !== process.getuid?.() || info.nlink !== 1 || (info.mode & 0o077) !== 0) {
    throw cursorProfileUnavailable()
  }

  // SQLite releases the lock on EOF if Appraise exits. The transaction writes no profile data.
  const child = spawn('/usr/bin/sqlite3', ['-batch', '-bail', '-init', '/dev/null', database], {
    cwd: directory,
    env: { NODE_ENV: 'production', PATH: '/usr/bin:/bin', LC_ALL: 'C' },
    stdio: ['pipe', 'pipe', 'ignore'],
  })
  child.on('error', () => undefined)
  child.stdin.on('error', () => undefined)
  const finished = new Promise<number | null>(resolve => child.once('close', resolve))
  const lines = createInterface({ input: child.stdout })
  const line = once(lines, 'line', { signal: AbortSignal.timeout(7_000) })
  const release = async () => {
    child.stdin.end('ROLLBACK;\n')
    if ((await finished) !== 0) throw cursorProfileUnavailable()
  }
  const assertHeld = () => {
    if (child.exitCode !== null || child.signalCode !== null || child.killed) throw cursorProfileUnavailable()
  }
  try {
    child.stdin.write(".timeout 5000\nBEGIN IMMEDIATE;\nSELECT 'APPRAISE_CURSOR_LOCK_READY';\n")
    const result = await Promise.race([line, finished.then(() => [])])
    if (result[0] !== 'APPRAISE_CURSOR_LOCK_READY') throw cursorProfileUnavailable()
    assertHeld()
    return { assertHeld, release }
  } catch {
    child.kill('SIGKILL')
    await finished
    throw cursorProfileUnavailable()
  } finally {
    lines.close()
    child.stdout.resume()
  }
}
