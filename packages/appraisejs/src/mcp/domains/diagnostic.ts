import type { McpRegistryContext } from '../registry.js'
import {
  buildAgentPreflight,
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
        expectedTargetWorkspacePath: z.string().optional(),
      },
    },
    async ({ observedTools, observedResources, expectedTargetWorkspacePath }) => {
      const diagnostic = await diagnoseProject(options)
      return text(
        withGuidance(
          {
            ...compactProjectDiagnostic(diagnostic),
            agentPreflight: buildAgentPreflight(diagnostic, {
              observedTools,
              observedResources,
              expectedTargetWorkspacePath,
            }),
            capabilities: compactMcpCapabilityMetadata,
            capabilityStatus: 'available',
          },
          diagnosticGuidance(diagnostic),
        ),
      )
    },
  )

  server.registerTool(
    'coordinator_register',
    {
      description: 'Acquire or reconnect the single coordinator lease for a plan.',
      inputSchema: {
        planId: z.string(),
        reconnectConnectionId: z.string().optional(),
        takeoverApproved: z.boolean().optional(),
      },
    },
    async ({ planId, reconnectConnectionId, takeoverApproved }) =>
      text(
        await api.request('register', {
          method: 'POST',
          body: JSON.stringify({
            planId,
            coordinatorId: options.coordinatorId,
            reconnectConnectionId,
            takeoverApproved,
          }),
        }),
      ),
  )

  server.registerTool(
    'coordinator_heartbeat',
    {
      description: 'Renew an active coordinator lease.',
      inputSchema: { planId: z.string(), connectionId: z.string() },
    },
    async ({ planId, connectionId }) =>
      text(
        await api.request('heartbeat', {
          method: 'POST',
          body: JSON.stringify({ planId, coordinatorId: options.coordinatorId, connectionId }),
        }),
      ),
  )
}
