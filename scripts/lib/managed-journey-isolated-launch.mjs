import { execFile as execFileCallback } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { canonicalJson, sha256 } from './managed-journey-provider-qualification.mjs'

const execFile = promisify(execFileCallback)

export const REQUIRED_FIXTURE_MCP = 'appraise-quality-journey'
export const FIXTURE_TOOL_NAME = 'fixture_observe'
export const ISOLATED_ENV_ALLOWLIST = Object.freeze(['LANG', 'LC_ALL', 'PATH', 'TMPDIR'])
export const ISOLATION_MODES = Object.freeze(['healthy', 'absent', 'unhealthy', 'ambient'])

export function composeIsolatedLaunch({
  executable,
  fixtureScript,
  fixtureCommand = process.execPath,
  fixtureArgs,
  fixtureEnvironment = {},
  requiredMcpServer = REQUIRED_FIXTURE_MCP,
  enabledTools = [FIXTURE_TOOL_NAME],
  mode = 'healthy',
  parentEnv = process.env,
  root,
  launchNonce = randomUUID(),
} = {}) {
  if (!executable || !path.isAbsolute(executable)) throw new Error('An absolute provider executable is required.')
  if (!fixtureScript || !path.isAbsolute(fixtureScript)) throw new Error('An absolute MCP fixture path is required.')
  if (!ISOLATION_MODES.includes(mode)) throw new Error(`Unsupported isolation mode: ${mode}`)

  const launchRoot = root ?? mkdtempSync(path.join(tmpdir(), 'appraise-provider-isolated-'))
  const stateRoot = path.join(launchRoot, 'state')
  const workingDirectory = path.join(launchRoot, 'workspace')
  mkdirSync(stateRoot, { recursive: true, mode: 0o700 })
  mkdirSync(workingDirectory, { recursive: true, mode: 0o700 })

  const configPath = path.join(stateRoot, 'config.toml')
  const configText = fixtureConfig({
    enabledTools,
    fixtureArgs,
    fixtureCommand,
    fixtureEnvironment,
    fixtureScript,
    launchNonce,
    mode,
    requiredMcpServer,
  })
  writeFileSync(configPath, configText, { encoding: 'utf8', mode: 0o600 })

  const inheritedEnvironment = Object.fromEntries(
    ISOLATED_ENV_ALLOWLIST.filter(key => typeof parentEnv[key] === 'string').map(key => [key, parentEnv[key]]),
  )
  const environment = {
    ...inheritedEnvironment,
    APPRAISE_PHASE0_FIXTURE: '1',
    APPRAISE_PHASE0_LAUNCH_NONCE: launchNonce,
    CODEX_HOME: stateRoot,
    HOME: stateRoot,
  }
  const args = ['app-server', '--stdio', '--strict-config']
  const threadStartParams = {
    approvalPolicy: 'never',
    baseInstructions: 'Phase 0 account-free qualification fixture. Never start a model turn.',
    cwd: workingDirectory,
    developerInstructions: '',
    dynamicTools: [],
    ephemeral: true,
    sandbox: 'read-only',
  }
  const boundConfiguration = {
    args,
    configHash: sha256(configText),
    executable,
    inheritedEnvironment,
    launchNonce,
    mode,
    requiredMcpServer,
    enabledTools,
    fixtureEnvironment,
    stateRootHash: sha256(stateRoot),
    threadStartParams,
    workingDirectoryHash: sha256(workingDirectory),
  }

  return {
    args,
    configPath,
    configText,
    environment,
    executable,
    launchConfigurationDigest: sha256(canonicalJson(boundConfiguration)),
    launchNonce,
    launchRoot,
    mode,
    stateRoot,
    threadStartParams,
    workingDirectory,
  }
}

export function sanitizeLaunchComposition(composition) {
  return {
    allowedInheritedEnvironmentKeys: Object.keys(composition.environment).filter(key =>
      ISOLATED_ENV_ALLOWLIST.includes(key),
    ),
    childEnvironmentKeys: Object.keys(composition.environment).sort(),
    configurationSourceHash: sha256(composition.configPath),
    configurationHash: sha256(composition.configText),
    launchConfigurationDigest: composition.launchConfigurationDigest,
    launchNonceHash: sha256(composition.launchNonce),
    mode: composition.mode,
    stateRootHash: sha256(composition.stateRoot),
    workingDirectoryHash: sha256(composition.workingDirectory),
  }
}

export function sanitizeResolvedConfiguration(response) {
  const layers = Array.isArray(response?.layers) ? response.layers : []
  return {
    configDigest: sha256(canonicalJson(response?.config ?? null)),
    layerDigest: sha256(canonicalJson(layers)),
    layers: layers.map(layer => ({
      disabled: typeof layer?.disabledReason === 'string',
      source: sanitizeLayerSource(layer?.name),
      version: typeof layer?.version === 'string' ? layer.version : null,
    })),
    originDigest: sha256(canonicalJson(response?.origins ?? null)),
  }
}

export function normalizeMcpInventory(response) {
  return (Array.isArray(response?.data) ? response.data : []).map(server => ({
    health: server?.runtimeStatus === 'connected' ? 'healthy' : 'unhealthy',
    name: server?.name ?? null,
    status: server?.runtimeStatus === 'connected' ? 'ready' : (server?.runtimeStatus ?? 'unknown'),
    tools: Object.values(server?.tools ?? {})
      .map(tool => ({
        inputSchema: tool?.inputSchema ?? {},
        name: tool?.name ?? null,
        origin: `mcp:${server?.name ?? '<unknown>'}`,
        schemaHash: sha256(canonicalJson(tool?.inputSchema ?? {})),
      }))
      .sort((left, right) => String(left.name).localeCompare(String(right.name))),
  }))
}

export async function inspectProcessIdentity(pid, { run = execFile } = {}) {
  const { stdout } = await run('/bin/ps', ['-p', String(pid), '-o', 'pid=,ppid=,pgid=,lstart=,comm='])
  const line = stdout.trim()
  const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.{24})\s+(.+)$/)
  if (!match) throw new Error(`Unable to capture an OS process birth identity for PID ${pid}.`)
  return {
    birthMarker: match[4].trim(),
    command: match[5].trim(),
    pgid: Number(match[3]),
    pid: Number(match[1]),
    ppid: Number(match[2]),
  }
}

export async function inspectProcessGroup(pgid, { run = execFile } = {}) {
  const { stdout } = await run('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,lstart=,comm='])
  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(parseProcessIdentity)
    .filter(identity => identity?.pgid === pgid)
}

export async function terminateOwnedProcessGroup(
  child,
  expectedIdentity,
  { inspect = inspectProcessIdentity, inspectGroup = inspectProcessGroup } = {},
) {
  let observed
  try {
    observed = await inspect(child.pid)
  } catch {
    await settleExitedChild(child)
    const survivors = await inspectGroup(expectedIdentity.pgid)
    return {
      cleanupConfirmed: survivors.length === 0,
      processIdentity: expectedIdentity,
      survivingProcessCount: survivors.length,
    }
  }
  if (!sameProcessIdentity(expectedIdentity, observed) || observed.pgid !== expectedIdentity.pgid) {
    const survivors = await inspectGroup(expectedIdentity.pgid)
    if (survivors.length === 0) {
      await settleExitedChild(child)
      return {
        cleanupConfirmed: true,
        processIdentity: expectedIdentity,
        survivingProcessCount: 0,
      }
    }
    throw new Error('Provider cleanup refused because the OS process identity no longer matches the owned launch.')
  }

  try {
    process.kill(-expectedIdentity.pgid, 'SIGTERM')
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
  await waitForExit(child)
  const survivors = await inspectGroup(expectedIdentity.pgid)
  return {
    cleanupConfirmed: survivors.length === 0,
    processIdentity: expectedIdentity,
    survivingProcessCount: survivors.length,
  }
}

export function sameProcessIdentity(expected, observed) {
  return (
    expected?.pid === observed?.pid &&
    expected?.pgid === observed?.pgid &&
    expected?.birthMarker === observed?.birthMarker
  )
}

function fixtureConfig({
  enabledTools,
  fixtureArgs,
  fixtureCommand,
  fixtureEnvironment,
  fixtureScript,
  launchNonce,
  mode,
  requiredMcpServer,
}) {
  const blocks = ['[analytics]', 'enabled = false', '']
  if (mode !== 'absent') {
    blocks.push(
      mcpConfigBlock({
        enabledTools,
        fixtureArgs,
        fixtureCommand,
        fixtureEnvironment,
        fixtureMode: mode === 'unhealthy' ? 'unhealthy' : 'healthy',
        fixtureScript,
        launchNonce,
        name: requiredMcpServer,
      }),
    )
  }
  if (mode === 'ambient') {
    blocks.push(
      mcpConfigBlock({
        enabledTools: [FIXTURE_TOOL_NAME],
        fixtureCommand: process.execPath,
        fixtureEnvironment: {},
        fixtureMode: 'healthy',
        fixtureScript,
        launchNonce,
        name: 'ambient-fixture',
      }),
    )
  }
  return `${blocks.join('\n')}\n`
}

function mcpConfigBlock({
  enabledTools,
  fixtureArgs,
  fixtureCommand,
  fixtureEnvironment,
  fixtureMode,
  fixtureScript,
  launchNonce,
  name,
}) {
  const args = fixtureArgs ?? [fixtureScript, '--mode', fixtureMode]
  return [
    `[mcp_servers.${tomlString(name)}]`,
    `command = ${tomlString(fixtureCommand)}`,
    `args = [${args.map(tomlString).join(', ')}]`,
    'required = true',
    'startup_timeout_sec = 5',
    `enabled_tools = [${enabledTools.map(tomlString).join(', ')}]`,
    `env = { ${Object.entries({ APPRAISE_PHASE0_LAUNCH_NONCE: launchNonce, ...fixtureEnvironment })
      .map(([key, value]) => `${key} = ${tomlString(value)}`)
      .join(', ')} }`,
    '',
  ].join('\n')
}

function tomlString(value) {
  return JSON.stringify(value)
}

function sanitizeLayerSource(source) {
  if (!source || typeof source !== 'object') return { type: 'unknown' }
  const sanitized = { type: typeof source.type === 'string' ? source.type : 'unknown' }
  if (typeof source.file === 'string') sanitized.fileHash = sha256(source.file)
  if (typeof source.dotCodexFolder === 'string') sanitized.dotCodexFolderHash = sha256(source.dotCodexFolder)
  if (typeof source.profile === 'string') sanitized.profileHash = sha256(source.profile)
  return sanitized
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for the owned provider to exit.')), 5_000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function settleExitedChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise(resolve => setTimeout(resolve, 25))
  if (child.exitCode === null && child.signalCode === null) {
    throw new Error('Provider identity disappeared before an owned exit could be observed.')
  }
}

function parseProcessIdentity(line) {
  const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.{24})\s+(.+)$/)
  if (!match) return null
  return {
    birthMarker: match[4].trim(),
    command: match[5].trim(),
    pgid: Number(match[3]),
    pid: Number(match[1]),
    ppid: Number(match[2]),
  }
}
