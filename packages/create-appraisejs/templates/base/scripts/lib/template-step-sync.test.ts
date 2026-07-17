import { describe, expect, it, vi } from 'vitest'

import { hasTemplateStepReferences } from './template-step-sync'

describe('template-step synchronization safety', () => {
  it('detects referenced existing steps so sync can preserve their stable identity', async () => {
    const client = {
      testCaseStep: { count: vi.fn().mockResolvedValue(1) },
      templateTestCaseStep: { count: vi.fn().mockResolvedValue(0) },
    }

    await expect(hasTemplateStepReferences(client, 'step-existing')).resolves.toBe(true)
    expect(client.testCaseStep.count).toHaveBeenCalledWith({ where: { templateStepId: 'step-existing' } })
  })

  it('allows genuinely unreferenced orphan cleanup', async () => {
    const client = {
      testCaseStep: { count: vi.fn().mockResolvedValue(0) },
      templateTestCaseStep: { count: vi.fn().mockResolvedValue(0) },
    }

    await expect(hasTemplateStepReferences(client, 'step-orphan')).resolves.toBe(false)
  })
})
