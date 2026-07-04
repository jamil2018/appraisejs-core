import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { coordinatorError, planLinks, zodCoordinatorError } from './contracts'

describe('coordinator public contracts', () => {
  it('builds stable Appraise, browser, and compatibility routes from the configured base URL', () => {
    expect(planLinks('planning-experience', 'http://127.0.0.1:3000/')).toEqual({
      appraise: 'appraise://plans/planning-experience',
      browser: 'http://127.0.0.1:3000/plans/planning-experience',
      route: '/plans/planning-experience',
    })
  })

  it('reports the exact invalid field with recovery guidance', () => {
    const result = z
      .object({ plan: z.object({ tasks: z.array(z.object({ validationIntent: z.string().min(1) })) }) })
      .safeParse({ plan: { tasks: [{ validationIntent: '' }] } })
    expect(result.success).toBe(false)
    if (result.success) return

    expect(zodCoordinatorError(result.error)).toEqual({
      code: 'invalid-request',
      message: expect.stringContaining('plan.tasks.0.validationIntent'),
      path: 'plan.tasks.0.validationIntent',
      recovery: expect.stringContaining('appraise://workflow/validation-preparation'),
    })
  })

  it('returns undefined for unknown internal failures', () => {
    expect(coordinatorError(new Error('private detail'))).toBeUndefined()
  })
})
