import { z } from 'zod'

import {
  getQualityJourneyAutomationContext,
  materializeExternalQualityJourneyApprovedScenarios,
  materializeQualityJourneyApprovedScenarios,
} from '@/services/coordinator/quality-journey-automation-service'
import { automationMaterializationRequestSchema } from '@/lib/quality-journey'
import { resolveTargetProject } from '@/services/target-project/target-project-service'
import { ServiceError } from '@/services/shared/errors'
import type { CoordinatorSessionCredentials } from '@/services/coordinator/quality-journey-coordinator-session'
import type { ExternalAnalyzerProjectPrincipal } from '@/services/coordinator/quality-journey-service'

const target = z.string().min(1)
const materialize = z.object({ target }).passthrough()

function assertResolvedAuthority(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return
  for (const field of ['journeyId', 'targetProjectId']) {
    if (Object.hasOwn(body, field)) throw new ServiceError(`Automation ${field} is resolved by Appraise.`, 'VALIDATION')
  }
}

function matches(operation: string[]) {
  return (
    operation.length === 5 && operation[0] === 'quality' && operation[1] === 'journeys' && operation[3] === 'automation'
  )
}

export async function postQualityJourneyAutomationRoute(
  operation: string[],
  body: unknown,
  coordinatorSession?: CoordinatorSessionCredentials,
  principal?: ExternalAnalyzerProjectPrincipal,
): Promise<Response | undefined> {
  if (!matches(operation) || (operation[4] !== 'materializations' && operation[4] !== 'external-materializations'))
    return undefined
  assertResolvedAuthority(body)
  const { target: targetIdentifier, ...value } = materialize.parse(body)
  const resolved = await resolveTargetProject(targetIdentifier)
  const request = {
    ...value,
    journeyId: operation[2]!,
    targetProjectId: resolved.id,
  }
  if (operation[4] === 'external-materializations') {
    if (!principal) throw new ServiceError('External project principal is unavailable.', 'UNAUTHORIZED')
    return Response.json(
      await materializeExternalQualityJourneyApprovedScenarios(request, principal, undefined, coordinatorSession),
      { status: 201 },
    )
  }
  return Response.json(
    await materializeQualityJourneyApprovedScenarios(
      automationMaterializationRequestSchema.parse(request),
      undefined,
      coordinatorSession,
    ),
    {
      status: 201,
    },
  )
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
