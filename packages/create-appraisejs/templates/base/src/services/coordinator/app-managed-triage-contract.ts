import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { qualityJourneyTriageEvidenceReadSchema, qualityJourneyTriageReportSchema } from '@/lib/quality-journey'
import type { CanonicalMcpDefinition } from '@/lib/quality-journey/managed-worker-gateway'

const idempotencyKey = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const appManagedTriageReportContentSchema = qualityJourneyTriageReportSchema.omit({
  schemaVersion: true,
  reportRevisionId: true,
  executionCycleId: true,
  cycleId: true,
  predecessorReportRevisionId: true,
  inputHash: true,
})
export const appManagedTriageOutputSchema = z
  .object({
    toolName: z.literal('quality_journey_triage_submit'),
    arguments: z.object({ idempotencyKey, report: appManagedTriageReportContentSchema }).strict(),
  })
  .strict()

export const appManagedTriageDefinitions: readonly CanonicalMcpDefinition[] = [
  { kind: 'tool', name: 'quality_journey_triage_get', inputSchema: zodToJsonSchema(z.object({}).strict()) },
  {
    kind: 'tool',
    name: 'quality_journey_triage_evidence_read',
    inputSchema: zodToJsonSchema(
      qualityJourneyTriageEvidenceReadSchema.pick({
        receiptId: true,
        artifactKind: true,
        offset: true,
        limit: true,
      }),
    ),
  },
  {
    kind: 'tool',
    name: 'quality_journey_triage_submit',
    inputSchema: zodToJsonSchema(
      z
        .object({
          idempotencyKey,
          report: qualityJourneyTriageReportSchema.omit({ inputHash: true }),
        })
        .strict(),
    ),
  },
]
