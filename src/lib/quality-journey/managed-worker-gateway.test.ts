import { describe, expect, it } from 'vitest'

import { canonicalMcpToolNames } from '../../../packages/appraisejs/src/mcp/contract'
import { registerAppraiseOperations } from '../../../packages/appraisejs/src/mcp/registry'
import {
  createManagedWorkerRegistrationProfile,
  executeManagedWorkerGatewayCall,
  ManagedWorkerInvocationError,
  ManagedWorkerPostIoAuthorizationError,
  managedWorkerRoleToolMap,
  sealManagedWorkerRuntimeGrant,
  verifyManagedWorkerRuntimeGrant,
  type CanonicalMcpDefinition,
  type ManagedWorkerRegistrationProfile,
} from './managed-worker-gateway'

const secret = Buffer.alloc(32, 7)
const canonicalDefinitions = collectCanonicalDefinitions()
const exactRoleMaps = {
  REQUIREMENT_ANALYZER: {
    'artifact.read': ['quality_journey_analysis_get'],
    'artifact.propose': ['quality_journey_analysis_submit'],
    'work.output.submit': ['quality_journey_analysis_submit'],
  },
  SCOUT: {
    'target.observe': ['quality_journey_discovery_get'],
    'evidence.publish': ['quality_journey_target_observation_submit'],
    'work.output.submit': ['quality_journey_target_observation_submit'],
  },
  RESOURCE_EXPLORER: {
    'catalog.search': ['operation_search'],
    'artifact.read': ['quality_journey_discovery_get'],
    'work.output.submit': ['quality_journey_resource_resolution_submit'],
  },
  TEST_SCENARIO_DESIGNER: {
    'artifact.read': ['quality_journey_scenarios_get'],
    'scenario.propose': ['quality_journey_scenarios_submit'],
    'work.output.submit': ['quality_journey_scenarios_submit'],
  },
  AUTOMATOR: {
    'catalog.search': ['operation_search'],
    'automation.write': ['quality_journey_automation_materialize'],
    'runtime-capsule.publish': ['quality_journey_automation_materialize'],
    'work.output.submit': ['quality_journey_automation_materialize'],
  },
  TRIAGER: {
    'artifact.read': ['quality_journey_triage_get'],
    'evidence.read': ['quality_journey_triage_evidence_read'],
    'report.propose': ['quality_journey_triage_submit'],
    'work.output.submit': ['quality_journey_triage_submit'],
  },
} as const
const exactRoles = Object.keys(exactRoleMaps) as (keyof typeof exactRoleMaps)[]

describe('managed worker gateway registration profile', () => {
  it('derives the independently enumerated six role maps while preserving the larger trusted MCP', () => {
    expect(exactRoles).toHaveLength(6)
    expect(managedWorkerRoleToolMap()).toEqual(exactRoleMaps)
    expect(
      canonicalDefinitions
        .filter(definition => definition.kind === 'tool')
        .map(definition => definition.name)
        .sort(),
    ).toEqual([...canonicalMcpToolNames].sort())
    for (const role of exactRoles) {
      const profile = createManagedWorkerRegistrationProfile(role, canonicalDefinitions)
      expect(profile.abstractToolMap).toEqual(exactRoleMaps[role])
      expect(profile.tools.map(tool => tool.name)).toEqual([...new Set(Object.values(exactRoleMaps[role]).flat())])
      expect(profile.tools.length).toBeLessThan(canonicalMcpToolNames.length)
      expect(profile.tools.every(tool => tool.origin === 'mcp:appraise-quality-journey-worker')).toBe(true)
    }
    expect(canonicalMcpToolNames).toContain('quality_journey_execution_start')
    expect(exactRoles.flatMap(role => Object.values(exactRoleMaps[role]).flat())).not.toContain(
      'quality_journey_execution_start',
    )
  })

  it('recursively removes all principal fields while retaining hashes and injection bindings', () => {
    for (const role of exactRoles) {
      const profile = createManagedWorkerRegistrationProfile(role, canonicalDefinitions)
      for (const tool of profile.tools) {
        expect(findAuthorityPaths(tool.inputSchema), `${role}:${tool.name}`).toEqual([])
        expect(tool.canonicalInputSchemaHash).toMatch(/^sha256:[a-f0-9]{64}$/)
        expect(tool.workerInputSchemaHash).toMatch(/^sha256:[a-f0-9]{64}$/)
        for (const binding of tool.principalBindings) expect(binding.path.length).toBeGreaterThan(0)
      }
    }
  })

  it('fails closed when a mapping cannot be resolved from canonical definitions', () => {
    expect(() => createManagedWorkerRegistrationProfile('REQUIREMENT_ANALYZER', [])).toThrow(
      'absent from the canonical MCP registry',
    )
  })
})

describe('managed worker runtime grant and broker receipts', () => {
  it('binds a signed grant to the exact profile and rejects tampering and expiry', () => {
    const profile = analyzerProfile()
    const grant = sealedGrant(profile)
    expect(verifyManagedWorkerRuntimeGrant(grant, secret, new Date('2026-09-10T00:01:00.000Z'))).toMatchObject({
      role: 'REQUIREMENT_ANALYZER',
      profileDigest: profile.contractDigest,
      targetProjectId: 'target-1',
      journeyId: 'journey-1',
      workItemId: 'work-1',
      attemptId: 'attempt-1',
      generation: 2,
    })
    expect(() => verifyManagedWorkerRuntimeGrant(`${grant}x`, secret)).toThrow('signature is invalid')
    expect(() => verifyManagedWorkerRuntimeGrant(grant, secret, new Date('2026-09-10T01:00:00.000Z'))).toThrow(
      'has expired',
    )
  })

  it('injects principal scope and trusted owner authority, then emits a content-bound receipt', async () => {
    const profile = analyzerProfile()
    const stages: string[] = []
    const invocation = await executeManagedWorkerGatewayCall({
      sealedGrant: sealedGrant(profile),
      secret,
      profile,
      toolName: 'quality_journey_analysis_submit',
      arguments: { charter: { title: 'bounded proposal' }, idempotencyKey: 'submit-1' },
      clock: () => new Date('2026-09-10T00:01:00.000Z'),
      authorize: async ({ principal, stage, requestHash, resultHash }) => {
        stages.push(`${stage}:${principal.authorizationId}:${requestHash}:${resultHash ?? 'none'}`)
        return {
          decisionDigest: `sha256:${stage === 'before_io' ? 'a'.repeat(64) : 'b'.repeat(64)}`,
          ownerToken: 'trusted-owner-token',
        }
      },
      invoke: async ({ arguments: trustedArguments }) => {
        expect(trustedArguments).toMatchObject({
          target: 'target-ref',
          journeyId: 'journey-1',
          workItemId: 'work-1',
          attemptId: 'attempt-1',
          leaseId: 'lease-1',
          ownerToken: 'trusted-owner-token',
          charter: { title: 'bounded proposal' },
        })
        return { revisionId: 'analysis-1' }
      },
    })
    expect(stages[0]).toContain('before_io:authorization-1:sha256:')
    expect(stages[1]).toContain('after_io:authorization-1:sha256:')
    expect(invocation.receipt).toMatchObject({
      accepted: true,
      effectOutcome: 'occurred',
      profileDigest: profile.contractDigest,
    })
    expect(invocation.receipt.requestHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(invocation.receipt.resultHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(JSON.stringify(invocation.receipt)).not.toContain('trusted-owner-token')
  })

  it('rejects fabricated profiles, nested caller authority and out-of-role tools before I/O', async () => {
    const profile = analyzerProfile()
    const invoke = async () => ({ ok: true })
    const common = gatewayInput(profile, invoke)
    const fabricated = {
      ...profile,
      tools: [...profile.tools, { ...profile.tools[0], name: 'quality_journey_execution_start' }],
    } as ManagedWorkerRegistrationProfile
    await expect(
      executeManagedWorkerGatewayCall({
        ...common,
        profile: fabricated,
        toolName: 'quality_journey_execution_start',
        arguments: {},
      }),
    ).rejects.toThrow('profile digest is invalid')
    await expect(
      executeManagedWorkerGatewayCall({
        ...common,
        toolName: 'quality_journey_analysis_submit',
        arguments: { charter: { result: { role: 'AUTOMATOR' } } },
      }),
    ).rejects.toThrow('charter.result.role')
    await expect(
      executeManagedWorkerGatewayCall({ ...common, toolName: 'quality_journey_execution_start', arguments: {} }),
    ).rejects.toThrow('not registered for this worker role')
  })

  it('reverifies after I/O and preserves an effect receipt when authorization is revoked', async () => {
    const profile = analyzerProfile()
    let authorizationCount = 0
    try {
      await executeManagedWorkerGatewayCall({
        ...gatewayInput(profile, async () => ({ committed: true })),
        toolName: 'quality_journey_analysis_get',
        arguments: {},
        authorize: async () => {
          authorizationCount += 1
          if (authorizationCount === 2) throw new Error('grant revoked during I/O')
          return { decisionDigest: `sha256:${'a'.repeat(64)}` }
        },
      })
      throw new Error('expected post-I/O authorization failure')
    } catch (error) {
      expect(error).toBeInstanceOf(ManagedWorkerPostIoAuthorizationError)
      const receipt = (error as ManagedWorkerPostIoAuthorizationError).receipt
      expect(receipt).toMatchObject({ accepted: false, effectOutcome: 'occurred', postIoAuthorization: null })
      expect(receipt.resultHash).toMatch(/^sha256:[a-f0-9]{64}$/)
    }
  })

  it('revalidates and emits an ambiguous-effect receipt when I/O throws after a possible commit', async () => {
    const profile = analyzerProfile()
    const stages: string[] = []
    try {
      await executeManagedWorkerGatewayCall({
        ...gatewayInput(profile, async () => {
          throw new Error('ack lost after commit')
        }),
        toolName: 'quality_journey_analysis_get',
        arguments: {},
        authorize: async ({ stage, ioOutcome }) => {
          stages.push(`${stage}:${ioOutcome ?? 'not-attempted'}`)
          return { decisionDigest: `sha256:${'a'.repeat(64)}` }
        },
      })
      throw new Error('expected ambiguous invocation failure')
    } catch (error) {
      expect(error).toBeInstanceOf(ManagedWorkerInvocationError)
      const receipt = (error as ManagedWorkerInvocationError).receipt
      expect(stages).toEqual(['before_io:not-attempted', 'after_io:threw'])
      expect(receipt).toMatchObject({
        accepted: false,
        effectOutcome: 'unknown',
        postIoAuthorization: `sha256:${'a'.repeat(64)}`,
      })
      expect(receipt.resultHash).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(JSON.stringify(receipt)).not.toContain('ack lost after commit')
    }
  })
})

function analyzerProfile() {
  return createManagedWorkerRegistrationProfile('REQUIREMENT_ANALYZER', canonicalDefinitions)
}

function sealedGrant(profile: ManagedWorkerRegistrationProfile) {
  return sealManagedWorkerRuntimeGrant(
    {
      target: 'target-ref',
      targetProjectId: 'target-1',
      journeyId: 'journey-1',
      workItemId: 'work-1',
      role: 'REQUIREMENT_ANALYZER',
      attemptId: 'attempt-1',
      generation: 2,
      leaseId: 'lease-1',
      authorizationId: 'authorization-1',
      inputHash: `sha256:${'c'.repeat(64)}`,
      scopeHash: `sha256:${'d'.repeat(64)}`,
      profileDigest: profile.contractDigest,
      issuedAt: '2026-09-10T00:00:00.000Z',
      expiresAt: '2026-09-10T00:30:00.000Z',
    },
    secret,
  )
}

function gatewayInput(profile: ManagedWorkerRegistrationProfile, invoke: () => Promise<unknown>) {
  return {
    sealedGrant: sealedGrant(profile),
    secret,
    profile,
    clock: () => new Date('2026-09-10T00:01:00.000Z'),
    authorize: async () => ({ decisionDigest: `sha256:${'a'.repeat(64)}`, ownerToken: 'trusted-owner-token' }),
    invoke,
  }
}

function findAuthorityPaths(value: unknown, path: string[] = []): string[] {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value))
    return value.flatMap((nested, index) => findAuthorityPaths(nested, [...path, String(index)]))
  return Object.entries(value).flatMap(([key, nested]) => [
    ...([
      'actor',
      'authorizationId',
      'assignmentScopeHash',
      'attemptId',
      'expectedInputHash',
      'expectedScopeHash',
      'generation',
      'inputHash',
      'journeyId',
      'leaseId',
      'ownerToken',
      'projectBearer',
      'role',
      'target',
      'targetProjectId',
      'workItemId',
    ].includes(key)
      ? [[...path, key].join('.')]
      : []),
    ...findAuthorityPaths(nested, [...path, key]),
  ])
}

function collectCanonicalDefinitions(): readonly CanonicalMcpDefinition[] {
  return registerAppraiseOperations({
    server: { registerTool: () => ({}), registerResource: () => ({}) } as never,
    api: new Proxy({}, { get: () => async () => ({}) }) as never,
    options: { cwd: process.cwd(), baseUrl: 'http://127.0.0.1:3000', coordinatorId: 'gateway-contract-test' },
  })
}
