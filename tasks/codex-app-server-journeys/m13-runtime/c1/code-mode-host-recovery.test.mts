import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
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
      const host = realpathSync('/bin/sleep')
      const scenarios = [
        { executable: '', expected: 'NATIVE_EXIT_NO_FORK' },
        { executable: '/usr/bin/true', expected: false },
        { executable: host, expected: 'OBSERVED_HOST_GONE' },
      ] as const
      for (const { executable, expected } of scenarios) {
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
          observer = observeNativeCodeModeHost(original.pid!, process.pid, host, addon)
          original.stdin!.end('start')
          assert.deepEqual(await exited, [0, null])
          assert.equal(await observer.verifyGone(Date.now() + 1000), expected)
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
