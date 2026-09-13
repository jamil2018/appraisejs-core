import { describe, expect, it } from 'vitest'

import {
  APPRAISE_MARKETPLACE_NAME,
  APPRAISE_PLUGIN_NAME,
  APPRAISE_PLUGIN_VERSION,
  CODEX_MARKETPLACE_LIST_ARGS,
  CODEX_MCP_GET_ARGS,
  CODEX_PLUGIN_ID,
  CODEX_PLUGIN_LIST_ARGS,
  appraisePluginMarketplaceRoot,
  installAppraisePlugin,
  inspectCodexCompatibility,
  uninstallAppraisePlugin,
} from './codex-compatibility.js'

const ok = (value: unknown) => ({ status: 0, stdout: JSON.stringify(value), stderr: '' })

describe('Codex compatibility diagnostics', () => {
  it('separates installed host readiness from current-task and Journey state', () => {
    const result = inspectCodexCompatibility(args => {
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

  it('uninstalls only the plugin and is idempotent when absent', () => {
    const calls: string[][] = []
    const result = uninstallAppraisePlugin(args => {
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
      return ok({ ok: true })
    })
    expect(result).toMatchObject({ successful: true, mutated: true, mcpRegistrationChanged: false })
    expect(calls[1]).toEqual(['plugin', 'remove', CODEX_PLUGIN_ID, '--json'])

    const absent = uninstallAppraisePlugin(() => ok({ installed: [] }))
    expect(absent).toMatchObject({ successful: true, mutated: false, reconnectRequired: false })
  })
})
