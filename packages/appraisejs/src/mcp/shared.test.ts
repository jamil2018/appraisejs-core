import { describe, expect, it } from 'vitest'

import { agentPreflightSchema } from '../../../../src/lib/agent-preflight/contracts.ts'

import { buildAgentPreflight } from './shared.js'

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
          'validation_publish',
          'assessment_run',
          'assessment_decide',
        ],
        observedResources: [
          'appraise://project',
          'appraise://workflow/quality-design',
          'appraise://workflow/assessment',
        ],
        expectedTargetWorkspacePath: '/target',
      },
    )

    expect(preflight).toMatchObject({
      status: 'ready',
      ready: true,
      layers: {
        applicationAndIdentity: { checks: [{ id: 'application', status: 'ok' }] },
        activeMcpTransport: { message: expect.any(String) },
        currentTaskCapabilities: { message: expect.any(String) },
        targetProjectBinding: { matchedScope: 'target', message: expect.any(String) },
      },
    })
    expect(() => agentPreflightSchema.parse(preflight)).not.toThrow()
  })
})
