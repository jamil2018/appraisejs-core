import type { McpRegistryContext } from '../registry.js'
import {
  compactProjectDiagnostic,
  diagnoseProject,
  diagnosticGuidance,
  mcpCapabilityMetadata,
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
        'Verify application/API reachability, authentication, project identity, Git reproducibility, and contract compatibility.',
      inputSchema: {},
    },
    async () => {
      const diagnostic = await diagnoseProject(options)
      return text(
        withGuidance(
          {
            ...compactProjectDiagnostic(diagnostic),
            capabilities: mcpCapabilityMetadata,
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
