'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireActiveProjectForMutation } from '@/lib/active-project'
import {
  getAppManagedAnalysisRetainedRecovery,
  recoverAppManagedAnalysisRetained,
} from '@/services/coordinator/app-managed-analysis-retained-recovery'
import {
  getAppManagedAnalysisCorrection,
  issueAppManagedAnalysisCorrection,
} from '@/services/coordinator/app-managed-analysis-correction'
import { scheduleAppManagedJourneyContinuation } from '@/services/coordinator/app-managed-progression-service'
import { ServiceError, serviceErrorToActionResponse } from '@/services/shared/errors'

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const scope = z.object({ journeyId: z.string().min(1).max(200), expectedStateHash: digest }).strict()
const choice = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('saved'), attemptId: z.string().min(1).max(200), candidateHash: digest }).strict(),
  z.object({ kind: z.literal('replacement'), attemptId: z.string().min(1).max(200), failureHash: digest }).strict(),
])
export type AnalysisRecoveryChoice = z.infer<typeof choice>

export async function readJourneyAnalysisRecovery(input: unknown): Promise<AnalysisRecoveryChoice | null> {
  const request = scope.parse(input)
  const project = await requireActiveProjectForMutation()
  const binding = { ...request, targetProjectId: project.id }
  const saved = await getAppManagedAnalysisRetainedRecovery(binding)
  if (saved) return { kind: 'saved', attemptId: saved.attemptId, candidateHash: saved.candidateHash }
  const replacement = await getAppManagedAnalysisCorrection(binding)
  return replacement
    ? { kind: 'replacement', attemptId: replacement.attemptId, failureHash: replacement.failureHash }
    : null
}

export async function resumeJourneyAnalysis(input: unknown) {
  try {
    const { recovery, ...request } = scope.extend({ recovery: choice }).strict().parse(input)
    const project = await requireActiveProjectForMutation()
    const binding = { ...request, targetProjectId: project.id }
    if (recovery.kind === 'saved') {
      await recoverAppManagedAnalysisRetained({
        ...binding,
        attemptId: recovery.attemptId,
        candidateHash: recovery.candidateHash,
      })
    } else {
      const issuance = await issueAppManagedAnalysisCorrection({
        ...binding,
        attemptId: recovery.attemptId,
        failureHash: recovery.failureHash,
      })
      scheduleAppManagedJourneyContinuation({ ...binding, expectedStateHash: issuance.expectedStateHash })
    }
    revalidatePath('/quality-journeys/' + request.journeyId)
    return { success: true }
  } catch (error) {
    if (error instanceof ServiceError) return serviceErrorToActionResponse(error)
    return { success: false, error: 'Couldn’t resume the criteria review. Refresh to check the current status.' }
  }
}
