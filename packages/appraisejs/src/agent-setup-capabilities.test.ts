import { describe, expect, it } from 'vitest'

import { expectedAgentCapabilities } from './agent-setup-capabilities.js'

describe('agent setup capabilities', () => {
  it.each(['tools', 'resources'] as const)('lists unique %s', capabilityType => {
    const capabilities = expectedAgentCapabilities[capabilityType]

    expect(new Set(capabilities).size).toBe(capabilities.length)
  })

  it('advertises only the executable quality lifecycle tools', () => {
    expect(expectedAgentCapabilities.tools).toEqual(
      expect.arrayContaining([
        'project_diagnostic',
        'requirements_submit_source',
        'validation_design_approve',
        'assessment_run',
        'assessment_reconcile',
        'assessment_decide',
        'test_run_read',
        'test_run_diagnose',
      ]),
    )
    expect(expectedAgentCapabilities.resources).toEqual(
      expect.arrayContaining([
        'appraise://project',
        'appraise://workflow/quality-design',
        'appraise://workflow/assessment',
      ]),
    )
  })
})
