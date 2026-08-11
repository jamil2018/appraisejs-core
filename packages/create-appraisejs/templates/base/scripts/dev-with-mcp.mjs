#!/usr/bin/env node

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { ensureDevDatabaseReady } from './lib/dev-startup.mjs'
import { ensureBuiltInStepDefinitionReadiness } from './lib/built-in-readiness.mjs'

const isWindows = process.platform === 'win32'
const npmCommand = isWindows ? 'npm.cmd' : 'npm'
const appraisejsCommand = isWindows ? 'appraisejs.cmd' : 'appraisejs'
const mcpHost = process.env.APPRAISE_MCP_HOST ?? '127.0.0.1'
const mcpPort = process.env.APPRAISE_MCP_PORT ?? '3010'
const mcpPath = process.env.APPRAISE_MCP_PATH ?? '/mcp'
const mode = process.argv[2] === '--mcp-only' ? '--mcp-only' : 'all'
const webArgs = mode === '--mcp-only' ? [] : process.argv.slice(2)
const baseUrl = process.env.APPRAISE_MCP_BASE_URL ?? inferredBaseUrl(webArgs)

const children = new Map()
let shuttingDown = false

function startProcess(name, command, args) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })

  children.set(name, child)

  child.on('exit', (code, signal) => handleProcessExit(name, code, signal))
  child.on('error', error => handleProcessError(name, error))
}

function handleProcessExit(name, code, signal) {
  children.delete(name)
  if (shuttingDown) return

  handleProcessStop({
    message: `[dev] ${name} exited with ${exitLabel(code, signal)}; stopping remaining dev processes.`,
    exitCode: exitCode(code, signal),
  })
}

function exitLabel(code, signal) {
  if (signal) return `${signal}`
  return `code ${code ?? 0}`
}

function exitCode(code, signal) {
  if (code !== null && code !== undefined) return code
  return signal ? 1 : 0
}

function handleProcessError(name, error) {
  children.delete(name)
  if (shuttingDown) return

  handleProcessStop({
    message: `[dev] failed to start ${name}: ${error.message}`,
    exitCode: 1,
  })
}

function handleProcessStop({ message, exitCode }) {
  shuttingDown = true
  console.error(message)
  stopChildren()
  process.exitCode = exitCode
}

function stopChildren() {
  for (const child of children.values()) {
    if (!child.killed) child.kill('SIGTERM')
  }
}

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  stopChildren()
}

function optionValue(args, shortName, longName, fallback) {
  for (let index = 0; index < args.length; index += 1) {
    const value = optionTokenValue(args, index, shortName, longName)
    if (value !== undefined) return value
  }
  return fallback
}

function optionTokenValue(args, index, shortName, longName) {
  const value = args[index]
  if (value === shortName || value === longName) return args[index + 1]
  return valueForLongOption(value, longName)
}

function valueForLongOption(value, longName) {
  const prefix = `${longName}=`
  return value.startsWith(prefix) ? value.slice(prefix.length) : undefined
}

function inferredBaseUrl(args) {
  const host = optionValue(args, '-H', '--hostname', '127.0.0.1')
  const port = optionValue(args, '-p', '--port', '3000')
  return `http://${host}:${port}`
}

function mcpCommand() {
  const localCli = path.join(process.cwd(), 'packages', 'appraisejs', 'src', 'cli.ts')
  if (fs.existsSync(localCli)) {
    return {
      command: npmCommand,
      args: [
        '--prefix',
        'packages/appraisejs',
        'exec',
        '--',
        'tsx',
        localCli,
        'mcp-http',
        '--cwd',
        process.cwd(),
        '--base-url',
        baseUrl,
        '--host',
        mcpHost,
        '--port',
        mcpPort,
        '--path',
        mcpPath,
      ],
    }
  }

  return {
    command: appraisejsCommand,
    args: [
      'mcp-http',
      '--cwd',
      process.cwd(),
      '--base-url',
      baseUrl,
      '--host',
      mcpHost,
      '--port',
      mcpPort,
      '--path',
      mcpPath,
    ],
  }
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

const mcp = mcpCommand()

ensureDevDatabaseReady(npmCommand)
ensureBuiltInStepDefinitionReadiness(npmCommand)

if (mode === '--mcp-only') {
  startProcess('mcp', mcp.command, mcp.args)
} else {
  startProcess('web', npmCommand, ['run', 'dev:web', '--', ...webArgs])
  startProcess('mcp', mcp.command, mcp.args)
}
