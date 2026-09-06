import { describe, expect, it } from 'vitest'

import { expectedAgentCapabilities } from './agent-setup-capabilities.js'

describe('agent setup capabilities', () => {
  it.each(['tools', 'resources'] as const)('lists unique %s', capabilityType => {
    const capabilities = expectedAgentCapabilities[capabilityType]

    expect(new Set(capabilities).size).toBe(capabilities.length)
  })

  it('advertises only the executable Quality Journey lifecycle tools', () => {
    expect(expectedAgentCapabilities.tools).toEqual(
      expect.arrayContaining([
        'project_diagnostic',
        'quality_journey_create',
        'quality_journey_analysis_get',
        'quality_journey_scenarios_submit',
        'quality_journey_execution_start',
        'quality_journey_triage_submit',
        'test_run_read',
        'test_run_diagnose',
      ]),
    )
    expect(expectedAgentCapabilities.resources).toEqual(
      expect.arrayContaining(['appraise://project', 'appraise://target-projects']),
    )
    for (const retired of ['assessment_run', 'requirements_submit_source', 'methodology_list'])
      expect(expectedAgentCapabilities.tools).not.toContain(retired)
  })
})
