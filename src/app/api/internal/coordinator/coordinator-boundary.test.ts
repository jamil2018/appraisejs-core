import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { coordinatorErrorContext, coordinatorSuccessSchema } from './[...operation]/route'

describe('coordinator adapter boundaries', () => {
  const adapterPaths = {
    api: path.join(process.cwd(), 'src', 'app', 'api', 'internal', 'coordinator', '[...operation]', 'route.ts'),
    cli: path.join(process.cwd(), 'packages', 'appraisejs', 'src', 'cli.ts'),
    mcp: path.join(process.cwd(), 'packages', 'appraisejs', 'src', 'mcp.ts'),
    mcpContract: path.join(process.cwd(), 'packages', 'appraisejs', 'src', 'mcp-contract.fixture.json'),
    ui: path.join(process.cwd(), 'src', 'actions', 'plan-review', 'plan-review-actions.ts'),
  }

  it('derives error context with route identity first and body fallbacks second', () => {
    const headerRequest = new Request('http://127.0.0.1:3000/api/internal/coordinator/plans', {
      headers: { 'idempotency-key': 'header-key' },
    })
    expect(
      coordinatorErrorContext(headerRequest, ['plans', 'route-plan', 'baseline', 'start'], {
        planId: 'body-plan',
        idempotencyKey: 'body-key',
      }),
    ).toEqual({
      operation: 'plans/route-plan/baseline/start',
      operationName: 'route_baseline_start',
      planId: 'route-plan',
      idempotencyKey: 'header-key',
    })

    const bodyRequest = new Request('http://127.0.0.1:3000/api/internal/coordinator/delegated')
    expect(
      coordinatorErrorContext(bodyRequest, ['delegated'], {
        plan: { planId: 'nested-plan' },
        idempotencyKey: 'body-key',
      }),
    ).toEqual({ operation: 'delegated', planId: 'nested-plan', idempotencyKey: 'body-key' })
  })

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

  it('returns the validated versioned acknowledgement for void baseline regression mutations', async () => {
    const source = await fs.readFile(adapterPaths.api, 'utf8')
    expect(source).toMatch(
      /await justifyBaselineRegressionPass\([\s\S]*?return Response\.json\(coordinatorAcknowledgement\(\)\)/,
    )
    expect(source).not.toMatch(/Response\.json\(\s*await justifyBaselineRegressionPass/)
  })

  it('rejects malformed strict lifecycle DTOs for GET, POST, and PUT responses', () => {
    const malformed = {}
    expect(coordinatorSuccessSchema('GET', ['plans', 'plan-one', 'events']).safeParse(malformed).success).toBe(false)
    expect(
      coordinatorSuccessSchema('POST', ['plans', 'plan-one', 'baseline', 'start']).safeParse(malformed).success,
    ).toBe(false)
    expect(coordinatorSuccessSchema('PUT', ['plans', 'plan-one']).safeParse(malformed).success).toBe(false)
  })

  it('rejects malformed plan-critical read and mutation DTOs on every lifecycle branch', () => {
    const malformed = {}
    const cases: Array<['GET' | 'POST', string[]]> = [
      ['GET', ['plans', 'plan-one', 'health']],
      ['GET', ['plans', 'plan-one', 'validations', 'context']],
      ['GET', ['plans', 'plan-one', 'validations', 'resolver']],
      ['GET', ['plans', 'plan-one', 'completion']],
      ['POST', ['plans', 'plan-one', 'validations', 'feedback']],
      ['POST', ['plans', 'plan-one', 'validations', 'submit']],
      ['POST', ['plans', 'plan-one', 'validations', 'reconcile']],
      ['POST', ['plans', 'plan-one', 'validations', 'nodes', 'validation-one']],
      ['POST', ['plans', 'plan-one', 'validations', 'files']],
      ['POST', ['plans', 'plan-one', 'validations', 'ast', 'compile']],
      ['POST', ['plans', 'plan-one', 'implementation', 'start']],
      ['POST', ['plans', 'plan-one', 'implementation', 'checkpoint']],
      ['POST', ['plans', 'plan-one', 'implementation', 'tasks', 'task-one']],
      ['POST', ['plans', 'plan-one', 'implementation', 'groups']],
      ['POST', ['plans', 'plan-one', 'implementation', 'feedback']],
      ['POST', ['plans', 'plan-one', 'implementation', 'control']],
      ['POST', ['plans', 'plan-one', 'implementation', 'validations', 'start']],
      ['POST', ['plans', 'plan-one', 'implementation', 'validations', 'reconcile']],
      ['POST', ['plans', 'plan-one', 'implementation', 'validations', 'record']],
      ['POST', ['plans', 'plan-one', 'implementation', 'complete']],
    ]
    for (const [method, operation] of cases) {
      expect(coordinatorSuccessSchema(method, operation).safeParse(malformed).success).toBe(false)
    }
  })

  it('rejects malformed non-plan coordinator DTOs at the success boundary', () => {
    expect(coordinatorSuccessSchema('GET', ['diagnostic']).safeParse({ ok: true }).success).toBe(false)
    expect(
      coordinatorSuccessSchema('POST', ['target-projects']).safeParse({ targetProject: {}, git: { status: 'skipped' } })
        .success,
    ).toBe(false)
    expect(coordinatorSuccessSchema('POST', ['test-runs']).safeParse({ runId: 'run' }).success).toBe(false)
  })

  it('does not leave generic JSON-object success schemas on coordinator operation families', async () => {
    const formerGenericFamilies: Array<['GET' | 'POST', string[]]> = [
      ['GET', ['delegations', '00000000-0000-4000-8000-000000000000']],
      ['GET', ['test-runs', '00000000-0000-4000-8000-000000000000']],
      ['GET', ['operations', 'list']],
      ['GET', ['step-definitions', 'search']],
      ['GET', ['locator-graph', 'query']],
      ['GET', ['providers']],
      ['GET', ['provider-runs']],
      ['GET', ['quality', 'plans', 'quality-plan', 'requirements']],
      ['POST', ['delegations']],
      ['POST', ['step-definitions', 'drafts']],
      ['POST', ['objectives']],
      ['POST', ['coordination-slo']],
      ['POST', ['diagnostic', 'preflight']],
      ['POST', ['repository-exports']],
      ['POST', ['delegated', 'validation-ast-submissions']],
      ['POST', ['provider-runs']],
      ['POST', ['quality', 'plans', 'quality-plan', 'requirements', 'analyze']],
      ['POST', ['plans', 'plan-one', 'snapshot']],
      ['POST', ['plans', 'plan-one', 'continuation-package']],
      ['POST', ['providers', 'mock-planning', 'probe']],
      ['POST', ['register']],
      ['POST', ['heartbeat']],
    ]
    for (const [method, operation] of formerGenericFamilies) {
      expect(coordinatorSuccessSchema(method, operation).safeParse({}).success).toBe(false)
    }

    const source = await fs.readFile(adapterPaths.api, 'utf8')
    expect(source).not.toMatch(/coordinatorJsonObjectSchema/)
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
