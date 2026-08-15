import type { McpRegistryContext } from '../registry.js'
import {
  buildAgentPreflight,
  canonicalExpectedTargetWorkspacePath,
  compactAgentPreflight,
  compactProjectDiagnostic,
  compactMcpCapabilityMetadata,
  diagnoseProject,
  diagnosticGuidance,
  text,
  withGuidance,
  z,
} from '../shared.js'

export function registerDiagnosticOperations(context: McpRegistryContext): void {
  const { server, api, options } = context
  server.registerTool(
    'project_diagnostic',
    {
      description:
        'Unified agent preflight for application reachability, authentication, project identity, current-task MCP capabilities, target binding, Git reproducibility, and contract compatibility.',
      inputSchema: {
        observedTools: z.array(z.string()).optional(),
        observedResources: z.array(z.string()).optional(),
        observedMcpSurfaceVersion: z.string().min(1).optional(),
        observedMcpContractHash: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/)
          .optional(),
        expectedTargetWorkspacePath: z.string().optional(),
      },
    },
    async ({
      observedTools,
      observedResources,
      observedMcpSurfaceVersion,
      observedMcpContractHash,
      expectedTargetWorkspacePath,
    }) => {
      const diagnostic = await diagnoseProject(options, {
        mcpSurfaceVersion: compactMcpCapabilityMetadata.mcpSurfaceVersion,
        mcpContractHash: compactMcpCapabilityMetadata.mcpContractHash,
      })
      const canonicalTargetWorkspacePath = await canonicalExpectedTargetWorkspacePath(expectedTargetWorkspacePath)
      const agentPreflight = buildAgentPreflight(diagnostic, {
        observedTools,
        observedResources,
        observedMcpSurfaceVersion,
        observedMcpContractHash,
        expectedTargetWorkspacePath: canonicalTargetWorkspacePath,
      })
      const preflightReceipt = await api.request('diagnostic/preflight', {
        method: 'POST',
        body: JSON.stringify({
          coordinatorId: options.coordinatorId,
          expectedTargetWorkspacePath: canonicalTargetWorkspacePath,
          preflight: agentPreflight,
          capabilities: {
            mcpSurfaceVersion: compactMcpCapabilityMetadata.mcpSurfaceVersion,
            mcpContractHash: compactMcpCapabilityMetadata.mcpContractHash,
            serverStartedAt: compactMcpCapabilityMetadata.serverStartedAt,
          },
        }),
      })
      return text(
        withGuidance(
          {
            ...compactProjectDiagnostic(diagnostic),
            agentPreflight: compactAgentPreflight(agentPreflight),
            preflightReceipt,
            capabilities: compactMcpCapabilityMetadata,
            capabilityStatus: 'available',
          },
          diagnosticGuidance(diagnostic, agentPreflight),
        ),
      )
    },
  )
}
