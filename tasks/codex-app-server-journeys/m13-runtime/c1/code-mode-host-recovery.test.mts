import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { observeNativeCodeModeHost } from '../../../../src/lib/quality-journey/codex-app-server/native-code-mode-host'

test(
  'macOS verifies an early original exit only when the event watch proves no direct fork',
  {
    skip: process.platform !== 'darwin',
  },
  async () => {
    const root = mkdtempSync(path.join(realpathSync(tmpdir()), 'm13-code-mode-inert-'))
    const addon = path.join(root, 'observer.node')
    try {
      execFileSync('/usr/bin/clang++', [
        '-std=c++17',
        '-Wall',
        '-Wextra',
        '-Werror',
        '-shared',
        '-undefined',
        'dynamic_lookup',
        '-I',
        path.resolve(process.execPath, '../../include/node'),
        '-DNODE_GYP_MODULE_NAME=mac_owned_host',
        'scripts/tests/fixtures/codex-app-server-m02-ta-owned-host-observer/mac-owned-host.cc',
        '-o',
        addon,
      ])
      const intermittent = path.join(root, 'intermittent-sample.cjs')
      writeFileSync(
        intermittent,
        `const metadata = require(${JSON.stringify(addon)})
let samples = 0
module.exports = {
  identity: metadata.identity,
  directChildMetadata: metadata.directChildMetadata,
  watchDirectForks: metadata.watchDirectForks,
  listDirectChildren(pid) {
    if (++samples === 2) throw new Error('synthetic sampling failure after watch registration')
    return metadata.listDirectChildren(pid)
  },
}`,
      )
      const host = realpathSync('/bin/sleep')
      const scenarios = [
        { executable: '', observerPath: addon, expected: 'NATIVE_EXIT_NO_FORK' },
        { executable: '', observerPath: intermittent, expected: 'NATIVE_EXIT_NO_FORK' },
        { executable: '/usr/bin/true', observerPath: addon, expected: 'CODE_MODE_FORK_OBSERVED' },
        { executable: '/usr/bin/true', observerPath: intermittent, expected: 'CODE_MODE_FORK_OBSERVED' },
        { executable: host, observerPath: addon, expected: 'OBSERVED_HOST_GONE' },
      ] as const
      for (const { executable, observerPath, expected } of scenarios) {
        const original = spawn(
          process.execPath,
          [
            '-e',
            `process.stdin.once('data', () => {
          if (!process.argv[1]) process.exit(0)
          const { spawn } = require('node:child_process')
          const args = process.argv[2] === 'host' ? ['1'] : []
          const child = spawn(process.argv[1], args, { detached: true, stdio: 'ignore' })
          child.once('close', (code, signal) => process.exit(code === 0 && signal === null ? 0 : 1))
        })`,
            executable,
            executable === host ? 'host' : 'ordinary',
          ],
          { stdio: ['pipe', 'ignore', 'ignore'] },
        )
        const exited = once(original, 'exit')
        await once(original, 'spawn')
        let observer: ReturnType<typeof observeNativeCodeModeHost> | undefined
        try {
          observer = observeNativeCodeModeHost(original.pid!, process.pid, host, observerPath)
          original.stdin!.end('start')
          assert.deepEqual(await exited, [0, null])
          assert.equal(await observer.verifyGone(Date.now() + 1000), expected)
        } finally {
          observer?.close()
          if (!original.stdin!.writableEnded) original.stdin!.end()
          await exited
        }
      }

      // An unrelated child may already exist before the first consuming request. A fork
      // after arming must still defeat a negative Code Mode witness.
      const metadata = createRequire(import.meta.url)(addon) as { listDirectChildren(pid: number): number[] }
      for (const forkAfterArm of [false, true]) {
        const original = spawn(
          process.execPath,
          [
            '-e',
            `const { spawn } = require('node:child_process')
            process.stdin.once('data', () => {
              const other = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 1200)'], { stdio: 'ignore' })
              process.stdin.once('data', () => {
                if (process.argv[1] === 'fork') spawn('/usr/bin/true', { stdio: 'ignore' })
              })
              other.once('spawn', () => process.stdout.write('ready'))
            })`,
            forkAfterArm ? 'fork' : 'quiet',
          ],
          { stdio: ['pipe', 'pipe', 'ignore'] },
        )
        const exited = once(original, 'exit')
        await once(original, 'spawn')
        let observer: ReturnType<typeof observeNativeCodeModeHost> | undefined
        try {
          observer = observeNativeCodeModeHost(original.pid!, process.pid, host, addon)
          const ready = once(original.stdout!, 'data')
          original.stdin!.write('bootstrap')
          await ready
          assert.equal(metadata.listDirectChildren(original.pid!).length, 1)
          observer.armBeforeFirstTurn()
          original.stdin!.end('turn')
          assert.deepEqual(await exited, [0, null])
          assert.equal(
            await observer.verifyGone(Date.now() + 1000),
            forkAfterArm ? 'CODE_MODE_FORK_OBSERVED' : 'NATIVE_EXIT_NO_FORK_AFTER_STARTUP',
          )
        } finally {
          observer?.close()
          if (!original.stdin!.writableEnded) original.stdin!.end()
          await exited
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  },
)
