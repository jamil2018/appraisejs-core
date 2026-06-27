#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const graphifyCommand = findCommand('graphify')

if (graphifyCommand) {
  const version = spawnSync(graphifyCommand, ['--version'], {
    encoding: 'utf8',
    stdio: 'pipe',
  })
  const output = version.stdout.trim() || version.stderr.trim() || 'Graphify installed'
  console.log(output)
  process.exit(0)
}

const uvCommand = findCommand('uv')

if (!uvCommand) {
  console.warn('Graphify CLI not found; install uv and run: uv tool install graphifyy')
  console.warn('Graphify setup is optional for app runtime, but agents use it for repo graph refreshes.')
  process.exit(0)
}

console.log('Installing Graphify CLI with uv...')
const install = spawnSync(uvCommand, ['tool', 'install', 'graphifyy'], {
  encoding: 'utf8',
  stdio: 'inherit',
})

if (install.status === 0) {
  console.log('Graphify setup complete.')
  process.exit(0)
}

console.warn('Graphify CLI install did not complete. Run manually when agent graph refreshes are needed:')
console.warn('uv tool install graphifyy')
process.exit(0)

function findCommand(command) {
  const fromPath = findCommandOnPath(command)
  if (fromPath) return fromPath

  return findCommandInUvToolBin(command)
}

function findCommandOnPath(command) {
  const result = spawnSync('which', [command], {
    encoding: 'utf8',
    stdio: 'pipe',
  })
  return result.status === 0 ? result.stdout.trim() : ''
}

function findCommandInUvToolBin(command) {
  const home = process.env.HOME
  if (!home) return null

  const commandPath = path.join(home, '.local', 'bin', command)
  return fs.existsSync(commandPath) ? commandPath : null
}
