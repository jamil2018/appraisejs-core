import { z } from 'zod'
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
export const appManagedAnalysisCorrectionIssuanceSchema = z
  .object({
    schemaVersion: z.literal('appraise.analysis-correction-issuance/v1'),
    workItemId: z.string(),
    cycleId: z.string(),
    predecessorAttemptId: z.string(),
    predecessorWorkItemId: z.string(),
    predecessorAssignmentHash: digest,
    predecessorAuthorizationId: z.string(),
    authorizationId: z.string(),
    inputHash: digest,
    inputArtifactRefsJson: z.string(),
    advisoryInputRefsJson: z.string(),
    failureJson: z.string(),
    failureHash: digest,
    successorAttempt: z.number().int().positive(),
    issuedWorkItemVersion: z.number().int().nonnegative(),
    coordinatorSessionId: z.string(),
    coordinatorGeneration: z.number().int().positive(),
    dispatchReservedAt: z.string(),
    dispatchStartedAt: z.string(),
    diagnostics: z.object({ stage: z.string(), detail: z.string().optional(), rejection: z.unknown().optional() }),
  })
  .strict()
