#!/usr/bin/env tsx

import fs from 'node:fs'
import os from 'node:os'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

function isUsableDirectory(directory: string | undefined): directory is string {
  if (!directory) {
    return false
  }

  try {
    fs.mkdirSync(directory, { recursive: true })
    fs.accessSync(directory, fs.constants.R_OK | fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}

function getTempDirectory(): string | undefined {
  const envCandidates = [process.env.TMPDIR, process.env.TMP, process.env.TEMP]
  const fallbackCandidates =
    process.platform === 'win32' ? [os.tmpdir()] : ['/tmp', os.tmpdir(), '/var/tmp', '/usr/tmp']

  return [...envCandidates, ...fallbackCandidates].find(isUsableDirectory)
}

function main(): void {
  const tempDirectory = getTempDirectory()
  if (!tempDirectory) {
    console.error('Unable to find a writable temporary directory for Vitest.')
    process.exit(1)
  }

  const vitestEntry = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url))
  const env = {
    ...process.env,
    TMPDIR: tempDirectory,
    TMP: tempDirectory,
    TEMP: tempDirectory,
  }

  const result = spawnSync(process.execPath, [vitestEntry, 'run', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env,
  })

  if (result.error) {
    console.error(result.error)
    process.exit(1)
  }

  process.exit(result.status ?? 1)
}

main()
