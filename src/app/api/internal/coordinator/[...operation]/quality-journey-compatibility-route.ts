import { z } from 'zod'

import { readQualityJourneyCompatibility } from '@/services/coordinator/quality-journey-compatibility-service'
import { resolveTargetProject } from '@/services/target-project/target-project-service'

const querySchema = z
  .object({
    target: z.string().min(1),
    qualityPlanId: z.string().min(1).max(200).optional(),
    revisionId: z.string().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.qualityPlanId) !== Boolean(value.revisionId))
      context.addIssue({
        code: 'custom',
        message: 'qualityPlanId and revisionId must be supplied together.',
        path: ['qualityPlanId'],
      })
  })

export async function getQualityJourneyCompatibilityRoute(
  operation: string[],
  parameters: URLSearchParams,
): Promise<Response | undefined> {
  if (operation.join('/') !== 'quality/compatibility') return undefined
  const query = querySchema.parse(Object.fromEntries(parameters))
  const target = await resolveTargetProject(query.target)
  return Response.json(
    await readQualityJourneyCompatibility({
      targetProjectId: target.id,
      qualityPlanId: query.qualityPlanId,
      revisionId: query.revisionId,
      offset: query.offset,
      limit: query.limit,
    }),
  )
}
