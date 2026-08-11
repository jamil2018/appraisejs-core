import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('quality coordinator boundary', () => {
  const routePath = path.join(
    process.cwd(),
    'src',
    'app',
    'api',
    'internal',
    'coordinator',
    '[...operation]',
    'route.ts',
  )

  it('contains only quality lifecycle and bounded discovery dispatch', async () => {
    const source = await fs.readFile(routePath, 'utf8')
    expect(source).toContain("'quality/assessment-runs'")
    expect(source).toContain('recordAgentPreflightReceipt(body)')
    expect(source).toContain('error.issues.map')
    expect(source).toContain("'test-runs' && operation[1] === 'preflight'")
    expect(source).toContain("operation[0] === 'step-definitions'")
    expect(source).toContain("operation[3] === 'locators'")
    expect(source).not.toMatch(
      /coordinator-plan-service|coordinator-baseline-service|coordinator-implementation-service/,
    )
  })

  it('keeps unknown routes on the normal not-found error path', async () => {
    const source = await fs.readFile(routePath, 'utf8')
    expect(source).toContain("throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')")
    expect(source).not.toContain('compatibility guidance')
  })
})
