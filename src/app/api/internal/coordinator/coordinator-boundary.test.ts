import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('coordinator adapter boundaries', () => {
  const adapterPaths = {
    api: path.join(process.cwd(), 'src', 'app', 'api', 'internal', 'coordinator', '[...operation]', 'route.ts'),
    cli: path.join(process.cwd(), 'packages', 'appraisejs', 'src', 'cli.ts'),
    mcp: path.join(process.cwd(), 'packages', 'appraisejs', 'src', 'mcp.ts'),
    mcpContract: path.join(process.cwd(), 'packages', 'appraisejs', 'src', 'mcp-contract.fixture.json'),
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

  it('returns serializable acknowledgement for void baseline regression mutations', async () => {
    const source = await fs.readFile(adapterPaths.api, 'utf8')
    expect(source).toMatch(/await justifyBaselineRegressionPass\([\s\S]*?return Response\.json\(\{ ok: true \}\)/)
    expect(source).not.toMatch(/Response\.json\(\s*await justifyBaselineRegressionPass/)
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
        'readPlanReviewSummary',
        'checkValidationAstForPlan',
        'previewValidationAstForPlan',
        'compileValidationAstForPlan',
        'submitValidationReview',
        'startBaselineExecution',
        'reconcileBaselineExecution',
        'acceptBaseline',
        'startImplementation',
        'approveImplementationGroups',
        'reachImplementationCheckpoint',
        'recordImplementationValidation',
        'startImplementationValidation',
        'reconcileImplementationValidation',
        'approveImplementationCompletion',
      ],
      cli: [
        'createPlan',
        'revisePlan',
        'checkValidationAst',
        'previewValidationAst',
        'compileValidationAst',
        'submitValidation',
        'completionReview',
        'reconnect',
      ],
      mcpContract: [
        'plan_create',
        'planning_session_create',
        'plan_wait_for_approval',
        'plan_review_read',
        'plan_revise',
        'validation_ast_check',
        'validation_ast_preview',
        'validation_ast_compile',
        'validation_review_loop',
        'validation_feedback_submit',
        'validation_review_submit',
        'baseline_start',
        'baseline_reconcile',
        'baseline_accept',
        'implementation_start',
        'implementation_group_approve',
        'implementation_checkpoint',
        'implementation_validation_record',
        'implementation_validation_start',
        'implementation_validation_reconcile',
        'implementation_complete',
      ],
      ui: ['approvePlanRevisionAction', 'requestPlanChangesAction', 'acknowledgeBaselineFailureAction'],
    }

    for (const [adapter, operations] of Object.entries(expectedOperations)) {
      for (const operation of operations) {
        expect(sources[adapter], `${adapter} adapter is missing ${operation}`).toContain(operation)
      }
    }
  })
})
