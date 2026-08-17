import { z } from 'zod'

const agentPreflightLayerStatusSchema = z.enum(['ready', 'blocked', 'unverified', 'not_applicable'])

const observedCapabilitySchema = z.object({
  status: z.enum(['ready', 'blocked', 'unverified']),
  missing: z.array(z.string()),
})

export const agentPreflightSchema = z.object({
  schemaVersion: z.literal('appraise.agent-preflight/v1'),
  status: z.enum(['ready', 'blocked', 'needs_observation']),
  ready: z.boolean(),
  layers: z.object({
    applicationAndIdentity: z.object({
      status: agentPreflightLayerStatusSchema,
      checks: z
        .array(
          z.object({
            id: z.string(),
            status: z.string(),
            code: z.string().optional(),
          }),
        )
        .default([]),
    }),
    activeMcpTransport: z.object({
      status: agentPreflightLayerStatusSchema,
      message: z.string().default('The MCP request reached this server.'),
      serverStartedAt: z.string().datetime(),
      mcpSurfaceVersion: z.string().min(1),
      mcpContractHash: z
        .string()
        .regex(/^sha256:[a-f0-9]{64}$/)
        .optional(),
    }),
    contractCompatibility: z
      .object({
        status: z.enum(['ready', 'stale', 'unverified']),
        expected: z.object({
          mcpSurfaceVersion: z.string().min(1),
          mcpContractHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
        }),
        observed: z.object({
          mcpSurfaceVersion: z.string().min(1).optional(),
          mcpContractHash: z
            .string()
            .regex(/^sha256:[a-f0-9]{64}$/)
            .optional(),
        }),
        message: z.string().min(1),
        reconnect: z.object({
          required: z.boolean(),
          action: z.string().min(1).optional(),
          reason: z.string().min(1).optional(),
        }),
      })
      .optional(),
    currentTaskCapabilities: z.object({
      status: agentPreflightLayerStatusSchema,
      tools: observedCapabilitySchema,
      resources: observedCapabilitySchema,
      message: z.string().default('Capability status was recorded from the current task observation.'),
    }),
    targetProjectBinding: z.object({
      status: agentPreflightLayerStatusSchema,
      expectedCanonicalPath: z.string().optional(),
      matchedScope: z.enum(['hub', 'target']).optional(),
      message: z.string().default('Target binding status was recorded from the current diagnostic.'),
    }),
  }),
  recovery: z.unknown().optional(),
})

export type AgentPreflight = z.infer<typeof agentPreflightSchema>

export const agentPreflightReceiptInputSchema = z.object({
  coordinatorId: z.string().min(1).max(200),
  expectedTargetWorkspacePath: z.string().min(1).optional(),
  preflight: agentPreflightSchema,
  capabilities: z.object({
    mcpSurfaceVersion: z.string().min(1),
    mcpContractHash: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .optional(),
    serverStartedAt: z.string().datetime(),
  }),
})

export type AgentPreflightReceiptInput = z.infer<typeof agentPreflightReceiptInputSchema>

export type AgentPreflightReceiptSummary = {
  id: string
  coordinatorId: string
  status: AgentPreflight['status']
  ready: boolean
  snapshotHash: string
  targetProjectId: string | null
  observedAt: Date
  mcpSurfaceVersion: string
  mcpServerStartedAt: Date
  preflight: AgentPreflight
}
