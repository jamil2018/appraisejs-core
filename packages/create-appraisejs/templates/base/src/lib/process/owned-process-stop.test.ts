import { execFile, spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SpawnedProcess } from './task-spawner'
import {
  OwnedProcessStopError,
  registerOwnedProcessGroup,
  spawnOwnedProcessGroup,
  stopOwnedProcessGroup,
} from './owned-process-stop'

const supervisorPath = path.join(process.cwd(), 'scripts/owned-process-supervisor.mjs')
const execFileAsync = promisify(execFile)
const processes: SpawnedProcess[] = []
const files: string[] = []
const directories: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  await Promise.allSettled(processes.splice(0).map(spawned => stopOwnedProcessGroup(spawned)))
  await Promise.all(files.splice(0).map(file => fs.rm(file, { force: true })))
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function launch(
  source: string,
  args: string[] = [],
  env: Record<string, string> = {},
  requireRuntimeBrowserClose = false,
) {
  const spawned = await spawnOwnedProcessGroup(process.execPath, ['-e', source, ...args], {
    supervisorPath,
    cwd: os.tmpdir(),
    env,
    requireRuntimeBrowserClose,
    streamLogs: false,
    captureOutput: true,
  })
  processes.push(spawned)
  return spawned
}

async function waitForNaturalExit(spawned: SpawnedProcess) {
  for (let attempt = 0; attempt < 200 && spawned.isRunning; attempt++) await delay(20)
  if (spawned.isRunning) throw new Error('Owned supervisor never exited naturally.')
}

async function waitForFile(file: string): Promise<number> {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      return Number(await fs.readFile(file, 'utf8'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      await delay(20)
    }
  }
  throw new Error('Owned child never created its descendant.')
}

async function processRows(): Promise<
  Array<{ pid: number; ppid: number; pgid: number; state: string; command: string }>
> {
  const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,ppid=,pgid=,stat=,command='])
  return Array.from(
    stdout.matchAll(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/gm),
    ([, pid, ppid, pgid, state, command]) => ({
      pid: Number(pid),
      ppid: Number(ppid),
      pgid: Number(pgid),
      state,
      command,
    }),
  )
}

async function chromiumDescendants(supervisorPid: number) {
  const rows = await processRows()
  const descendants = new Set([supervisorPid])
  let changed: boolean
  do {
    changed = false
    for (const row of rows) {
      if (descendants.has(row.ppid) && !descendants.has(row.pid)) {
        descendants.add(row.pid)
        changed = true
      }
    }
  } while (changed)
  return rows.filter(row => descendants.has(row.pid) && /chrom(e|ium)|headless_shell/i.test(row.command))
}

describe.skipIf(process.platform === 'win32')('owned capsule process-group supervisor', () => {
  it('preserves the exact child argv, cwd, environment, output and exit code', async () => {
    const spawned = await launch(
      'console.log(JSON.stringify({argv:process.argv.slice(1),cwd:process.cwd(),env:process.env}));console.error("err");process.exit(7)',
      ['literal one', 'two'],
      { EXACT_ONLY: 'sealed' },
    )
    await waitForNaturalExit(spawned)
    const observed = await stopOwnedProcessGroup(spawned)
    expect(observed).toMatchObject({ kind: 'group_exit_observed', groupId: spawned.pid })
    expect(spawned.exitCode).toBe(7)
    const reported = JSON.parse(spawned.output.stdout.join('')) as {
      argv: string[]
      cwd: string
      env: Record<string, string>
    }
    expect(reported.argv).toEqual(['literal one', 'two'])
    expect(reported.cwd).toBe(await fs.realpath(os.tmpdir()))
    expect(reported.env.EXACT_ONLY).toBe('sealed')
    expect(Object.keys(reported.env).filter(key => key !== '__CF_USER_TEXT_ENCODING')).toEqual(['EXACT_ONLY'])
    expect(spawned.output.stderr.join('')).toBe('err\n')
  })

  it('drains a TERM-ignoring descendant after its leader exits first', async () => {
    const file = path.join(os.tmpdir(), `appraise-owned-stop-${process.pid}-${Date.now()}`)
    const readyFile = `${file}.ready`
    files.push(file, readyFile)
    const spawned = await launch(
      `const {spawn}=require('node:child_process');const fs=require('node:fs');const leaf=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});require("node:fs").writeFileSync(process.argv[1],"1");setInterval(()=>{},1000)',process.argv[2]],{stdio:['ignore','inherit','inherit',3]});leaf.unref();fs.writeFileSync(process.argv[1],String(leaf.pid));const timer=setInterval(()=>{if(fs.existsSync(process.argv[2])){clearInterval(timer);process.exit(0)}},10)`,
      [file, readyFile],
      { PATH: process.env.PATH ?? '' },
    )
    expect(await waitForFile(file)).toBeGreaterThan(1)
    expect(await waitForFile(readyFile)).toBe(1)
    await waitForNaturalExit(spawned)
    expect(await stopOwnedProcessGroup(spawned, { termWaitMs: 60 })).toMatchObject({
      kind: 'group_exit_observed',
      groupId: spawned.pid,
    })
    expect(spawned.process.signalCode).toBe('SIGKILL')
  })

  it('coalesces concurrent and delayed stop calls without retaining signaling authority', async () => {
    const spawned = await launch('process.on("SIGTERM",()=>{});console.log("ready");setInterval(()=>{},1000)')
    for (let attempt = 0; attempt < 100 && !spawned.output.stdout.join('').includes('ready'); attempt++) await delay(20)
    expect(spawned.output.stdout.join('')).toContain('ready')
    const kill = vi.spyOn(process, 'kill')
    const first = stopOwnedProcessGroup(spawned, { termWaitMs: 60 })
    expect(stopOwnedProcessGroup(spawned)).toBe(first)
    const observed = await first
    expect(await stopOwnedProcessGroup(spawned)).toBe(observed)
    expect(kill).not.toHaveBeenCalled()
    expect(spawned.process.signalCode).toBe('SIGKILL')
  })

  it('requires a managed browser-close acknowledgement before claiming owned cleanup', async () => {
    const closed = await launch(
      'require("node:fs").writeSync(3,"appraise.browser.launch-intent.v1\\nappraise.browser.closed.v1\\n");process.exit(0)',
      [],
      {},
      true,
    )
    await waitForNaturalExit(closed)
    await expect(stopOwnedProcessGroup(closed)).resolves.toMatchObject({ kind: 'group_exit_observed' })

    const unclosed = await launch(
      'require("node:fs").writeSync(3,"appraise.browser.launch-intent.v1\\n");process.exit(0)',
      [],
      {},
      true,
    )
    await waitForNaturalExit(unclosed)
    await expect(stopOwnedProcessGroup(unclosed)).rejects.toMatchObject({ kind: 'exit_unverified' })
  })

  it('observes a managed SIGTERM close only after the child acknowledges browser closure', async () => {
    const spawned = await launch(
      'const fs=require("node:fs");fs.writeSync(3,"appraise.browser.launch-intent.v1\\n");process.on("SIGTERM",()=>{fs.writeSync(3,"appraise.browser.closed.v1\\n");process.exit(143)});console.log("ready");setInterval(()=>{},1000)',
      [],
      {},
      true,
    )
    for (let attempt = 0; attempt < 100 && !spawned.output.stdout.join('').includes('ready'); attempt++) await delay(20)
    expect(spawned.output.stdout.join('')).toContain('ready')
    await expect(stopOwnedProcessGroup(spawned)).resolves.toMatchObject({
      runtimeBrowserCleanup: 'CLOSE_ACKNOWLEDGED',
    })
  })

  it.skipIf(process.env.APPRAISE_REAL_BROWSER_PROBE !== '1')(
    'closes a real anonymous Chromium through the canonical Cucumber hooks on managed SIGTERM',
    async () => {
      const directory = await fs.mkdtemp(path.join(process.cwd(), '.appraisejs/c31-real-browser-'))
      directories.push(directory)
      const feature = path.join(directory, 'anonymous.feature')
      const steps = path.join(directory, 'steps.mjs')
      const config = path.join(directory, 'cucumber.mjs')
      await fs.writeFile(
        feature,
        'Feature: managed browser cleanup\n  Scenario: hold\n    Given a managed browser is ready\n',
      )
      await fs.writeFile(
        steps,
        `import { Given } from '@cucumber/cucumber'
Given('a managed browser is ready', async function () {
  process.stdout.write('real-browser-ready\\n')
  await new Promise(() => {})
})
`,
      )
      await fs.writeFile(config, 'export default {}\n')
      const spawned = await spawnOwnedProcessGroup(
        process.execPath,
        [
          path.join(process.cwd(), 'node_modules/@cucumber/cucumber/bin/cucumber-js'),
          '--config',
          path.relative(process.cwd(), config),
          '--import',
          path.join(process.cwd(), 'packages/cucumber-runtime/dist/world.js'),
          '--import',
          path.join(process.cwd(), 'packages/cucumber-runtime/dist/hooks.js'),
          '--import',
          steps,
          '--format',
          'progress',
          feature,
        ],
        {
          supervisorPath,
          cwd: process.cwd(),
          env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', HEADLESS: 'true' },
          requireRuntimeBrowserClose: true,
          streamLogs: false,
          captureOutput: true,
        },
      )
      processes.push(spawned)
      for (
        let attempt = 0;
        attempt < 200 && spawned.isRunning && !spawned.output.stdout.join('').includes('real-browser-ready');
        attempt++
      )
        await delay(50)
      if (!spawned.output.stdout.join('').includes('real-browser-ready'))
        throw new Error(
          `Real browser scenario did not become ready (exit=${spawned.exitCode}): ${spawned.output.stderr.join('')} ${spawned.output.stdout.join('')}`,
        )
      const browserRows = await chromiumDescendants(spawned.pid!)
      expect(browserRows.length).toBeGreaterThan(0)
      await expect(stopOwnedProcessGroup(spawned)).resolves.toMatchObject({
        runtimeBrowserCleanup: 'CLOSE_ACKNOWLEDGED',
      })
      const after = await processRows()
      expect(
        after.filter(row =>
          browserRows.some(
            before => row.pid === before.pid && row.command === before.command && !row.state.startsWith('Z'),
          ),
        ),
      ).toEqual([])
    },
    30_000,
  )

  it('rejects raw registration and lost IPC without signaling a stored numeric PGID', async () => {
    const raw = spawn(process.execPath, ['-e', 'process.exit(0)'], { detached: true, stdio: 'ignore' })
    const record = { process: raw, pid: raw.pid } as SpawnedProcess
    expect(() => registerOwnedProcessGroup(record)).toThrowError(OwnedProcessStopError)
    await expect(stopOwnedProcessGroup(record)).rejects.toMatchObject({ kind: 'ownership_unavailable' })

    const spawned = await launch('process.on("SIGTERM",()=>{});setInterval(()=>{},1000)')
    spawned.process.disconnect()
    const kill = vi.spyOn(process, 'kill')
    await expect(stopOwnedProcessGroup(spawned)).rejects.toMatchObject({ kind: 'ownership_unavailable' })
    expect(kill).not.toHaveBeenCalled()
    for (let attempt = 0; attempt < 150 && spawned.isRunning; attempt++) await delay(20)
    expect(spawned.isRunning).toBe(false)
    expect((await processRows()).filter(row => row.pgid === spawned.pid && !row.state.startsWith('Z'))).toEqual([])
  })
})
