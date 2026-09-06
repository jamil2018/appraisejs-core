import { z } from 'zod'

import {
  inspectQualityJourneyHandoff,
  redeemQualityJourneyHandoff,
} from '@/services/coordinator/quality-journey-handoff-service'
import { resolveTargetProject } from '@/services/target-project/target-project-service'

export async function getQualityJourneyHandoffRoute(operation: string[], parameters: URLSearchParams) {
  if (operation[1] !== 'journeys' || operation[3] !== 'handoff' || operation.length !== 4) return null
  const target = await resolveTargetProject(z.string().min(1).parse(parameters.get('target')))
  return Response.json(await inspectQualityJourneyHandoff({ journeyId: operation[2]!, targetProjectId: target.id }))
}

export async function postQualityJourneyHandoffRoute(operation: string[], body: unknown) {
  if (operation.join('/') !== `quality/journeys/${operation[2]}/handoff/redeem`) return null
  const value = z
    .object({ target: z.string().min(1), ticket: z.string().regex(/^qjh_[A-Za-z0-9_-]{32}$/) })
    .strict()
    .parse(body)
  const target = await resolveTargetProject(value.target)
  return Response.json(
    await redeemQualityJourneyHandoff({ journeyId: operation[2]!, targetProjectId: target.id, ticket: value.ticket }),
  )
}
