import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('coordinator adapter boundaries', () => {
  const adapterPaths = {
    api: path.join(process.cwd(), 'src', 'app', 'api', 'internal', 'coordinator', '[...operation]', 'route.ts'),
    cli: path.join(process.cwd(), 'packages', 'appraisejs', 'src', 'cli.ts'),
    mcp: path.join(process.cwd(), 'packages', 'appraisejs', 'src', 'mcp.ts'),
    ui: path.join(process.cwd(), 'src', 'actions', 'plan-review', 'plan-review-actions.ts'),
  }

  it('keeps API and MCP adapters away from Prisma, repositories, and lifecycle tables', async () => {
    const adapters = [adapterPaths.api, adapterPaths.mcp]
    for (const adapter of adapters) {
      const source = await fs.readFile(adapter, 'utf8')
      expect(source).not.toMatch(/from ['"].*(@prisma|db-config|artifact-repository)/)
      expect(source).not.toMatch(/\.(planProjection|planEvent|planCoordinatorLease)\./)
    }
  })

  it('does not write diagnostics to stdout from the MCP adapter', async () => {
    const source = await fs.readFile(adapterPaths.mcp, 'utf8')
    expect(source).not.toMatch(/console\.(log|info|debug)/)
    expect(source).not.toMatch(/process\.stdout\.write/)
  })

  it('keeps release-critical workflow operations exposed through their supported adapters', async () => {
    const sources = Object.fromEntries(
      await Promise.all(
        Object.entries(adapterPaths).map(async ([name, file]) => [name, await fs.readFile(file, 'utf8')] as const),
      ),
    )
    const expectedOperations = {
      api: [
        'createCoordinatorPlan',
        'reviseCoordinatorPlan',
        'publishPreparedValidations',
        'submitValidationReview',
        'reachImplementationCheckpoint',
        'approveImplementationCompletion',
      ],
      cli: ['createPlan', 'revisePlan', 'publishValidation', 'submitValidation', 'completionReview', 'reconnect'],
      mcp: [
        'plan_create',
        'plan_wait_for_approval',
        'plan_revise',
        'validation_publish',
        'validation_feedback_submit',
        'validation_review_submit',
        'implementation_checkpoint',
        'implementation_complete',
      ],
      ui: [
        'approvePlanRevisionAction',
        'startBaselineExecutionAction',
        'acknowledgeBaselineFailureAction',
        'startImplementationAction',
      ],
    }

    for (const [adapter, operations] of Object.entries(expectedOperations)) {
      for (const operation of operations) {
        expect(sources[adapter], `${adapter} adapter is missing ${operation}`).toContain(operation)
      }
    }
  })
})
