import type { ConversationJourneyEvidenceRun } from '@/services/conversation/conversation-journey-evidence'

export function selectEvidenceStep(runs: readonly ConversationJourneyEvidenceRun[]) {
  const candidates = runs.flatMap(({ outcome, reportId, steps }) => {
    if (outcome === 'UNVERIFIED' || !reportId) return []
    return steps.filter(step => step.status === 'FAILED' || step.status === 'PASSED').map(step => ({ step, reportId }))
  })
  return candidates.find(({ step }) => step.status === 'FAILED') ?? candidates[0]
}
