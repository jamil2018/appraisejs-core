import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  APPRAISE_MARKETPLACE_NAME,
  APPRAISE_PLUGIN_NAME,
  APPRAISE_PLUGIN_VERSION,
  CODEX_MARKETPLACE_LIST_ARGS,
  CODEX_MCP_GET_ARGS,
  CODEX_PLUGIN_ID,
  CODEX_PLUGIN_LIST_ARGS,
  CODEX_VERSION_ARGS,
  appraisePluginMarketplaceRoot,
  installAppraisePlugin,
  inspectCodexCompatibility,
  uninstallAppraisePlugin,
} from './codex-compatibility.js'

const ok = (value: unknown) => ({ status: 0, stdout: JSON.stringify(value), stderr: '' })
const version = () => ({ status: 0, stdout: 'codex-cli 0.159.0-alpha.12.1\n', stderr: '' })
const workspaces: string[] = []
afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(cwd => fs.rm(cwd, { recursive: true, force: true })))
})
async function workspace() {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-plugin-test-'))
  workspaces.push(cwd)
  await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"plugin-test"}')
  return cwd
}

describe('Codex compatibility diagnostics', () => {
  it('separates installed host readiness from current-task and Journey state', () => {
    const result = inspectCodexCompatibility(args => {
      if (args === CODEX_VERSION_ARGS) return version()
      if (args === CODEX_PLUGIN_LIST_ARGS)
        return ok({
          installed: [
            {
              name: APPRAISE_PLUGIN_NAME,
              marketplaceName: APPRAISE_MARKETPLACE_NAME,
              version: APPRAISE_PLUGIN_VERSION,
              enabled: true,
            },
          ],
        })
      if (args === CODEX_MARKETPLACE_LIST_ARGS)
        return ok({
          marketplaces: [{ name: APPRAISE_MARKETPLACE_NAME, root: appraisePluginMarketplaceRoot() }],
        })
      if (args === CODEX_MCP_GET_ARGS) return ok({ enabled: true, transport: { type: 'stdio', command: 'appraisejs' } })
      throw new Error(`unexpected ${args.join(' ')}`)
    })
    expect(result).toMatchObject({ readyForFreshTask: true, connectedJourney: false, lifecycleAuthority: false })
    expect(result.checks).toContainEqual(expect.objectContaining({ id: 'current_task', status: 'warning' }))
  })

  it('covers missing plugin, unavailable marketplace, and missing MCP registration', () => {
    const result = inspectCodexCompatibility(args => {
      if (args === CODEX_VERSION_ARGS) return version()
      if (args === CODEX_PLUGIN_LIST_ARGS) return ok({ installed: [] })
      if (args === CODEX_MARKETPLACE_LIST_ARGS) return ok({ marketplaces: [] })
      return { status: 1, stdout: '', stderr: 'MCP server not found' }
    })
    expect(result.readyForFreshTask).toBe(false)
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'plugin', status: 'error' }),
        expect.objectContaining({ id: 'marketplace', status: 'warning' }),
        expect.objectContaining({ id: 'mcp_registration', status: 'error' }),
      ]),
    )
    expect(result.manualFallback.setup).toBe('appraisejs agent setup --json')
  })

  it('reports stale, permission-denied, and unparseable states without guessing', () => {
    const results = [
      version(),
      ok({
        installed: [
          {
            name: APPRAISE_PLUGIN_NAME,
            marketplaceName: APPRAISE_MARKETPLACE_NAME,
            version: '0.3.0',
            enabled: true,
          },
        ],
      }),
      { status: 1, stdout: '', stderr: 'Operation not permitted' },
      { status: 0, stdout: 'not json', stderr: '' },
    ]
    const result = inspectCodexCompatibility(() => results.shift()!)
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'plugin', status: 'error' }),
        expect.objectContaining({ id: 'marketplace', details: { category: 'permission_failure' } }),
        expect.objectContaining({ id: 'mcp_registration', status: 'unknown' }),
      ]),
    )
  })

  it('does not crash or report readiness for malformed and wrong-identity inventories', () => {
    const results = [
      version(),
      ok({ installed: 'bad' }),
      ok({ marketplaces: [{ name: APPRAISE_MARKETPLACE_NAME, root: '/wrong' }] }),
      ok({ enabled: true, transport: {} }),
    ]
    const result = inspectCodexCompatibility(() => results.shift()!)
    expect(result.readyForFreshTask).toBe(false)
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'plugin_inventory', status: 'unknown' }),
        expect.objectContaining({ id: 'marketplace', status: 'warning' }),
        expect.objectContaining({ id: 'mcp_registration', status: 'unknown' }),
      ]),
    )
  })

  it.each([
    { name: APPRAISE_PLUGIN_NAME, marketplaceName: APPRAISE_MARKETPLACE_NAME, version: APPRAISE_PLUGIN_VERSION },
    {
      name: APPRAISE_PLUGIN_NAME,
      marketplaceName: APPRAISE_MARKETPLACE_NAME,
      version: APPRAISE_PLUGIN_VERSION,
      enabled: 'false',
    },
  ])('treats malformed plugin entry fields as unknown', entry => {
    const result = inspectCodexCompatibility(args => {
      if (args === CODEX_VERSION_ARGS) return version()
      if (args === CODEX_PLUGIN_LIST_ARGS) return ok({ installed: [entry] })
      if (args === CODEX_MARKETPLACE_LIST_ARGS)
        return ok({
          marketplaces: [{ name: APPRAISE_MARKETPLACE_NAME, root: appraisePluginMarketplaceRoot() }],
        })
      return ok({ enabled: true, transport: { type: 'stdio', command: 'appraisejs' } })
    })
    expect(result.readyForFreshTask).toBe(false)
    expect(result.checks).toContainEqual(expect.objectContaining({ id: 'plugin_inventory', status: 'unknown' }))
  })

  it('treats wrong-type marketplace entry fields as unknown', () => {
    const result = inspectCodexCompatibility(args => {
      if (args === CODEX_VERSION_ARGS) return version()
      if (args === CODEX_PLUGIN_LIST_ARGS)
        return ok({
          installed: [
            {
              name: APPRAISE_PLUGIN_NAME,
              marketplaceName: APPRAISE_MARKETPLACE_NAME,
              version: APPRAISE_PLUGIN_VERSION,
              enabled: true,
            },
          ],
        })
      if (args === CODEX_MARKETPLACE_LIST_ARGS) return ok({ marketplaces: [{ name: 123, root: false }] })
      return ok({ enabled: true, transport: { type: 'stdio', command: 'appraisejs' } })
    })
    expect(result.readyForFreshTask).toBe(false)
    expect(result.checks).toContainEqual(expect.objectContaining({ id: 'marketplace', status: 'unknown' }))
  })
})

describe('Codex plugin actions', () => {
  it('upgrades recognized prior guidance without changing MCP registration', () => {
    const calls: string[][] = []
    const result = installAppraisePlugin(args => {
      calls.push(args)
      if (args === CODEX_MARKETPLACE_LIST_ARGS)
        return ok({ marketplaces: [{ name: APPRAISE_MARKETPLACE_NAME, root: appraisePluginMarketplaceRoot() }] })
      if (args === CODEX_PLUGIN_LIST_ARGS)
        return ok({
          installed: [
            {
              name: APPRAISE_PLUGIN_NAME,
              marketplaceName: APPRAISE_MARKETPLACE_NAME,
              version: '0.4.0+codex.c11-20260913',
              enabled: true,
            },
          ],
        })
      return ok({ ok: true })
    })
    expect(result).toMatchObject({
      successful: true,
      mutated: true,
      reconnectRequired: true,
      mcpRegistrationChanged: false,
    })
    expect(calls.slice(2)).toEqual([
      ['plugin', 'remove', CODEX_PLUGIN_ID, '--json'],
      ['plugin', 'add', CODEX_PLUGIN_ID, '--json'],
    ])
  })
  it('installs through exact non-shell argv and does not alter MCP registration', () => {
    const calls: string[][] = []
    const result = installAppraisePlugin(args => {
      calls.push(args)
      if (args === CODEX_MARKETPLACE_LIST_ARGS) return ok({ marketplaces: [] })
      if (args === CODEX_PLUGIN_LIST_ARGS) return ok({ installed: [] })
      return ok({ ok: true })
    })
    expect(result).toMatchObject({
      successful: true,
      mutated: true,
      reconnectRequired: true,
      lifecycleAuthority: false,
      mcpRegistrationChanged: false,
    })
    expect(calls[0]).toBe(CODEX_MARKETPLACE_LIST_ARGS)
    expect(calls[1]).toEqual(['plugin', 'marketplace', 'add', expect.stringContaining('codex-marketplace'), '--json'])
    expect(calls[2]).toBe(CODEX_PLUGIN_LIST_ARGS)
    expect(calls[3]).toEqual(['plugin', 'add', CODEX_PLUGIN_ID, '--json'])
  })

  it('revokes local access before plugin removal and remains revoked when removal fails or plugin is absent', async () => {
    const cwd = await workspace()
    const calls: string[][] = []
    const result = await uninstallAppraisePlugin(cwd, args => {
      calls.push(args)
      if (args === CODEX_PLUGIN_LIST_ARGS)
        return ok({
          installed: [
            {
              name: APPRAISE_PLUGIN_NAME,
              marketplaceName: APPRAISE_MARKETPLACE_NAME,
              version: APPRAISE_PLUGIN_VERSION,
              enabled: true,
            },
          ],
        })
      return { status: 1, stdout: '', stderr: 'plugin removal failed' }
    })
    expect(result).toMatchObject({
      successful: false,
      mutated: true,
      mcpRegistrationChanged: false,
      localAccessDisabled: true,
      pluginRemoved: false,
    })
    expect(calls[1]).toEqual(['plugin', 'remove', CODEX_PLUGIN_ID, '--json'])
    expect(JSON.parse(await fs.readFile(path.join(cwd, '.appraisejs', 'coordinator.json'), 'utf8'))).toMatchObject({
      disabled: true,
      token: '',
    })

    const absent = await uninstallAppraisePlugin(cwd, () => ok({ installed: [] }))
    expect(absent).toMatchObject({
      successful: true,
      mutated: true,
      reconnectRequired: true,
      localAccessDisabled: true,
    })
  })

  it('refuses to remove a newer or unknown plugin to install this package version', () => {
    for (const observed of ['9.0.0+codex.c99-20990101', '0.4.0+codex.c99-20990101', 'unexpected']) {
      const calls: string[][] = []
      const result = installAppraisePlugin(args => {
        calls.push(args)
        if (args === CODEX_MARKETPLACE_LIST_ARGS)
          return ok({ marketplaces: [{ name: APPRAISE_MARKETPLACE_NAME, root: appraisePluginMarketplaceRoot() }] })
        if (args === CODEX_PLUGIN_LIST_ARGS)
          return ok({
            installed: [
              {
                name: APPRAISE_PLUGIN_NAME,
                marketplaceName: APPRAISE_MARKETPLACE_NAME,
                version: observed,
                enabled: true,
              },
            ],
          })
        throw new Error('must not mutate plugin')
      })
      expect(result.successful).toBe(false)
      expect(calls).toEqual([CODEX_MARKETPLACE_LIST_ARGS, CODEX_PLUGIN_LIST_ARGS])
    }
  })

  it('reinstalls a same-version disabled plugin without touching MCP registration', () => {
    const calls: string[][] = []
    const result = installAppraisePlugin(args => {
      calls.push(args)
      if (args === CODEX_MARKETPLACE_LIST_ARGS)
        return ok({ marketplaces: [{ name: APPRAISE_MARKETPLACE_NAME, root: appraisePluginMarketplaceRoot() }] })
      if (args === CODEX_PLUGIN_LIST_ARGS)
        return ok({
          installed: [
            {
              name: APPRAISE_PLUGIN_NAME,
              marketplaceName: APPRAISE_MARKETPLACE_NAME,
              version: APPRAISE_PLUGIN_VERSION,
              enabled: false,
            },
          ],
        })
      return ok({ ok: true })
    })
    expect(result).toMatchObject({ successful: true, mcpRegistrationChanged: false })
    expect(calls.slice(2)).toEqual([
      ['plugin', 'remove', CODEX_PLUGIN_ID, '--json'],
      ['plugin', 'add', CODEX_PLUGIN_ID, '--json'],
    ])
  })

  it('leaves an unobserved Codex version unqualified while reporting capability diagnostics', () => {
    const result = inspectCodexCompatibility(args => {
      if (args === CODEX_VERSION_ARGS) return { status: 0, stdout: 'codex-cli 0.160.0\n', stderr: '' }
      if (args === CODEX_PLUGIN_LIST_ARGS) return ok({ installed: [] })
      if (args === CODEX_MARKETPLACE_LIST_ARGS) return ok({ marketplaces: [] })
      return ok({ enabled: true, transport: { type: 'stdio', command: 'appraisejs' } })
    })
    expect(result.readyForFreshTask).toBe(false)
    expect(result.checks).toContainEqual(expect.objectContaining({ id: 'codex_version', status: 'unknown' }))
    expect(result.checks).toContainEqual(expect.objectContaining({ id: 'mcp_registration', status: 'ok' }))
  })
})
