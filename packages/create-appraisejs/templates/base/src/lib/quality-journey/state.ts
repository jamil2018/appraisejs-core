import { createHash } from 'node:crypto'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import type { QualityJourneyStage } from './contracts'

export type QualityJourneyStateHashInput = {
  journeyId: string
  targetProjectId: string
  stage: QualityJourneyStage
  activeCycleId: string
  activeRevisionIds: Readonly<Record<string, string>>
  /** Durable canonical Q&A identity; deliberately not an artifact revision ID. */
  analysisReviewHash?: string
  unresolvedQuestionIds: readonly string[]
  blockerIds: readonly string[]
  activeWorkItemIds: readonly string[]
  permittedCommands: readonly string[]
}

export function hashQualityJourneyState(input: QualityJourneyStateHashInput): string {
  const authoritativeProjection = {
    domain: 'appraise.quality-journey-state/v1',
    ...input,
    unresolvedQuestionIds: [...input.unresolvedQuestionIds].sort(),
    blockerIds: [...input.blockerIds].sort(),
    activeWorkItemIds: [...input.activeWorkItemIds].sort(),
    permittedCommands: [...input.permittedCommands].sort(),
  }
  return `sha256:${createHash('sha256').update(canonicalContractJson(authoritativeProjection)).digest('hex')}`
}
