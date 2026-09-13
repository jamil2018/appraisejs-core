import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json') as { version: string }

export const APPRAISE_PLUGIN_NAME = 'appraise-quality-journey'
export const APPRAISE_MARKETPLACE_NAME = 'appraise-local'
export const APPRAISE_PLUGIN_VERSION = `${packageJson.version}+codex.c11-20260913`

export type HostCommandResult = { status: number | null; stdout: string; stderr: string; error?: Error }
export type HostCommand = (args: string[]) => HostCommandResult
type CompatibilityCheck = {
  id: string
  status: 'ok' | 'warning' | 'error' | 'unknown'
  message: string
  recovery?: string
  details?: Record<string, unknown>
}

export const CODEX_PLUGIN_ID = `${APPRAISE_PLUGIN_NAME}@${APPRAISE_MARKETPLACE_NAME}`
export const CODEX_PLUGIN_LIST_ARGS = ['plugin', 'list', '--marketplace', APPRAISE_MARKETPLACE_NAME, '--json']
export const CODEX_MARKETPLACE_LIST_ARGS = ['plugin', 'marketplace', 'list', '--json']
export const CODEX_MCP_GET_ARGS = ['mcp', 'get', 'appraisejs', '--json']

const runCodex: HostCommand = args => {
  const result = spawnSync('codex', args, { encoding: 'utf8' })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    ...(result.error ? { error: result.error } : {}),
  }
}

function parseJson(result: HostCommandResult): unknown {
  if (result.status !== 0) return undefined
  try {
    return JSON.parse(result.stdout)
  } catch {
    return undefined
  }
}

type PluginEntry = { name?: string; version?: string; enabled?: boolean; marketplaceName?: string }
type MarketplaceEntry = { name?: string; root?: string }

function pluginInventory(result: HostCommandResult): PluginEntry[] | undefined {
  const value = parseJson(result)
  const installed = value && typeof value === 'object' ? (value as { installed?: unknown }).installed : undefined
  if (
    !Array.isArray(installed) ||
    !installed.every(
      item =>
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        typeof (item as PluginEntry).name === 'string' &&
        typeof (item as PluginEntry).marketplaceName === 'string' &&
        typeof (item as PluginEntry).version === 'string' &&
        typeof (item as PluginEntry).enabled === 'boolean',
    )
  )
    return
  return installed as PluginEntry[]
}

function marketplaceInventory(result: HostCommandResult): MarketplaceEntry[] | undefined {
  const value = parseJson(result)
  const marketplaces =
    value && typeof value === 'object' ? (value as { marketplaces?: unknown }).marketplaces : undefined
  if (
    !Array.isArray(marketplaces) ||
    !marketplaces.every(
      item =>
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        typeof (item as MarketplaceEntry).name === 'string' &&
        typeof (item as MarketplaceEntry).root === 'string',
    )
  )
    return
  return marketplaces as MarketplaceEntry[]
}

function mcpRegistration(result: HostCommandResult) {
  const value = parseJson(result)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const registration = value as { enabled?: unknown; transport?: unknown }
  if (
    typeof registration.enabled !== 'boolean' ||
    !registration.transport ||
    typeof registration.transport !== 'object'
  )
    return
  const transport = registration.transport as { type?: unknown; command?: unknown; url?: unknown }
  const valid =
    (transport.type === 'stdio' && typeof transport.command === 'string' && transport.command.length > 0) ||
    (transport.type === 'http' && typeof transport.url === 'string' && transport.url.length > 0)
  return valid ? { enabled: registration.enabled, transport: { type: transport.type } } : undefined
}

function failureCheck(id: string, label: string, result: HostCommandResult, recovery: string): CompatibilityCheck {
  if (result.status === 0) {
    return {
      id,
      status: 'unknown',
      message: `${label} returned output that this AppraiseJS version cannot parse.`,
      recovery,
      details: { category: 'unparseable_output' },
    }
  }
  const message = result.error?.message || result.stderr.trim() || `${label} could not be inspected.`
  const permissionFailure = /permission|operation not permitted|access denied/i.test(message)
  return {
    id,
    status: 'error',
    message: `${label} inspection failed: ${message}`,
    recovery,
    details: { category: permissionFailure ? 'permission_failure' : 'connection_failure' },
  }
}

export function appraisePluginMarketplaceRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'codex-marketplace')
}

export function inspectCodexCompatibility(command: HostCommand = runCodex) {
  const checks: CompatibilityCheck[] = []
  const pluginResult = command(CODEX_PLUGIN_LIST_ARGS)
  const plugins = pluginInventory(pluginResult)
  if (!plugins) {
    checks.push(
      failureCheck(
        'plugin_inventory',
        'Codex plugin inventory',
        pluginResult,
        'Use the documented manual registered-MCP fallback, or repair Codex permissions/connectivity and retry.',
      ),
    )
  } else {
    const plugin = plugins.find(
      item => item.name === APPRAISE_PLUGIN_NAME && item.marketplaceName === APPRAISE_MARKETPLACE_NAME,
    )
    checks.push(
      !plugin
        ? {
            id: 'plugin',
            status: 'error',
            message: `Plugin ${APPRAISE_PLUGIN_NAME} is not installed.`,
            recovery: `Install ${APPRAISE_PLUGIN_NAME}@${APPRAISE_MARKETPLACE_NAME}, then start a fresh Codex task.`,
          }
        : plugin.version !== APPRAISE_PLUGIN_VERSION
          ? {
              id: 'plugin',
              status: 'error',
              message: `Plugin ${APPRAISE_PLUGIN_NAME} is stale.`,
              recovery: `Reinstall ${APPRAISE_PLUGIN_NAME}@${plugin.marketplaceName ?? APPRAISE_MARKETPLACE_NAME}, then start a fresh Codex task.`,
              details: { expectedVersion: APPRAISE_PLUGIN_VERSION, observedVersion: plugin.version },
            }
          : plugin.enabled === false
            ? {
                id: 'plugin',
                status: 'error',
                message: `Plugin ${APPRAISE_PLUGIN_NAME} is installed but disabled.`,
                recovery: 'Enable or reinstall the plugin, then start a fresh Codex task.',
              }
            : {
                id: 'plugin',
                status: 'ok',
                message: `Plugin ${APPRAISE_PLUGIN_NAME} ${plugin.version} is installed and enabled.`,
              },
    )
  }

  const marketplaceResult = command(CODEX_MARKETPLACE_LIST_ARGS)
  const marketplaces = marketplaceInventory(marketplaceResult)
  if (!marketplaces) {
    checks.push(
      failureCheck(
        'marketplace',
        'Codex marketplace inventory',
        marketplaceResult,
        'Use the documented manual registered-MCP fallback; retry marketplace setup only after availability is restored.',
      ),
    )
  } else {
    const marketplace = marketplaces.find(
      item => item.name === APPRAISE_MARKETPLACE_NAME && item.root === appraisePluginMarketplaceRoot(),
    )
    checks.push(
      marketplace
        ? {
            id: 'marketplace',
            status: 'ok',
            message: `Marketplace ${APPRAISE_MARKETPLACE_NAME} is available.`,
            details: { root: marketplace.root },
          }
        : {
            id: 'marketplace',
            status: 'warning',
            message: `Marketplace ${APPRAISE_MARKETPLACE_NAME} is unavailable.`,
            recovery: `Add the package-shipped marketplace at ${appraisePluginMarketplaceRoot()}, or use manual registered-MCP fallback.`,
          },
    )
  }

  const mcpResult = command(CODEX_MCP_GET_ARGS)
  const mcp = mcpRegistration(mcpResult)
  if (!mcp) {
    checks.push(
      failureCheck(
        'mcp_registration',
        'Appraise MCP registration',
        mcpResult,
        'Register the documented stdio/HTTP Appraise MCP connection, then reconnect Codex.',
      ),
    )
  } else if (mcp.enabled === false) {
    checks.push({
      id: 'mcp_registration',
      status: 'error',
      message: 'Appraise MCP registration is disabled.',
      recovery: 'Enable or recreate the Appraise MCP registration, then reconnect Codex.',
    })
  } else {
    checks.push({
      id: 'mcp_registration',
      status: 'ok',
      message: `Appraise MCP registration is enabled (${mcp.transport?.type ?? 'unknown transport'}).`,
      details: { transport: mcp.transport?.type },
    })
  }

  checks.push({
    id: 'current_task',
    status: 'warning',
    message: 'Host registration does not prove that this task captured Appraise MCP tools or joined a Journey.',
    recovery: 'Start a fresh task or reconnect, then call project_diagnostic with observed capabilities.',
  })

  return {
    schemaVersion: 'appraise.codex-compatibility/v1',
    plugin: { name: APPRAISE_PLUGIN_NAME, expectedVersion: APPRAISE_PLUGIN_VERSION },
    marketplace: { name: APPRAISE_MARKETPLACE_NAME, root: appraisePluginMarketplaceRoot() },
    readyForFreshTask: checks.every(check => check.status === 'ok' || check.status === 'warning'),
    connectedJourney: false,
    lifecycleAuthority: false,
    checks,
    manualFallback: {
      setup: 'appraisejs agent setup --json',
      verify: 'codex mcp get appraisejs --json',
      reconnect: 'Restart or reconnect Codex, then call project_diagnostic.',
    },
    uninstall: 'appraisejs agent plugin uninstall',
  }
}

function actionResult(action: 'install' | 'uninstall', checks: CompatibilityCheck[], mutated: boolean) {
  return {
    schemaVersion: 'appraise.codex-plugin-action/v1',
    action,
    successful: checks.every(check => check.status === 'ok' || check.status === 'warning'),
    mutated,
    reconnectRequired: mutated,
    lifecycleAuthority: false,
    mcpRegistrationChanged: false,
    checks,
    recovery: mutated
      ? 'Restart or reconnect Codex, then call project_diagnostic. This action did not change MCP registration or Journey authority.'
      : 'No reconnect is required because this command made no host mutation.',
  }
}

function commandFailure(id: string, result: HostCommandResult): CompatibilityCheck {
  return failureCheck(
    id,
    `Codex ${id.replaceAll('_', ' ')}`,
    result,
    'Repair the reported Codex error, then rerun appraisejs agent compatibility --json before retrying.',
  )
}

function isSuccess(result: HostCommandResult): boolean {
  return result.status === 0 && !result.error
}

export function installAppraisePlugin(command: HostCommand = runCodex) {
  const checks: CompatibilityCheck[] = []
  let mutated = false
  const marketplaceResult = command(CODEX_MARKETPLACE_LIST_ARGS)
  const marketplaces = marketplaceInventory(marketplaceResult)
  if (!marketplaces) {
    checks.push(commandFailure('marketplace_inventory', marketplaceResult))
    return actionResult('install', checks, mutated)
  }
  const marketplace = marketplaces.find(item => item.name === APPRAISE_MARKETPLACE_NAME)
  if (marketplace && marketplace.root !== appraisePluginMarketplaceRoot()) {
    checks.push({
      id: 'marketplace',
      status: 'error',
      message: `Marketplace ${APPRAISE_MARKETPLACE_NAME} is registered from a different path.`,
      recovery: `Remove that marketplace deliberately, then add ${appraisePluginMarketplaceRoot()} using Codex.`,
    })
    return actionResult('install', checks, mutated)
  }
  if (!marketplace) {
    const addMarketplace = command(['plugin', 'marketplace', 'add', appraisePluginMarketplaceRoot(), '--json'])
    if (!isSuccess(addMarketplace)) {
      checks.push(commandFailure('marketplace_add', addMarketplace))
      return actionResult('install', checks, mutated)
    }
    mutated = true
  }

  const pluginResult = command(CODEX_PLUGIN_LIST_ARGS)
  const plugins = pluginInventory(pluginResult)
  if (!plugins) {
    checks.push(commandFailure('plugin_inventory', pluginResult))
    return actionResult('install', checks, mutated)
  }
  const plugin = plugins.find(
    item => item.name === APPRAISE_PLUGIN_NAME && item.marketplaceName === APPRAISE_MARKETPLACE_NAME,
  )
  if (plugin?.version === APPRAISE_PLUGIN_VERSION && plugin.enabled !== false) {
    checks.push({ id: 'plugin', status: 'ok', message: `Plugin ${CODEX_PLUGIN_ID} is already current and enabled.` })
    return actionResult('install', checks, mutated)
  }
  if (plugin) {
    const removePlugin = command(['plugin', 'remove', CODEX_PLUGIN_ID, '--json'])
    if (!isSuccess(removePlugin)) {
      checks.push(commandFailure('plugin_remove', removePlugin))
      return actionResult('install', checks, mutated)
    }
    mutated = true
  }
  const addPlugin = command(['plugin', 'add', CODEX_PLUGIN_ID, '--json'])
  if (!isSuccess(addPlugin)) checks.push(commandFailure('plugin_add', addPlugin))
  else {
    mutated = true
    checks.push({ id: 'plugin', status: 'ok', message: `Installed ${CODEX_PLUGIN_ID}.` })
  }
  return actionResult('install', checks, mutated)
}

export function uninstallAppraisePlugin(command: HostCommand = runCodex) {
  const checks: CompatibilityCheck[] = []
  const pluginResult = command(CODEX_PLUGIN_LIST_ARGS)
  const plugins = pluginInventory(pluginResult)
  if (!plugins) {
    checks.push(commandFailure('plugin_inventory', pluginResult))
    return actionResult('uninstall', checks, false)
  }
  const plugin = plugins.find(
    item => item.name === APPRAISE_PLUGIN_NAME && item.marketplaceName === APPRAISE_MARKETPLACE_NAME,
  )
  if (!plugin) {
    checks.push({ id: 'plugin', status: 'ok', message: `Plugin ${CODEX_PLUGIN_ID} is already absent.` })
    return actionResult('uninstall', checks, false)
  }
  const removePlugin = command(['plugin', 'remove', CODEX_PLUGIN_ID, '--json'])
  if (!isSuccess(removePlugin)) checks.push(commandFailure('plugin_remove', removePlugin))
  else checks.push({ id: 'plugin', status: 'ok', message: `Uninstalled ${CODEX_PLUGIN_ID}.` })
  return actionResult('uninstall', checks, isSuccess(removePlugin))
}
