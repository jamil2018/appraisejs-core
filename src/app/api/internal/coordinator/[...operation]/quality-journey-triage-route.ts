import { z } from 'zod'

import {
  qualityJourneyTriageEvidenceReadSchema,
  qualityJourneyTriagePrepareSchema,
  qualityJourneyTriageSubmitSchema,
} from '@/lib/quality-journey'
import { readQualityJourneyTriageEvidence } from '@/services/coordinator/quality-journey-triage-evidence-service'
import {
  getQualityJourneyTriage,
  prepareQualityJourneyTriage,
  submitQualityJourneyTriageReport,
} from '@/services/coordinator/quality-journey-triage-service'
import { ServiceError } from '@/services/shared/errors'
import { resolveTargetProject } from '@/services/target-project/target-project-service'

const target = z.string().min(1)
const envelope = z.object({ target }).passthrough()

function matches(operation: string[]) {
  return operation.length === 5 && operation.slice(0, 2).join('/') === 'quality/journeys' && operation[3] === 'triage'
}

function scopedRequest(
  value: Record<string, unknown>,
  journeyId: string,
  targetProjectId: string,
): Record<string, unknown> {
  if (
    'journeyId' in value ||
    'targetProjectId' in value ||
    'actor' in value ||
    'feedbackScope' in value ||
    'storedPath' in value
  )
    throw new ServiceError('Triage scope and review authority are resolved by Appraise.', 'UNAUTHORIZED')
  return { ...value, journeyId, targetProjectId }
}

export async function getQualityJourneyTriageRoute(
  operation: string[],
  parameters: URLSearchParams,
): Promise<Response | undefined> {
  if (!matches(operation)) return undefined
  if (operation[4] !== 'context') return undefined
  const resolved = await resolveTargetProject(target.parse(parameters.get('target')))
  return Response.json(await getQualityJourneyTriage({ journeyId: operation[2]!, targetProjectId: resolved.id }))
}

export async function postQualityJourneyTriageRoute(operation: string[], body: unknown): Promise<Response | undefined> {
  if (!matches(operation)) return undefined
  const action = operation[4]
  if (action !== 'prepare' && action !== 'submit' && action !== 'evidence') return undefined
  const { target: targetRef, ...input } = envelope.parse(body)
  const unbound = scopedRequest(input, operation[2]!, '')
  const resolved = await resolveTargetProject(targetRef)
  const scoped = { ...unbound, targetProjectId: resolved.id }
  if (action === 'evidence')
    return Response.json(await readQualityJourneyTriageEvidence(qualityJourneyTriageEvidenceReadSchema.parse(scoped)))
  if (action === 'prepare')
    return Response.json(await prepareQualityJourneyTriage(qualityJourneyTriagePrepareSchema.parse(scoped)))
  return Response.json(await submitQualityJourneyTriageReport(qualityJourneyTriageSubmitSchema.parse(scoped)), {
    status: 201,
  })
}
