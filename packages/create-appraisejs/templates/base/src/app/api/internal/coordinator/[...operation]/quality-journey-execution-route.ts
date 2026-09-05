import { z } from 'zod'
import {
  qualityJourneyExecutionStartSchema,
  qualityJourneyExecutionCancelSchema,
  qualityJourneyExecutionReconcileSchema,
  qualityJourneyRerunProposalSchema,
  qualityJourneyRerunStartSchema,
} from '@/lib/quality-journey'
import {
  startQualityJourneyExecution,
  getQualityJourneyExecution,
  cancelQualityJourneyExecution,
  reconcileQualityJourneyExecution,
  proposeQualityJourneyRerun,
  startQualityJourneyRerun,
} from '@/services/coordinator/quality-journey-execution-service'
import { ServiceError } from '@/services/shared/errors'
import { resolveTargetProject } from '@/services/target-project/target-project-service'

const envelope = z.object({ target: z.string().min(1) }).passthrough()
const operations = {
  start: { schema: qualityJourneyExecutionStartSchema, run: startQualityJourneyExecution },
  cancel: { schema: qualityJourneyExecutionCancelSchema, run: cancelQualityJourneyExecution },
  reconcile: { schema: qualityJourneyExecutionReconcileSchema, run: reconcileQualityJourneyExecution },
  'rerun-proposals': { schema: qualityJourneyRerunProposalSchema, run: proposeQualityJourneyRerun },
  'rerun-start': { schema: qualityJourneyRerunStartSchema, run: startQualityJourneyRerun },
} as const

function matches(operation: string[]) {
  return (
    operation.length === 5 && operation[0] === 'quality' && operation[1] === 'journeys' && operation[3] === 'execution'
  )
}

export async function postQualityJourneyExecutionRoute(
  operation: string[],
  body: unknown,
): Promise<Response | undefined> {
  if (!matches(operation)) return undefined
  const action = operations[operation[4] as keyof typeof operations]
  if (!action) return undefined
  const { target, ...input } = envelope.parse(body)
  if ('journeyId' in input || 'targetProjectId' in input || 'actor' in input || 'grantSource' in input)
    throw new ServiceError('Execution scope and authority are resolved by Appraise.', 'UNAUTHORIZED')
  const resolved = await resolveTargetProject(target)
  const request = action.schema.parse({ ...input, journeyId: operation[2]!, targetProjectId: resolved.id })
  return Response.json(await action.run(request))
}

export async function getQualityJourneyExecutionRoute(
  operation: string[],
  parameters: URLSearchParams,
): Promise<Response | undefined> {
  if (!matches(operation) || operation[4] !== 'context') return undefined
  const target = await resolveTargetProject(z.string().min(1).parse(parameters.get('target')))
  return Response.json(
    await getQualityJourneyExecution({
      journeyId: operation[2]!,
      targetProjectId: target.id,
      ...(parameters.get('cycleId') ? { cycleId: parameters.get('cycleId')! } : {}),
    }),
  )
}
