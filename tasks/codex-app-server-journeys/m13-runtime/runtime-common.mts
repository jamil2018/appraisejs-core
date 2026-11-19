import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnOwnedProcessGroup, stopOwnedProcessGroup } from '../../../src/lib/process/owned-process-stop.ts'
import type { SpawnedProcess } from '../../../src/lib/process/task-spawner.ts'

export const runtimeCommonPath = fileURLToPath(import.meta.url)
export const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')
export type FrozenInput = { path: string; sha256: string }
export type SafeEvent = { category: string; [key: string]: unknown }
export type RecordEvent = (event: SafeEvent) => void
type Check = (condition: unknown, category: string) => asserts condition
export function verifyFrozenInputs(inputs: FrozenInput[], required: string[], check: Check, exactShape: boolean) {
  check(
    (!exactShape || Array.isArray(inputs)) &&
      inputs?.length === required.length &&
      new Set(inputs.map(input => input.path)).size === required.length,
    'input_inventory_refused',
  )
  for (const path of required) {
    const input = inputs.find(item => item.path === path)
    check(
      input &&
        (!exactShape || Object.keys(input).sort().join(',') === 'path,sha256') &&
        /^[a-f0-9]{64}$/.test(input.sha256) &&
        sha256(path) === input.sha256,
      'source_hash_mismatch',
    )
  }
}

/** Exclusive reservation is the allocation boundary, including a partially written reservation. */
export function reserveCampaign(manifest: { campaignId: string; freshRoot: string }, manifestSha256: string) {
  mkdirSync(manifest.freshRoot, { mode: 0o700 })
  writeFileSync(
    join(manifest.freshRoot, 'reservation.json'),
    JSON.stringify({ campaignId: manifest.campaignId, manifestSha256, state: 'SPENT_ON_RESERVATION' }),
    { flag: 'wx', mode: 0o600 },
  )
  return (event: SafeEvent) =>
    appendFileSync(
      join(manifest.freshRoot, 'events.jsonl'),
      `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`,
      { mode: 0o600 },
    )
}
type ClosedPaths = { root: string; home: string; codexHome: string; tmp: string; cwd: string }
export function writeClosedConfig(paths: ClosedPaths, config: string, rootAlreadyReserved = false) {
  if (!rootAlreadyReserved) mkdirSync(paths.root, { mode: 0o700 })
  for (const directory of [paths.home, paths.codexHome, paths.tmp, paths.cwd]) mkdirSync(directory, { mode: 0o700 })
  writeFileSync(join(paths.codexHome, 'config.toml'), config, { flag: 'wx', mode: 0o600 })
}
export function closedEnvironment(paths: ClosedPaths): Record<string, string> {
  return {
    PATH: '/usr/bin:/bin',
    HOME: paths.home,
    CODEX_HOME: paths.codexHome,
    TMPDIR: paths.tmp,
    TMP: paths.tmp,
    TEMP: paths.tmp,
    XDG_CONFIG_HOME: join(paths.home, '.config'),
    LANG: 'C',
    LC_ALL: 'C',
  }
}
export function writeLaunchSpent(root: string, manifestSha256: string) {
  writeFileSync(join(root, 'launch-spent.json'), JSON.stringify({ manifestSha256, nativeLaunches: 1 }), {
    flag: 'wx',
    mode: 0o600,
  })
}

export type OwnedEffects = { acquire: typeof spawnOwnedProcessGroup; stop: typeof stopOwnedProcessGroup }
const ownedEffects: OwnedEffects = { acquire: spawnOwnedProcessGroup, stop: stopOwnedProcessGroup }
/** Cleanup and disconnect can only use the original acquired object, never a rediscovered PID. */
export class OwnedAcquisition {
  original: SpawnedProcess | undefined
  attempted = false
  constructor(private readonly effects: OwnedEffects = ownedEffects) {}
  async acquire(...args: Parameters<typeof spawnOwnedProcessGroup>) {
    this.attempted = true
    this.original = await this.effects.acquire(...args)
    return this.original
  }
  async stop() {
    if (!this.original) throw new Error('ownership_unavailable')
    return this.effects.stop(this.original, { termWaitMs: 1_500, killWaitMs: 2_000 })
  }
  disconnect() {
    if (this.original?.process.connected) this.original.process.disconnect()
  }
}
/** Each bounded phase owns and cancels its timer even if work rejects synchronously. */
export async function withDeadline<T>(milliseconds: number, expire: () => void, work: () => Promise<T>) {
  const timer = setTimeout(expire, milliseconds)
  try {
    return await work()
  } finally {
    clearTimeout(timer)
  }
}

/** Shared entry guard; calling this from an import cannot acquire a process or reserve a root. */
export function manifestCli<T>(
  sourcePath: string,
  run: (path: string, hash: string) => Promise<T>,
  passed: (result: T) => boolean,
) {
  if (!process.argv[1] || resolve(process.argv[1]) !== sourcePath) return
  const [, , manifestFlag, manifestPath, hashFlag, manifestSha256, ...extra] = process.argv
  if (manifestFlag !== '--manifest' || hashFlag !== '--sha256' || !manifestPath || !manifestSha256 || extra.length) {
    process.exitCode = 2
    return
  }
  void run(manifestPath, manifestSha256)
    .then(result => {
      process.exitCode = passed(result) ? 0 : 1
    })
    .catch(() => {
      process.exitCode = 1
    })
}

/** Ordered one-shot campaign cases; a refused/unknown result never releases the next case. */
export async function runUntilRefused<T, R extends { disposition: string }>(
  cases: readonly T[],
  execute: (item: T) => Promise<R>,
  record: (result: R) => void,
) {
  const results: R[] = []
  for (const item of cases) {
    const result = await execute(item)
    results.push(result)
    record(result)
    if (result.disposition !== 'PASS') break
  }
  return results
}

export function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
export function hasValue(value: unknown): boolean {
  if (value == null || value === false || value === '') return false
  if (Array.isArray(value)) return value.length !== 0
  if (object(value)) return Object.keys(value).length !== 0
  return true
}
export function verifyFreshRoot(root: string, phase: string, check: Check) {
  check(
    isAbsolute(root) &&
      dirname(root) === '/private/tmp' &&
      new RegExp(`^m13-${phase}-[a-zA-Z0-9_-]+$`).test(basename(root)) &&
      resolve(root) === root,
    'fresh_root_refused',
  )
}
