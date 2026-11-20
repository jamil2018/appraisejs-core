import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import {
  resourceResolutionBundleSchema,
  targetObservationBundleSchema,
} from '@/lib/quality-journey/discovery-contracts'
import type { CanonicalMcpDefinition } from '@/lib/quality-journey/managed-worker-gateway'

export const managedDiscoveryRoleSchema = z.enum(['SCOUT', 'RESOURCE_EXPLORER'])
export type ManagedDiscoveryRole = z.infer<typeof managedDiscoveryRoleSchema>
const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const scoutBundle = targetObservationBundleSchema.innerType()
const resourceBundle = resourceResolutionBundleSchema.innerType()
const envelope = { discoveryRevisionId: id, idempotencyKey: id }
/** The gateway derives the public schema and injects principal fields from these canonical contracts. */
export const appManagedDiscoveryDefinitions: readonly CanonicalMcpDefinition[] = [
  { kind: 'tool', name: 'quality_journey_discovery_get', inputSchema: zodToJsonSchema(z.object({}).strict()) },
  {
    kind: 'tool',
    name: 'quality_journey_target_observation_submit',
    inputSchema: zodToJsonSchema(z.object({ ...envelope, bundle: scoutBundle.omit({ schemaVersion: true }) }).strict()),
  },
  {
    kind: 'tool',
    name: 'quality_journey_resource_resolution_submit',
    inputSchema: zodToJsonSchema(
      z.object({ ...envelope, bundle: resourceBundle.omit({ schemaVersion: true }) }).strict(),
    ),
  },
]
