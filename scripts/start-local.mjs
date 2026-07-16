#!/usr/bin/env node

import { spawn } from 'node:child_process'
import path from 'node:path'

import { resolveLocalNextArgs } from './lib/local-startup.mjs'

const [mode = '', ...args] = process.argv.slice(2)
const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next')

try {
  const child = spawn(process.execPath, [nextBin, ...resolveLocalNextArgs(mode, args)], {
    cwd: process.cwd(),
    env: { ...process.env, ENVIRONMENT: process.env.ENVIRONMENT ?? 'local' },
    stdio: 'inherit',
  })
  const forward = signal => child.kill(signal)
  process.once('SIGINT', forward)
  process.once('SIGTERM', forward)
  child.once('error', error => {
    console.error(error.message)
    process.exitCode = 1
  })
  child.once('exit', (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0)
  })
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
