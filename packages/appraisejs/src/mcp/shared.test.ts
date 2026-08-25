import { describe, expect, it } from 'vitest'

import { agentPreflightSchema } from '../../../../src/lib/agent-preflight/contracts.ts'

import { buildAgentPreflight, diagnosticGuidance, mcpCapabilityMetadata, mcpContractHash } from './shared.js'

describe('agent preflight contract', () => {
  it('includes the receipt fields required by the coordinator API', () => {
    const preflight = buildAgentPreflight(
      {
        ok: true,
        hubProject: { canonicalPath: '/hub', fingerprint: 'hub' },
        targetProjects: [{ canonicalPath: '/target' }],
        checks: [{ id: 'application', status: 'ok' }],
      } as never,
      {
        observedTools: [
          'project_diagnostic',
          'requirements_submit_source',
          'locator_ensure',
          'locator_search',
          'assessment_preflight',
          'assessment_run',
          'assessment_decide',
        ],
        observedResources: [
          'appraise://project',
          'appraise://workflow/quality-design',
          'appraise://workflow/assessment',
        ],
        observedMcpSurfaceVersion: mcpCapabilityMetadata.mcpSurfaceVersion,
        observedMcpContractHash: mcpCapabilityMetadata.mcpContractHash,
        expectedTargetWorkspacePath: '/target',
      },
    )

    expect(preflight).toMatchObject({
      status: 'ready',
      ready: true,
      layers: {
        applicationAndIdentity: { checks: [{ id: 'application', status: 'ok' }] },
        activeMcpTransport: { message: expect.any(String) },
        contractCompatibility: { status: 'ready', reconnect: { required: false } },
        currentTaskCapabilities: { message: expect.any(String) },
        targetProjectBinding: { matchedScope: 'target', message: expect.any(String) },
      },
    })
    expect(() => agentPreflightSchema.parse(preflight)).not.toThrow()
  })

  it('blocks a stale observed MCP contract with structured reconnect guidance', () => {
    const preflight = buildAgentPreflight(
      {
        ok: true,
        hubProject: { canonicalPath: '/hub', fingerprint: 'hub' },
        targetProjects: [],
        checks: [],
      } as never,
      {
        observedMcpSurfaceVersion: '2026-01-01.stale',
        observedMcpContractHash: `sha256:${'0'.repeat(64)}`,
      },
    )

    expect(preflight).toMatchObject({
      status: 'blocked',
      ready: false,
      layers: {
        contractCompatibility: {
          status: 'stale',
          reconnect: { required: true, action: 'restart_or_reconnect_mcp_client' },
        },
      },
    })
  })

  it('prioritizes reconnect guidance when the nested preflight contract layer is stale', () => {
    expect(
      diagnosticGuidance({ ok: true }, { ready: true, layers: { contractCompatibility: { status: 'stale' } } }),
    ).toEqual({
      nextRecommendedAction:
        'Restart or reconnect the MCP client, then rerun project_diagnostic with a fresh capability observation.',
      nextRequiredAgentBehavior: 'reconnect_mcp_client',
    })
  })

  it('fingerprints the complete public schema, defaults, annotations, and resources deterministically', () => {
    const contract = [
      {
        kind: 'tool',
        name: 'assessment_review',
        inputSchema: { properties: { responseMode: { default: 'summary', type: 'string' } } },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      {
        kind: 'resource',
        name: 'assessment-workflow',
        uri: 'appraise://workflow/assessment',
        annotations: { readOnlyHint: true },
      },
    ]
    const reorderedProperties = [
      {
        annotations: { openWorldHint: false, readOnlyHint: true },
        inputSchema: { properties: { responseMode: { type: 'string', default: 'summary' } } },
        name: 'assessment_review',
        kind: 'tool',
      },
      contract[1],
    ]

    expect(mcpContractHash(reorderedProperties)).toBe(mcpContractHash(contract))
    expect(
      mcpContractHash([
        { ...contract[0], inputSchema: { properties: { responseMode: { default: 'full', type: 'string' } } } },
        contract[1],
      ]),
    ).not.toBe(mcpContractHash(contract))
    expect(mcpContractHash([contract[0], { ...contract[1], annotations: { readOnlyHint: false } }])).not.toBe(
      mcpContractHash(contract),
    )
    expect(mcpContractHash([contract[0], { ...contract[1], uri: 'appraise://workflow/assessment-v2' }])).not.toBe(
      mcpContractHash(contract),
    )
  })
})
