import { z } from 'zod'
import {
  exportQualityJourney,
  getQualityJourneyLibraryArtifact,
  listQualityJourneyArtifactLibrary,
} from '@/services/coordinator/quality-journey-artifact-library-service'
import { resolveTargetProject } from '@/services/target-project/target-project-service'

const querySchema = z
  .object({
    target: z.string().min(1),
    kind: z.string().min(1).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict()

export async function getQualityJourneyLibraryRoute(
  operation: string[],
  parameters: URLSearchParams,
): Promise<Response | undefined> {
  if (operation.slice(0, 2).join('/') !== 'quality/journeys') return undefined
  const library = operation[3] === 'library' && [4, 5].includes(operation.length)
  const exporting = operation[3] === 'export' && operation.length === 4
  if (!library && !exporting) return undefined
  const query = querySchema.parse(Object.fromEntries(parameters))
  const target = await resolveTargetProject(query.target)
  const scope = { journeyId: operation[2]!, targetProjectId: target.id }
  if (exporting) return Response.json(await exportQualityJourney(scope))
  if (operation.length === 5)
    return Response.json(await getQualityJourneyLibraryArtifact({ ...scope, entryId: operation[4]! }))
  return Response.json(
    await listQualityJourneyArtifactLibrary({ ...scope, kind: query.kind, offset: query.offset, limit: query.limit }),
  )
}
