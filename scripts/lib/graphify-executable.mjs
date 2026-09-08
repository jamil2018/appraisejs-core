import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export function resolveGraphifyExecutable(command = 'graphify') {
  const result = spawnSync('which', [command], { encoding: 'utf8', stdio: 'pipe', timeout: 10_000 })
  if (result.status === 0 && result.stdout.trim()) return result.stdout.trim()
  if (!process.env.HOME) return null
  const fallback = path.join(process.env.HOME, '.local', 'bin', command)
  return fs.existsSync(fallback) ? fallback : null
}
