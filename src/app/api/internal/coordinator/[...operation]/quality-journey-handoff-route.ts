import { z } from 'zod'

import { inspectQualityJourneyHandoff } from '@/services/coordinator/quality-journey-handoff-service'
import { resolveTargetProject } from '@/services/target-project/target-project-service'

export async function getQualityJourneyHandoffRoute(operation: string[], parameters: URLSearchParams) {
  if (operation[1] !== 'journeys' || operation[3] !== 'handoff' || operation.length !== 4) return null
  const target = await resolveTargetProject(z.string().min(1).parse(parameters.get('target')))
  return Response.json(await inspectQualityJourneyHandoff({ journeyId: operation[2]!, targetProjectId: target.id }))
}

export async function postQualityJourneyHandoffRoute(operation: string[]) {
  if (operation.join('/') !== `quality/journeys/${operation[2]}/handoff/redeem`) return null
  return Response.json({ error: 'Desktop handoff has been retired. Open this Journey in AppraiseJS.' }, { status: 410 })
}
