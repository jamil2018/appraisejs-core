import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { Prisma } from '@prisma/client'

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
      recovery: expect.stringContaining('v2 AST check or preview'),
    })
  })

  it('returns undefined for unknown internal failures', () => {
    expect(coordinatorError(new Error('private detail'))).toBeUndefined()
  })

  it('returns migration recovery guidance for Prisma schema drift', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Missing column', {
      code: 'P2022',
      clientVersion: 'test',
      meta: { modelName: 'TestRun', column: 'main.TestRun.evidenceHealth' },
    })

    expect(coordinatorError(error)).toEqual({
      code: 'database-schema-drift',
      message: 'The Appraise database schema is behind the application code.',
      recovery: 'Run npm run migrate-db from the Appraise project, then retry the coordinator operation.',
      details: {
        prismaCode: 'P2022',
        column: 'main.TestRun.evidenceHealth',
        modelName: 'TestRun',
      },
    })
  })
})
