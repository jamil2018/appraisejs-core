import type { McpRegistryContext } from '../registry.js'
import {
  applyAuthoringResponseMode,
  providerNativeRunsEnabled,
  responseModeSchema,
  text,
  toolError,
  withGuidance,
  z,
} from '../shared.js'
import type { ValidationAstSubmission } from '../shared.js'

export function registerProjectOperations(context: McpRegistryContext): void {
  const { server, api } = context
  server.registerTool(
    'locator_graph_query',
    {
      description: 'Query a bounded locator graph path from a surface, group, or locator node.',
      inputSchema: {
        fromId: z.string().min(1),
        relation: z.string().optional(),
        toType: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.number().int().positive().max(100).optional(),
        depth: z.number().int().positive().max(4).optional(),
      },
    },
    async input => text(await api.queryLocatorGraph(input)),
  )

  server.registerTool(
    'delegation_create',
    {
      description: 'Issue durable target- and operation-bounded authority to an isolated delegated coordinator.',
      inputSchema: {
        parentCoordinatorId: z.string(),
        delegatedCoordinatorId: z.string(),
        targetProjectId: z.string().optional(),
        targetFingerprint: z.string(),
        pathFingerprint: z.string(),
        purpose: z.string(),
        permissions: z.array(
          z.enum([
            'target_project_register',
            'plan_create',
            'validation_prepare',
            'baseline_execute',
            'implementation_execute',
          ]),
        ),
        prohibitions: z.array(z.string()).optional(),
        briefOrPlanHash: z.string().optional(),
        expiresAt: z.string(),
      },
    },
    async input => text(await api.request('delegations', { method: 'POST', body: JSON.stringify(input) })),
  )

  server.registerTool(
    'delegation_read',
    {
      description: 'Read a delegation receipt and its consumption/revocation audit history.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => text(await api.request(`delegations/${id}`)),
  )

  server.registerTool(
    'delegation_revoke',
    {
      description: 'Revoke delegated coordinator authority immediately.',
      inputSchema: { id: z.string(), revokedBy: z.string(), reason: z.string().optional() },
    },
    async ({ id, ...body }) =>
      text(await api.request(`delegations/${id}/revoke`, { method: 'POST', body: JSON.stringify(body) })),
  )

  for (const phase of ['check', 'preview'] as const) {
    server.registerTool(
      `validation_ast_${phase}`,
      {
        description: `${phase} a bounded Validation AST against authoritative plan, catalog, locator, and environment context.`,
        inputSchema: { planId: z.string(), submission: z.unknown(), responseMode: responseModeSchema },
      },
      async ({ planId, submission, responseMode }) =>
        text(
          applyAuthoringResponseMode(
            await api[phase === 'check' ? 'checkValidationAst' : 'previewValidationAst'](
              planId,
              submission as ValidationAstSubmission,
            ),
            responseMode,
          ),
        ),
    )
  }

  server.registerTool(
    'project_add',
    {
      description:
        'Attach an application workspace as a target project, optionally initialize Git when the workspace is empty, and write a non-blocking .appraisejs/project.json continuity marker when writable.',
      inputSchema: {
        path: z.string().min(1),
        displayName: z.string().min(1).optional(),
        initializeGit: z.boolean().optional(),
      },
    },
    async ({ path, displayName, initializeGit }) => {
      try {
        return text(
          withGuidance(await api.addTargetProject(path, displayName, initializeGit), {
            nextRecommendedAction:
              'Use the returned target project id, fingerprint, display name, or canonical path as plan_create target.',
          }),
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'project_list',
    {
      description: 'List application repositories attached to the local AppraiseJS hub.',
      inputSchema: {},
    },
    async () => text(await api.listTargetProjects()),
  )

  if (providerNativeRunsEnabled()) {
    server.registerTool(
      'provider_list',
      {
        description: 'List built-in coding agent providers, registration state, probe status, and launchability.',
        inputSchema: {},
      },
      async () => {
        try {
          return text(await api.listProviders())
        } catch (error) {
          return toolError(error)
        }
      },
    )
    server.registerTool(
      'provider_probe',
      {
        description: 'Probe a built-in coding agent provider executable without storing secrets.',
        inputSchema: { providerKey: z.string().min(1) },
      },
      async ({ providerKey }) => {
        try {
          return text(await api.probeProvider(providerKey))
        } catch (error) {
          return toolError(error)
        }
      },
    )
    server.registerTool(
      'provider_update',
      {
        description:
          'Update non-secret coding agent registration settings such as executable override and enabled state.',
        inputSchema: {
          providerKey: z.string().min(1),
          executablePath: z.string().nullable().optional(),
          defaultProfile: z.string().nullable().optional(),
          defaultModel: z.string().nullable().optional(),
          enabled: z.boolean().optional(),
          launchEnabled: z.boolean().optional(),
          settings: z.record(z.string(), z.unknown()).nullable().optional(),
        },
      },
      async ({ providerKey, ...input }) => {
        try {
          return text(await api.updateProvider(providerKey, input))
        } catch (error) {
          return toolError(error)
        }
      },
    )
    server.registerTool(
      'provider_run_create',
      {
        description:
          'Create a planning-only Appraise-owned provider run for an attached target project. This does not approve plans, validation, baseline, implementation, or completion gates.',
        inputSchema: {
          targetProjectId: z.string().uuid(),
          planId: z.string().min(1).optional(),
          providerKey: z.string().min(1).optional(),
          providerProfile: z.string().min(1).optional(),
          launchPrompt: z.string().trim().min(1),
        },
      },
      async input => {
        try {
          return text(
            withGuidance(await api.createProviderRun(input), {
              nextRecommendedAction:
                'Read the provider run, present its event stream, then continue through Appraise plan review or validation gates only when durable Appraise state allows it.',
              nextRequiredAgentBehavior: 'respect_appraise_lifecycle_gates',
            }),
          )
        } catch (error) {
          return toolError(error)
        }
      },
    )
    server.registerTool(
      'provider_run_read',
      {
        description:
          'Read an Appraise-owned provider run with event, permission, artifact, and target-project context.',
        inputSchema: { runId: z.string().uuid() },
      },
      async ({ runId }) => {
        try {
          return text(await api.readProviderRun(runId))
        } catch (error) {
          return toolError(error)
        }
      },
    )
    server.registerTool(
      'provider_run_cancel',
      {
        description:
          'Cancel a provider execution attempt. Cancellation updates provider-run status only; plan lifecycle cancellation remains Appraise-owned.',
        inputSchema: { runId: z.string().uuid() },
      },
      async ({ runId }) => {
        try {
          return text(await api.cancelProviderRun(runId))
        } catch (error) {
          return toolError(error)
        }
      },
    )
    server.registerTool(
      'provider_permission_decide',
      {
        description:
          'Record a user-visible provider permission decision for a provider run without bypassing Appraise lifecycle gates.',
        inputSchema: {
          runId: z.string().uuid(),
          requestId: z.string().min(1),
          decision: z.enum(['approved', 'denied']),
          riskTier: z.string().min(1),
          requestedScope: z.string().min(1),
          payload: z.record(z.string(), z.unknown()).optional(),
          reason: z.string().optional(),
          decidedBy: z.string().min(1).default('mcp-client'),
        },
      },
      async ({ runId, ...input }) => {
        try {
          return text(await api.decideProviderPermission(runId, input))
        } catch (error) {
          return toolError(error)
        }
      },
    )
  }

  server.registerTool(
    'appraise_resources_list',
    {
      description:
        'List live reusable Appraise resources for validation authoring. This is equivalent to the resources section of validation_context_read.',
      inputSchema: { planId: z.string() },
    },
    async ({ planId }) => {
      const context = (await api.request(`plans/${planId}/validations/context`)) as { resources?: unknown }
      return text({
        resources: context.resources,
        nextRecommendedAction: 'Use resource IDs or names in draft proposals.',
      })
    },
  )

  server.registerTool(
    'step_search',
    {
      description:
        'Search ready Step Definitions by one actionable versioned identity with human, agent, and execution-readiness projections.',
      inputSchema: {
        planId: z.string(),
        query: z.string().min(1),
        parameterNames: z.array(z.string().min(1)).default([]),
        limit: z.number().int().positive().max(25).default(5),
      },
    },
    async ({ planId, query, parameterNames, limit }) =>
      text(
        await api.request(
          `step-definitions/search?planId=${encodeURIComponent(planId)}&query=${encodeURIComponent(query)}&parameterNames=${encodeURIComponent(parameterNames.join(','))}&limit=${limit}&surface=agent`,
        ),
      ),
  )

  server.registerTool(
    'locator_search',
    {
      description: 'Search live locators before proposing new locator resources.',
      inputSchema: { planId: z.string(), query: z.string().min(1) },
    },
    async ({ planId, query }) => {
      const context = (await api.request(
        `plans/${planId}/validations/context?resourceTypes=locators,locatorGroups&query=${encodeURIComponent(query)}&limit=25`,
      )) as {
        resources?: { locators?: Array<Record<string, unknown>>; locatorGroups?: Array<Record<string, unknown>> }
      }
      return text({
        locators: context.resources?.locators ?? [],
        locatorGroups: context.resources?.locatorGroups ?? [],
        nextRecommendedAction: 'Reuse a matching locatorRef or locatorGroupRef when possible.',
      })
    },
  )

  server.registerTool(
    'objective_create',
    {
      description: 'Create a bounded objective of independently reviewable milestone-scoped plans.',
      inputSchema: {
        objectiveId: z.string().optional(),
        title: z.string().min(1).max(160),
        milestones: z
          .array(z.object({ id: z.string(), title: z.string().min(1) }))
          .min(1)
          .max(24),
        plans: z
          .array(
            z.object({
              planId: z.string(),
              milestoneId: z.string(),
              dependsOn: z.array(z.string()).optional(),
              impactedPaths: z.array(z.string()).optional(),
            }),
          )
          .min(1)
          .max(24),
      },
    },
    async input => text(await api.createObjective(input)),
  )

  server.registerTool(
    'coordination_slo_evaluate',
    {
      description: 'Evaluate active Appraise/agent time and coordination budgets separately from human review.',
      inputSchema: {
        phases: z.array(
          z.object({
            phase: z.string(),
            activeAppraiseMs: z.number().int().nonnegative(),
            activeAgentMs: z.number().int().nonnegative(),
            humanReviewMs: z.number().int().nonnegative(),
          }),
        ),
        responseBytes: z.array(z.number().int().nonnegative()),
        operations: z.number().int().nonnegative(),
        retries: z.number().int().nonnegative(),
        approvals: z.number().int().nonnegative(),
      },
    },
    async input => text(await api.evaluateCoordinationSlo(input)),
  )

  server.registerTool(
    'operation_categories',
    {
      description: 'List bounded canonical operation categories; known manifest hashes return unchanged.',
      inputSchema: { knownManifestHash: z.string().optional() },
    },
    async input => text(await api.listOperationCategories(input.knownManifestHash)),
  )

  server.registerTool(
    'operation_search',
    {
      description:
        'Search the low-level canonical operation catalog with paired human Step naming. Prefer step_search when a planId is available so user-authored steps participate too.',
      inputSchema: {
        query: z.string().min(1).max(500),
        parameterNames: z.array(z.string().min(1)).max(32).optional(),
        category: z.string().optional(),
        capability: z.string().optional(),
        inputType: z.string().optional(),
        runtime: z.enum(['browser', 'api', 'node', 'database']).optional(),
        surface: z.enum(['human', 'agent']).optional(),
        deprecated: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async input => text(await api.searchOperations(input)),
  )

  server.registerTool(
    'operation_read',
    {
      description: 'Read exact canonical operation descriptors and handler identities for selected references.',
      inputSchema: {
        operationRefs: z
          .array(z.object({ id: z.string(), version: z.string().optional() }))
          .min(1)
          .max(50),
      },
    },
    async ({ operationRefs }) => text(await api.readOperations(operationRefs)),
  )
}
