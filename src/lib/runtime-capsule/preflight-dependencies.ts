import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { execa } from 'execa'
import { assertRuntimeCapsulePathContained } from './storage'

export type PreflightProcessResult = { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }

export type CapsulePreflightDependencies = {
  runProcess(input: {
    executable: string
    argv: string[]
    cwd: string
    env: Record<string, string>
    timeoutMs: number
    maxOutputBytes: number
  }): Promise<PreflightProcessResult>
  probeOutput(root: string, relativePath: string): Promise<void>
  prepareOutput(root: string, relativePath: string): Promise<void>
  now(): Date
}

export const defaultCapsulePreflightDependencies: CapsulePreflightDependencies = {
  async runProcess(input) {
    try {
      const result = await execa(input.executable, input.argv, {
        cwd: input.cwd,
        env: input.env,
        timeout: input.timeoutMs,
        maxBuffer: input.maxOutputBytes,
        reject: false,
        extendEnv: false,
      })
      return {
        exitCode: result.exitCode ?? null,
        stdout: result.stdout,
        stderr: result.stderr,
        timedOut: result.timedOut,
      }
    } catch (error) {
      if ((error as { timedOut?: boolean }).timedOut) return { exitCode: null, stdout: '', stderr: '', timedOut: true }
      throw error
    }
  },
  async probeOutput(root, relativePath) {
    const destination = path.resolve(root, ...relativePath.split('/'))
    assertRuntimeCapsulePathContained(root, destination)
    const directory = path.dirname(destination)
    await fs.mkdir(directory, { recursive: true, mode: 0o700 })
    const realRoot = await fs.realpath(root)
    const realDirectory = await fs.realpath(directory)
    assertRuntimeCapsulePathContained(realRoot, realDirectory)
    const probe = path.join(directory, `.appraise-write-probe-${randomUUID()}`)
    const handle = await fs.open(probe, 'wx', 0o600)
    try {
      await handle.writeFile('probe')
      await handle.sync()
    } finally {
      await handle.close()
      await fs.unlink(probe).catch(() => undefined)
    }
  },
  async prepareOutput(root, relativePath) {
    const destination = path.resolve(root, ...relativePath.split('/'))
    assertRuntimeCapsulePathContained(root, destination)
    const directory = path.dirname(destination)
    const parts = path.relative(root, directory).split(path.sep).filter(Boolean)
    let current = root
    for (const part of parts) {
      current = path.join(current, part)
      const stat = await fs.lstat(current)
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Output ancestor must not be a symlink.')
    }
    const realRoot = await fs.realpath(root)
    const realDirectory = await fs.realpath(directory)
    assertRuntimeCapsulePathContained(realRoot, realDirectory)
    const finalPath = path.join(realDirectory, path.basename(destination))
    const existing = await fs.lstat(finalPath).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    })
    if (existing?.isSymbolicLink()) throw new Error('Preflight output must not be a symlink.')
    if (existing && !existing.isFile()) throw new Error('Preflight output must be a regular file.')
    if (existing) await fs.unlink(finalPath)
  },
  now: () => new Date(),
}
