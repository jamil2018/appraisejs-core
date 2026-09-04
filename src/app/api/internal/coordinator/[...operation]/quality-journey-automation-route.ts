import { z } from 'zod'

import {
  getQualityJourneyAutomationContext,
  materializeQualityJourneyApprovedScenarios,
} from '@/services/coordinator/quality-journey-automation-service'
import { automationMaterializationRequestSchema } from '@/lib/quality-journey'
import { resolveTargetProject } from '@/services/target-project/target-project-service'

const target = z.string().min(1)
const materialize = z.object({ target }).passthrough()

function matches(operation: string[]) {
  return (
    operation.length === 5 && operation[0] === 'quality' && operation[1] === 'journeys' && operation[3] === 'automation'
  )
}

export async function postQualityJourneyAutomationRoute(
  operation: string[],
  body: unknown,
): Promise<Response | undefined> {
  if (!matches(operation) || operation[4] !== 'materializations') return undefined
  const { target: targetIdentifier, ...value } = materialize.parse(body)
  const resolved = await resolveTargetProject(targetIdentifier)
  const request = automationMaterializationRequestSchema.parse({
    ...value,
    journeyId: operation[2]!,
    targetProjectId: resolved.id,
  })
  return Response.json(await materializeQualityJourneyApprovedScenarios(request), { status: 201 })
}

export async function getQualityJourneyAutomationRoute(
  operation: string[],
  parameters: URLSearchParams,
): Promise<Response | undefined> {
  if (!matches(operation) || operation[4] !== 'context') return undefined
  const resolved = await resolveTargetProject(target.parse(parameters.get('target')))
  return Response.json(
    await getQualityJourneyAutomationContext({ journeyId: operation[2]!, targetProjectId: resolved.id }),
  )
}
